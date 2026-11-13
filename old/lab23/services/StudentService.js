'use strict';

const { GROUP } = require('../config/constants');
const { ValidationError, NotFoundError } = require('../utils/errors');

const SORT_FIELDS = ['name', 'grade', 'course', 'group_name', 'created_at'];
const MAX_LIMIT = 100;
const MAX_BATCH = 5000;

const parseIntParam = (raw, name, { min, max, def }) => {
  if (raw === undefined || raw === '') return def;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < min || n > max) throw new ValidationError([`параметр ${name} должен быть целым числом от ${min} до ${max}`]);
  return n;
};

/** Разбор query-параметров списка: пагинация, сортировка, фильтры. Чистая функция. */
function parseListQuery(query = {}) {
  const limit = parseIntParam(query.limit, 'limit', { min: 1, max: MAX_LIMIT, def: 10 });
  const offset = parseIntParam(query.offset, 'offset', { min: 0, max: 1e9, def: 0 });

  const sortField = query.sort === undefined ? 'created_at' : query.sort;
  if (!SORT_FIELDS.includes(sortField)) throw new ValidationError([`sort должен быть одним из: ${SORT_FIELDS.join(', ')}`]);
  const order = query.order === undefined ? 'desc' : String(query.order).toLowerCase();
  if (!['asc', 'desc'].includes(order)) throw new ValidationError(['order должен быть asc или desc']);

  const filter = {};
  if (query.group_name) filter.group_name = String(query.group_name);
  if (query.course !== undefined && query.course !== '') filter.course = parseIntParam(query.course, 'course', { min: 1, max: 6, def: undefined });
  const grade = {};
  if (query.min_grade !== undefined && query.min_grade !== '') {
    const v = Number(query.min_grade);
    if (!Number.isFinite(v)) throw new ValidationError(['min_grade должен быть числом']);
    grade.$gte = v;
  }
  if (query.max_grade !== undefined && query.max_grade !== '') {
    const v = Number(query.max_grade);
    if (!Number.isFinite(v)) throw new ValidationError(['max_grade должен быть числом']);
    grade.$lte = v;
  }
  if (Object.keys(grade).length) filter.grade = grade;

  return { filter, sort: { [sortField]: order === 'asc' ? 1 : -1 }, limit, offset };
}

/** Бизнес-логика: значения по умолчанию, кэширование чтений, инвалидация при записи. */
class StudentService {
  constructor({ dao, cache, logger }) {
    this.dao = dao;
    this.cache = cache;
    this.logger = logger;
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

  async list(query) {
    const opts = parseListQuery(query);
    return this._cached(`list:${JSON.stringify(opts)}`, async () => {
      const { data, total } = await this.dao.findAll(opts);
      return { data, pagination: { total, limit: opts.limit, offset: opts.offset } };
    });
  }

  async getById(id) {
    return this._cached(`id:${id}`, async () => {
      const doc = await this.dao.findById(id);
      if (!doc) throw new NotFoundError(`Студент ${id} не найден`);
      return doc;
    });
  }

  async create(data) {
    const payload = data && typeof data === 'object' && !Array.isArray(data) ? { group_name: GROUP, ...data } : data;
    const doc = await this.dao.create(payload);
    this._invalidate('create');
    return doc;
  }

  async update(id, data) {
    const doc = await this.dao.update(id, data);
    if (!doc) throw new NotFoundError(`Студент ${id} не найден`);
    this._invalidate('update');
    return doc;
  }

  async delete(id) {
    const ok = await this.dao.delete(id);
    if (!ok) throw new NotFoundError(`Студент ${id} не найден`);
    this._invalidate('delete');
    return { deleted: id };
  }

  async stats() {
    return this._cached('stats', () => this.dao.getStats());
  }

  async search(q, limitRaw) {
    const query = typeof q === 'string' ? q.trim() : '';
    if (!query) throw new ValidationError(['параметр q обязателен']);
    const limit = parseIntParam(limitRaw, 'limit', { min: 1, max: MAX_LIMIT, def: 20 });
    return this._cached(`search:${query}:${limit}`, () => this.dao.search(query, { limit }));
  }

  async batchCreate(items) {
    if (!Array.isArray(items)) throw new ValidationError(['тело запроса должно быть массивом объектов']);
    if (items.length > MAX_BATCH) throw new ValidationError([`в одном запросе не более ${MAX_BATCH} документов`]);
    const withDefaults = items.map((i) => (i && typeof i === 'object' && !Array.isArray(i) ? { group_name: GROUP, ...i } : i));
    const result = await this.dao.batchCreate(withDefaults);
    this._invalidate('batch');
    return result;
  }

  /** Вызывается Change Stream-ом: изменения, сделанные вне API, тоже сбрасывают кэш. */
  onExternalChange() {
    this.cache.clear();
  }
}

module.exports = { StudentService, parseListQuery, SORT_FIELDS };
