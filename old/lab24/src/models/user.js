'use strict';

const { validateUserData, isObjectId } = require('./validation');
const { ValidationError, ConflictError } = require('../utils/errors');
const { mapStats } = require('../utils/query');

const PUBLIC = { password_hash: 0 };
const ACTIVE = { deleted_at: { $exists: false } }; // мягкое удаление: «живые» записи не имеют поля deleted_at
const DELETED = { deleted_at: { $exists: true } };

const toApi = (doc) => {
  if (!doc) return null;
  const { password_hash: _hash, ...rest } = doc;
  return { ...rest, _id: String(doc._id) };
};

const oid = (id) => {
  const { ObjectId } = require('mongodb');
  return new ObjectId(id);
};

const duplicate = (err) => err && err.code === 11000;

/**
 * Слой моделей: весь синтаксис MongoDB инкапсулирован здесь.
 * Soft delete: DELETE ставит deleted_at, обычные запросы удалённых не видят, admin может восстановить.
 * Уникальность email сохраняется и для удалённых (повторная регистрация → 409, пока запись не восстановлена/удалена физически).
 */
class User {
  static db = null;
  static log = () => {};

  static init(db, { log } = {}) {
    User.db = db;
    if (log) User.log = log;
  }

  static get collection() {
    if (!User.db) throw new Error('User.init(db) не вызван');
    return User.db.collection('users');
  }

  static async ensureIndexes() {
    await User.collection.createIndex({ email: 1 }, { unique: true, name: 'email_unique' });
    await User.collection.createIndex(
      { name: 'text', email: 'text' },
      { name: 'users_text', default_language: 'russian', weights: { name: 10, email: 5 } }
    );
    await User.collection.createIndex({ group_name: 1, course: 1 }, { name: 'group_course' });
    await User.collection.createIndex({ deleted_at: 1 }, { name: 'deleted_at', sparse: true });
  }

  static validate(data, opts) {
    const r = validateUserData(data, opts);
    if (!r.valid) throw new ValidationError(r.errors);
    return r.value;
  }

  static async findAll({ filter = {}, sort = { created_at: -1 }, skip = 0, limit = 10, scored = false, onlyDeleted = false } = {}) {
    User.log('find');
    const projection = scored ? { ...PUBLIC, score: { $meta: 'textScore' } } : PUBLIC;
    const docs = await User.collection
      .find({ ...filter, ...(onlyDeleted ? DELETED : ACTIVE) }, { projection })
      .sort({ ...sort, _id: 1 })
      .skip(skip)
      .limit(limit)
      .toArray();
    return docs.map(toApi);
  }

  static async count(filter = {}, { onlyDeleted = false } = {}) {
    User.log('countDocuments');
    return User.collection.countDocuments({ ...filter, ...(onlyDeleted ? DELETED : ACTIVE) });
  }

  static async search(q, limit = 20) {
    User.log('find ($text)');
    const filter = { $text: { $search: q }, ...ACTIVE };
    const [docs, found] = await Promise.all([
      User.collection.find(filter, { projection: { ...PUBLIC, score: { $meta: 'textScore' } }, sort: { score: { $meta: 'textScore' } }, limit }).toArray(),
      User.collection.countDocuments(filter),
    ]);
    return { found, data: docs.map(toApi) };
  }

  static async stats() {
    User.log('aggregate');
    const [facet] = await User.collection
      .aggregate([
        { $match: ACTIVE },
        {
          $facet: {
            overall: [{ $group: { _id: null, total: { $sum: 1 }, avgAge: { $avg: '$age' } } }],
            byGroup: [{ $group: { _id: '$group_name', count: { $sum: 1 } } }, { $sort: { _id: 1 } }],
            byCourse: [{ $match: { course: { $exists: true } } }, { $group: { _id: '$course', count: { $sum: 1 } } }, { $sort: { _id: 1 } }],
          },
        },
      ])
      .toArray();
    return mapStats(facet);
  }

  static stream(filter = {}, sort = { created_at: -1 }) {
    User.log('find (stream)');
    const cursor = User.collection.find({ ...filter, ...ACTIVE }, { projection: PUBLIC }).sort({ ...sort, _id: 1 }).batchSize(500);
    return (async function* rows() {
      for await (const doc of cursor) yield toApi(doc);
    })();
  }

