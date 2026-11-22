'use strict';

const { StudentDAO } = require('../dao/StudentDAO');
const { NotFoundError } = require('../lib/appErrors');
const { parseListOptions, parseId } = require('../models/student');

/**
 * Бизнес-логика студентов: кэширование чтений (TTL), инвалидация при записи.
 * Каждый метод получает db (ctx.db) первым аргументом — сервис сам соединений не держит.
 * Возвращает { value, cacheHit } для чтений, чтобы контроллер мог выставить заголовок X-Cache.
 */
class StudentService {
  constructor({ cache, logger, daoFactory = (db) => new StudentDAO(db) }) {
    this.cache = cache;
    this.logger = logger;
    this.dao = daoFactory;
  }

  async _cached(key, loader) {
    const hit = this.cache.get(key);
    if (hit !== undefined) return { value: hit, cacheHit: true };
    const value = await loader();
    this.cache.set(key, value);
    return { value, cacheHit: false };
  }

  _invalidate(reason) {
    this.cache.clear();
    this.logger.op(`CACHE INVALIDATE (${reason})`);
  }

  async list(db, query) {
    const opts = parseListOptions(query); // валидируем до обращения к кэшу и БД
    return this._cached(`students:list:${JSON.stringify(opts)}`, () => this.dao(db).findAll(opts));
  }

  async getById(db, id) {
    const studentId = parseId(id);
    return this._cached(`students:id:${studentId}`, async () => {
      const student = await this.dao(db).findById(studentId);
      if (!student) throw new NotFoundError(`Студент ${studentId} не найден`);
      return student;
    });
  }

  async stats(db) {
    return this._cached('students:stats', () => this.dao(db).getStats());
  }

  async create(db, data) {
    const student = await this.dao(db).create(data);
    this._invalidate('create student');
    return student;
  }

  async update(db, id, data) {
    const student = await this.dao(db).update(id, data);
    if (!student) throw new NotFoundError(`Студент ${id} не найден`);
    this._invalidate('update student');
    return student;
  }

  async remove(db, id) {
    const ok = await this.dao(db).delete(id);
    if (!ok) throw new NotFoundError(`Студент ${id} не найден`);
    this._invalidate('delete student');
    return { deleted: parseId(id) };
  }

  async batchCreate(db, items) {
    const result = await this.dao(db).batchCreate(items);
    this._invalidate('batch create');
    return result;
  }
}

module.exports = { StudentService };
