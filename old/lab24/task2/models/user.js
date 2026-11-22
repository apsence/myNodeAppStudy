'use strict';

const { validateUserData, isObjectId } = require('./validation');
const { ValidationError, ConflictError } = require('../utils/errors');

const toApi = (doc) => {
  if (!doc) return null;
  const { password_hash: _hash, ...rest } = doc; // хэш пароля никогда не покидает слой модели
  return { ...rest, _id: String(doc._id) };
};

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
  }

  static validate(data, opts) {
    const r = validateUserData(data, opts);
    if (!r.valid) throw new ValidationError(r.errors);
    return r.value;
  }

  static async findAll({ skip = 0, limit = 100, sort = { created_at: -1 } } = {}) {
    User.log('find');
    const docs = await User.collection.find({}).sort(sort).skip(skip).limit(limit).toArray();
    return docs.map(toApi);
  }

  static async findById(id) {
    if (!isObjectId(id)) return null;
    User.log('findOne (by _id)');
    return toApi(await User.collection.findOne({ _id: oid(id) }));
  }

  static async findByEmail(email) {
    if (typeof email !== 'string') return null; // объект вроде { $gt: '' } не должен попасть в запрос
    User.log('findOne (by email)');
    return toApi(await User.collection.findOne({ email: email.trim().toLowerCase() }));
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
