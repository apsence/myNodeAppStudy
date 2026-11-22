'use strict';

const { Readable } = require('node:stream');
const { NotFoundError, ConflictError } = require('../utils/errors');
const { parseSort, buildFilter, toSkip, paginate } = require('../utils/query');
const { csvChunks } = require('../utils/csv');

/**
 * Слой сервисов: бизнес-логика. Зависимости передаются в конструктор (DI) — сервис легко тестировать
 * с поддельными User/mailer/hasher, без MongoDB.
 */
class UserService {
  constructor({ User, mailer, hasher, logger }) {
    this.User = User;
    this.mailer = mailer;
    this.hasher = hasher;
    this.log = logger.service;
  }

  /** Список с пагинацией, фильтрами, сортировкой и поиском. query уже проверен и нормализован Joi. */
  async list(query = {}) {
    const { page = 1, limit = 10, sort, ...filters } = query;
    this.log(`Список пользователей: page=${page}, limit=${limit}`);
    const filter = buildFilter(filters);
    const hasSearch = filters.search !== undefined;
    // без явной сортировки поиск ранжируется по релевантности, обычный список — по дате (новые сверху)
    const sortSpec = sort ? parseSort(sort) : hasSearch ? { score: { $meta: 'textScore' } } : parseSort();
    const [data, total] = await Promise.all([
      this.User.findAll({ filter, sort: sortSpec, skip: toSkip(page, limit), limit, scored: hasSearch }),
      this.User.count(filter),
    ]);
    return { data, pagination: paginate({ page, limit, total }) };
  }

  async search({ q, limit = 20 }) {
    this.log(`Поиск: ${q}`);
    return this.User.search(q, limit);
  }

  async stats() {
    this.log('Статистика');
    return this.User.stats();
  }

  /** Экспорт в CSV: возвращает Readable (поток) — данные не копятся в памяти. */
  exportCsv(query = {}) {
    this.log('Экспорт в CSV');
    const { sort, ...filters } = query;
    return Readable.from(csvChunks(this.User.stream(buildFilter(filters), parseSort(sort))));
  }

  async getById(id) {
    const user = await this.User.findById(id);
    if (!user) throw new NotFoundError();
    return user;
  }

  /** Проверка уникальности email: в update исключаем самого пользователя. */
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
    if (password) data.password_hash = await this.hasher.hash(password); // пароль в открытом виде не хранится
    const user = await this.User.create(data);
    await this.mailer.sendWelcome(user);
    this.log(`Email отправлен: ${user.email}`);
    return user;
  }

  async update(id, input) {
    const { password, ...data } = input;
    this.log(`Обновление пользователя: ${id}`);
    if (data.email) await this.assertEmailFree(data.email, id);
    if (password) data.password_hash = await this.hasher.hash(password);
    const user = await this.User.update(id, data);
    if (!user) throw new NotFoundError();
    return user;
  }

  async delete(id) {
    this.log(`Удаление пользователя: ${id}`);
    if (!(await this.User.delete(id))) throw new NotFoundError();
    return { deleted: id };
  }
}

module.exports = { UserService };