  static async findById(id) {
    if (!isObjectId(id)) return null;
    User.log('findOne (by _id)');
    return toApi(await User.collection.findOne({ _id: oid(id), ...ACTIVE }, { projection: PUBLIC }));
  }

  static async findByEmail(email, { withPassword = false } = {}) {
    if (typeof email !== 'string') return null; // объект { $gt: '' } в запрос не попадёт
    User.log('findOne (by email)');
    const doc = await User.collection.findOne({ email: email.trim().toLowerCase(), ...ACTIVE }, { projection: withPassword ? {} : PUBLIC });
    return withPassword && doc ? { ...toApi(doc), password_hash: doc.password_hash } : toApi(doc);
  }

  /** Какие из переданных email уже есть в БД (включая удалённых) — для импорта. */
  static async findEmails(emails) {
    const clean = emails.filter((e) => typeof e === 'string');
    if (!clean.length) return new Set();
    const docs = await User.collection.find({ email: { $in: clean } }, { projection: { email: 1 } }).toArray();
    return new Set(docs.map((d) => d.email));
  }

  static async create(data) {
    const value = User.validate(data);
    const now = new Date();
    const doc = { role: 'user', ...value, created_at: now, updated_at: now };
    User.log('insertOne');
    try {
      const res = await User.collection.insertOne(doc);
      return toApi({ ...doc, _id: res.insertedId });
    } catch (err) {
      if (duplicate(err)) throw new ConflictError();
      throw err;
    }
  }

  /** Массовая вставка (импорт); дубликаты не прерывают остальные записи (ordered: false). Возвращает число вставленных. */
  static async insertMany(items) {
    const now = new Date();
    const docs = items.map((v) => ({ role: 'user', ...User.validate(v), created_at: now, updated_at: now }));
    User.log('insertMany');
    try {
      return (await User.collection.insertMany(docs, { ordered: false })).insertedCount;
    } catch (err) {
      if (duplicate(err)) return (err.result && err.result.insertedCount) || err.insertedCount || 0;
      throw err;
    }
  }

  static async update(id, data) {
    const value = User.validate(data, { partial: true });
    if (!isObjectId(id)) return null;
    User.log('findOneAndUpdate');
    try {
      return toApi(
        await User.collection.findOneAndUpdate(
          { _id: oid(id), ...ACTIVE },
          { $set: { ...value, updated_at: new Date() } },
          { returnDocument: 'after', projection: PUBLIC }
        )
      );
    } catch (err) {
      if (duplicate(err)) throw new ConflictError();
      throw err;
    }
  }

  static async setRole(id, role) {
    if (!isObjectId(id)) return null;
    User.validate({ role }, { partial: true });
    User.log('findOneAndUpdate (role)');
    return toApi(await User.collection.findOneAndUpdate({ _id: oid(id), ...ACTIVE }, { $set: { role, updated_at: new Date() } }, { returnDocument: 'after', projection: PUBLIC }));
  }

  /** Устанавливает аватар и возвращает { user, previous } (имя прежнего файла — чтобы удалить его с диска). */
  static async setAvatar(id, filename) {
    if (!isObjectId(id)) return null;
    User.log('findOneAndUpdate (avatar)');
    const before = await User.collection.findOne({ _id: oid(id), ...ACTIVE }, { projection: { avatar: 1 } });
    if (!before) return null;
    const user = toApi(await User.collection.findOneAndUpdate({ _id: oid(id) }, { $set: { avatar: filename, updated_at: new Date() } }, { returnDocument: 'after', projection: PUBLIC }));
    return { user, previous: before.avatar || null };
  }

  /** Мягкое удаление. */
  static async delete(id) {
    if (!isObjectId(id)) return false;
    User.log('findOneAndUpdate (soft delete)');
    const res = await User.collection.findOneAndUpdate({ _id: oid(id), ...ACTIVE }, { $set: { deleted_at: new Date() } }, { returnDocument: 'after', projection: { _id: 1 } });
    return Boolean(res);
  }

  static async restore(id) {
    if (!isObjectId(id)) return null;
    User.log('findOneAndUpdate (restore)');
    return toApi(await User.collection.findOneAndUpdate({ _id: oid(id), ...DELETED }, { $unset: { deleted_at: '' }, $set: { updated_at: new Date() } }, { returnDocument: 'after', projection: PUBLIC }));
  }
}

module.exports = { User, toApi, ACTIVE };
