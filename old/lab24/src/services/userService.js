'use strict';

const { Readable } = require('node:stream');
const { NotFoundError, ConflictError, ValidationError } = require('../utils/errors');
const { parseSort, buildFilter, toSkip, paginate } = require('../utils/query');
const { csvChunks, jsonChunks } = require('../utils/csv');
const { validateUserData } = require('../models/validation');

const IMPORT_FIELDS = ['name', 'email', 'group_name', 'age', 'course'];
const MAX_IMPORT = 1000;

/**
 * Бизнес-логика пользователей. Зависимости передаются снаружи (DI): модель, почта, хэширование,
 * шина событий (WebSocket-уведомления), хранилище файлов, отзыв сессий.
 */
class UserService {
  constructor({ User, mailer, hasher, logger, bus = null, uploads = null, revokeSessions = async () => {} }) {
    this.User = User;
    this.mailer = mailer;
    this.hasher = hasher;
    this.log = logger.service;
    this.bus = bus;
    this.uploads = uploads;
    this.revokeSessions = revokeSessions;
  }

  _publish(type, id) {
    if (this.bus) this.bus.publishUser(type, id);
  }

  async list(query = {}) {
    const { page = 1, limit = 10, sort, deleted, ...filters } = query;
    this.log(`Список пользователей: page=${page}, limit=${limit}${deleted ? ', deleted=only' : ''}`);
    const filter = buildFilter(filters);
    const hasSearch = filters.search !== undefined;
    const sortSpec = sort ? parseSort(sort) : hasSearch ? { score: { $meta: 'textScore' } } : parseSort();
    const onlyDeleted = deleted === 'only';
    const [data, total] = await Promise.all([
      this.User.findAll({ filter, sort: sortSpec, skip: toSkip(page, limit), limit, scored: hasSearch, onlyDeleted }),
      this.User.count(filter, { onlyDeleted }),
    ]);
    return { data, pagination: paginate({ page, limit, total }) };
  }

  async search({ q, limit = 20 }) {
    this.log(`Поиск: ${q}`);
    return this.User.search(q, limit);
  }

  async stats() {
    return this.User.stats();
  }

  /** Экспорт потоком: format = 'csv' | 'json'. Возвращает { stream, format }. */
  exportStream(query = {}) {
    const { sort, format = 'csv', ...filters } = query;
    this.log(`Экспорт (${format})`);
    const rows = this.User.stream(buildFilter(filters), parseSort(sort));
    return { stream: Readable.from(format === 'json' ? jsonChunks(rows) : csvChunks(rows)), format };
  }

  async getById(id) {
    const user = await this.User.findById(id);
    if (!user) throw new NotFoundError();
    return user;
  }

  async assertEmailFree(email, exceptId = null) {
    this.log('Проверка уникальности email');
    const existing = await this.User.findByEmail(email);
    if (existing && existing._id !== exceptId) {
      this.log('Email уже существует');
      throw new ConflictError();
    }
  }

  async create(input) {
    const { password, ...data } = input;
    this.log(`Создание пользователя: ${data.email}`);
    await this.assertEmailFree(data.email);
    if (password) data.password_hash = await this.hasher.hash(password);
    const user = await this.User.create(data);
    await this.mailer.sendWelcome(user);
    this._publish('created', user._id);
    return user;
  }

  async update(id, input) {
    const { password, ...data } = input;
    if (data.email) await this.assertEmailFree(data.email, id);
    if (password) data.password_hash = await this.hasher.hash(password);
    const user = await this.User.update(id, data);
    if (!user) throw new NotFoundError();
    this._publish('updated', user._id);
    return user;
  }

  /** Мягкое удаление: запись остаётся в БД с deleted_at, сессии пользователя отзываются. */
  async delete(id) {
    this.log(`Удаление пользователя (soft delete): ${id}`);
    if (!(await this.User.delete(id))) throw new NotFoundError();
    await this.revokeSessions(id);
    this._publish('deleted', id);
    return { deleted: id };
  }

  async restore(id) {
    const user = await this.User.restore(id);
    if (!user) throw new NotFoundError('Deleted user not found');
    this._publish('restored', user._id);
    return user;
  }

  async setRole(id, role) {
    const user = await this.User.setRole(id, role);
    if (!user) throw new NotFoundError();
    this._publish('updated', user._id);
    return user;
  }

  /** Аватар: содержимое файла проверяется по сигнатуре, старый файл удаляется. */
  async setAvatar(id, filename) {
    if (!(await this.uploads.verify(filename))) {
      await this.uploads.remove(filename);
      throw new ValidationError([{ field: 'avatar', message: 'файл не является изображением png/jpeg/webp' }]);
    }
    const result = await this.User.setAvatar(id, filename);
    if (!result) {
      await this.uploads.remove(filename);
      throw new NotFoundError();
    }
    await this.uploads.remove(result.previous);
    this._publish('updated', id);
    return result.user;
  }

  /** Импорт массива пользователей (до 1000). Возвращает { received, inserted, skipped: [{ index, email?, reason }] }. */
  async importUsers(items) {
    if (!Array.isArray(items) || items.length === 0) throw new ValidationError([{ field: '_body', message: 'ожидается непустой массив' }]);
    if (items.length > MAX_IMPORT) throw new ValidationError([{ field: '_body', message: `не более ${MAX_IMPORT} записей за раз` }]);

    const skipped = [];
    const candidates = [];
    const seen = new Set();
    items.forEach((raw, index) => {
      const extra = raw && typeof raw === 'object' ? Object.keys(raw).filter((k) => !IMPORT_FIELDS.includes(k)) : [];
      if (extra.length) return skipped.push({ index, reason: `недопустимые поля: ${extra.join(', ')}` });
      const r = validateUserData(raw);
      if (!r.valid) return skipped.push({ index, reason: r.errors.map((e) => `${e.field}: ${e.message}`).join('; ') });
      if (seen.has(r.value.email)) return skipped.push({ index, email: r.value.email, reason: 'дубликат внутри файла' });
      seen.add(r.value.email);
      candidates.push({ index, value: r.value });
    });

    const existing = await this.User.findEmails(candidates.map((c) => c.value.email));
    const toInsert = [];
    for (const c of candidates) {
      if (existing.has(c.value.email)) skipped.push({ index: c.index, email: c.value.email, reason: 'email уже существует' });
      else toInsert.push(c.value);
    }
    const inserted = toInsert.length ? await this.User.insertMany(toInsert) : 0;
    this.log(`Импорт: получено ${items.length}, добавлено ${inserted}, пропущено ${skipped.length}`);
    if (inserted) this._publish('imported', 'bulk');
    return { received: items.length, inserted, skipped: skipped.sort((a, b) => a.index - b.index) };
  }
}

module.exports = { UserService, IMPORT_FIELDS, MAX_IMPORT };
