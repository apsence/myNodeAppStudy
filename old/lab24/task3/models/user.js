'use strict';

const { validateUserData, isObjectId } = require('./validation');
const { ValidationError, ConflictError } = require('../utils/errors');
const { mapStats } = require('../utils/query');

const toApi = (doc) => {
  if (!doc) return null;
  const { password_hash: _hash, ...rest } = doc; // хэш пароля никогда не покидает слой модели
  return { ...rest, _id: String(doc._id) };
};

const PUBLIC = { password_hash: 0 };

const oid = (id) => {
  const { ObjectId } = require('mongodb');
  return new ObjectId(id);
};

/**
 * Слой моделей: ВЕСЬ синтаксис MongoDB (коллекции, фильтры, ObjectId) инкапсулирован здесь.
 * Чтобы сменить СУБД, достаточно переписать этот класс — сервисы и контроллеры не изменятся.
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
    // текстовый индекс для поиска по имени и email (имя важнее — больший вес при ранжировании)
    await User.collection.createIndex(
      { name: 'text', email: 'text' },
      { name: 'users_text', default_language: 'russian', weights: { name: 10, email: 5 } }
    );
    await User.collection.createIndex({ group_name: 1, course: 1 }, { name: 'group_course' });
  }

  static validate(data, opts) {
    const r = validateUserData(data, opts);
    if (!r.valid) throw new ValidationError(r.errors);
    return r.value;
  }

  /** Список: фильтр, сортировка, пагинация. scored=true добавляет поле score (релевантность текстового поиска). */
  static async findAll({ filter = {}, sort = { created_at: -1 }, skip = 0, limit = 10, scored = false } = {}) {
    User.log('find');
    const projection = scored ? { ...PUBLIC, score: { $meta: 'textScore' } } : PUBLIC;
    const docs = await User.collection
      .find(filter, { projection })
      .sort({ ...sort, _id: 1 }) // _id — для стабильного порядка страниц
      .skip(skip)
      .limit(limit)
      .toArray();
    return docs.map(toApi);
  }

  static async count(filter = {}) {
    User.log('countDocuments');
    return User.collection.countDocuments(filter);
  }

  /** Полнотекстовый поиск с ранжированием по релевантности. */
  static async search(q, limit = 20) {
    User.log('find ($text)');
    const filter = { $text: { $search: q } };
    const [docs, found] = await Promise.all([
      User.collection
        .find(filter, { projection: { ...PUBLIC, score: { $meta: 'textScore' } }, sort: { score: { $meta: 'textScore' } }, limit })
        .toArray(),
      User.collection.countDocuments(filter),
    ]);
    return { found, data: docs.map(toApi) };
  }

  /** Статистика одним проходом ($facet): общее число, средний возраст, по группам и курсам. */
  static async stats() {
    User.log('aggregate');
    const [facet] = await User.collection
      .aggregate([
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

  /** Асинхронный итератор пользователей — для потокового экспорта без загрузки всей коллекции в память. */
  static stream(filter = {}, sort = { created_at: -1 }) {
    User.log('find (stream)');
    const cursor = User.collection.find(filter, { projection: PUBLIC }).sort({ ...sort, _id: 1 }).batchSize(500);
    return (async function* rows() {
      for await (const doc of cursor) yield toApi(doc);
    })();
  }

  static async findById(id) {
    if (!isObjectId(id)) return null;
    User.log('findOne (by _id)');
    return toApi(await User.collection.findOne({ _id: oid(id) }, { projection: PUBLIC }));
  }

  static async findByEmail(email) {
    if (typeof email !== 'string') return null; // объект вроде { $gt: '' } не должен попасть в запрос
    User.log('findOne (by email)');
    return toApi(await User.collection.findOne({ email: email.trim().toLowerCase() }, { projection: PUBLIC }));
  }

  static async create(data) {
    const value = User.validate(data);
    const now = new Date();
    const doc = { ...value, created_at: now, updated_at: now };
    User.log('insertOne');
    try {
      const res = await User.collection.insertOne(doc);
      return toApi({ ...doc, _id: res.insertedId });
    } catch (err) {
      if (err && err.code === 11000) throw new ConflictError();
      throw err;
    }
  }

  static async update(id, data) {
    const value = User.validate(data, { partial: true });
    if (!isObjectId(id)) return null;
    User.log('findOneAndUpdate');
    try {
      return toApi(
        await User.collection.findOneAndUpdate({ _id: oid(id) }, { $set: { ...value, updated_at: new Date() } }, { returnDocument: 'after' })
      );
    } catch (err) {
      if (err && err.code === 11000) throw new ConflictError();
      throw err;
    }
  }

  static async delete(id) {
    if (!isObjectId(id)) return false;
    User.log('deleteOne');
    return (await User.collection.deleteOne({ _id: oid(id) })).deletedCount === 1;
  }
}

module.exports = { User, toApi };
