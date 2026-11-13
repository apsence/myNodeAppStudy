'use strict';

const { performance } = require('node:perf_hooks');
const { ObjectId } = require('mongodb');
const { COLLECTIONS } = require('../config/constants');
const { validateStudentInput, buildDocument } = require('../models/student');
const { ValidationError } = require('../utils/errors');
const { isHexObjectId } = require('../utils/common');

const round2 = (n) => Math.round(n * 100) / 100;

/** Data Access Object для коллекции students. Бизнес-логики (кэш, значения по умолчанию) здесь нет. */
class StudentDAO {
  constructor({ database, logger, metrics }) {
    this.database = database;
    this.logger = logger;
    this.metrics = metrics;
  }

  get collection() {
    return this.database.db.collection(COLLECTIONS.students);
  }

  /** Замер времени + запись в лог и метрики. */
  async _timed(label, fn) {
    const t0 = performance.now();
    try {
      return await fn();
    } finally {
      const ms = performance.now() - t0;
      this.logger.op(`${label} (${ms.toFixed(1)}ms)`);
      this.metrics.recordDbOp(label.split(' ')[0], ms);
    }
  }

  static toObjectId(id) {
    if (!isHexObjectId(id)) throw new ValidationError(['некорректный идентификатор (ожидается 24 hex-символа)']);
    return new ObjectId(id);
  }

  async create(data) {
    const { valid, errors, value } = validateStudentInput(data);
    if (!valid) throw new ValidationError(errors);
    const doc = buildDocument(value);
    await this._timed('insertOne students', () => this.collection.insertOne(doc)); // insertOne добавляет _id в doc
    return doc;
  }

  async findById(id) {
    const _id = StudentDAO.toObjectId(id);
    return this._timed('findOne students', () => this.collection.findOne({ _id }));
  }

  /** Список с фильтром, сортировкой и пагинацией. _id в сортировке делает порядок стабильным. */
  async findAll({ filter = {}, sort = { created_at: -1 }, limit = 10, offset = 0 } = {}) {
    return this._timed('find students', async () => {
      const [data, total] = await Promise.all([
        this.collection.find(filter).sort({ ...sort, _id: 1 }).skip(offset).limit(limit).toArray(),
        this.collection.countDocuments(filter),
      ]);
      return { data, total };
    });
  }

  async update(id, data) {
    const _id = StudentDAO.toObjectId(id);
    const { valid, errors, value } = validateStudentInput(data, { partial: true });
    if (!valid) throw new ValidationError(errors);
    return this._timed('findOneAndUpdate students', () =>
      this.collection.findOneAndUpdate(
        { _id },
        { $set: { ...value, updated_at: new Date() } },
        { returnDocument: 'after' }
      )
    );
  }

  async delete(id) {
    const _id = StudentDAO.toObjectId(id);
    const res = await this._timed('deleteOne students', () => this.collection.deleteOne({ _id }));
    return res.deletedCount === 1;
  }

  /** Полнотекстовый поиск с ранжированием по релевантности (textScore). */
  async search(q, { limit = 20 } = {}) {
    return this._timed('text-search students', async () => {
      const filter = { $text: { $search: q } };
      const [data, found] = await Promise.all([
        this.collection
          .find(filter, {
            projection: { name: 1, group_name: 1, grade: 1, score: { $meta: 'textScore' } },
            sort: { score: { $meta: 'textScore' } },
            limit,
          })
          .toArray(),
        this.collection.countDocuments(filter),
      ]);
      return { found, data };
    });
  }

  /** Агрегация: общая статистика, по группам и по курсам (один проход через $facet). */
  async getStats() {
    return this._timed('aggregate students', async () => {
      const [res] = await this.collection
        .aggregate([
          {
            $facet: {
              overall: [{ $group: { _id: null, total: { $sum: 1 }, avg: { $avg: '$grade' } } }],
              byGroup: [{ $group: { _id: '$group_name', count: { $sum: 1 } } }, { $sort: { _id: 1 } }],
              byCourse: [{ $group: { _id: '$course', count: { $sum: 1 } } }, { $sort: { _id: 1 } }],
            },
          },
        ])
        .toArray();
      const overall = res.overall[0] || { total: 0, avg: null };
      return {
        total: overall.total,
        averageGrade: overall.avg === null ? null : round2(overall.avg),
        byGroup: Object.fromEntries(res.byGroup.map((g) => [g._id, g.count])),
        byCourse: Object.fromEntries(res.byCourse.map((c) => [String(c._id), c.count])),
      };
    });
  }

  /**
   * Массовая вставка в транзакции: всё или ничего.
   * Без реплика-сета (standalone) транзакции недоступны — тогда обычный insertMany.
   */
  async batchCreate(items) {
    if (!Array.isArray(items) || items.length === 0) {
      throw new ValidationError(['тело запроса должно быть непустым массивом объектов']);
    }
    const problems = [];
    const docs = [];
    items.forEach((item, index) => {
      const r = validateStudentInput(item);
      if (r.valid) docs.push(buildDocument(r.value));
      else problems.push({ index, errors: r.errors });
    });
    if (problems.length) throw new ValidationError(problems, 'Ошибка валидации массива (ничего не вставлено)');

    if (!this.database.transactionsSupported) {
      const res = await this._timed('insertMany students', () => this.collection.insertMany(docs));
      return { inserted: res.insertedCount, transaction: 'unsupported (standalone MongoDB)' };
    }

    const session = this.database.client.startSession();
    try {
      this.logger.op('BEGIN TRANSACTION');
      session.startTransaction({ readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } });
      const res = await this._timed('insertMany students', () => this.collection.insertMany(docs, { session }));
      await session.commitTransaction();
      this.logger.op('COMMIT');
      return { inserted: res.insertedCount, transaction: 'committed' };
    } catch (err) {
      this.logger.op('ROLLBACK (abortTransaction)');
      if (session.inTransaction()) await session.abortTransaction().catch(() => {});
      err.transaction = 'aborted';
      throw err;
    } finally {
      await session.endSession();
    }
  }
}

module.exports = { StudentDAO };
