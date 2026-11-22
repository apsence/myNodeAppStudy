'use strict';

/**
 * Модель пользователя (задание 1): валидация и операции с коллекцией users.
 * Значения из запроса попадают в MongoDB только после проверки типов (защита от NoSQL-инъекций).
 */
const { ApiError } = require('../errors');

const COLLECTION = 'users';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const GROUP_RE = /^ББМО-\d{2}-\d{2}$/;
const ALLOWED = ['name', 'email', 'group_name', 'age'];

const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isObjectId = (id) => typeof id === 'string' && /^[0-9a-fA-F]{24}$/.test(id);

/**
 * Валидация: name — обязательное, строка (2–100); email — обязательное, формат email;
 * group_name — обязательное, формат ББМО-XX-XX; age — целое от 16 до 100 (необязательное).
 * Возвращает { valid, errors: [{ field, message }], value }.
 */
function validateUser(data, { partial = false } = {}) {
  if (!isPlainObject(data)) {
    return { valid: false, errors: [{ field: '_body', message: 'тело запроса должно быть объектом' }], value: null };
  }
  const errors = [];
  const value = {};
  const fail = (field, message) => errors.push({ field, message });

  for (const key of Object.keys(data)) if (!ALLOWED.includes(key)) fail(key, 'неизвестное поле');

  if (data.name === undefined) {
    if (!partial) fail('name', 'обязательное поле');
  } else if (typeof data.name !== 'string') fail('name', 'должно быть строкой');
  else {
    const name = data.name.trim();
    const len = [...name].length;
    if (len < 2) fail('name', 'минимум 2 символа');
    else if (len > 100) fail('name', 'максимум 100 символов');
    else value.name = name;
  }

  if (data.email === undefined) {
    if (!partial) fail('email', 'обязательное поле');
  } else if (typeof data.email !== 'string' || !EMAIL_RE.test(data.email.trim())) fail('email', 'неверный формат');
  else value.email = data.email.trim().toLowerCase();

  if (data.group_name === undefined) {
    if (!partial) fail('group_name', 'обязательное поле');
  } else if (typeof data.group_name !== 'string' || !GROUP_RE.test(data.group_name.trim())) fail('group_name', 'неверный формат (ожидается ББМО-XX-XX)');
  else value.group_name = data.group_name.trim();

  if (data.age !== undefined) {
    const age = typeof data.age === 'string' && /^\d+$/.test(data.age) ? Number(data.age) : data.age; // form-urlencoded
    if (!Number.isInteger(age) || age < 16 || age > 100) fail('age', 'должно быть целым числом от 16 до 100');
    else value.age = age;
  }

  if (partial && errors.length === 0 && Object.keys(value).length === 0) fail('_body', 'нет полей для обновления');
  return { valid: errors.length === 0, errors, value };
}

const toApi = (doc) => (doc ? { ...doc, _id: String(doc._id) } : null);

function ensureValid(data, opts) {
  const r = validateUser(data, opts);
  if (!r.valid) throw new ApiError(400, 'Validation failed', r.errors);
  return r.value;
}

const duplicate = (err) => err && err.code === 11000;

async function list(db) {
  const docs = await db.collection(COLLECTION).find({}).sort({ created_at: -1 }).limit(100).toArray();
  return docs.map(toApi);
}

async function findById(db, id) {
  if (!isObjectId(id)) return null; // «999» — просто несуществующий пользователь, а не ошибка формата
  const { ObjectId } = require('mongodb');
  return toApi(await db.collection(COLLECTION).findOne({ _id: new ObjectId(id) }));
}

async function create(db, data) {
  const value = ensureValid(data);
  const now = new Date();
  const doc = { ...value, created_at: now, updated_at: now };
  try {
    const res = await db.collection(COLLECTION).insertOne(doc);
    return toApi({ ...doc, _id: res.insertedId });
  } catch (err) {
    if (duplicate(err)) throw new ApiError(409, 'Email already exists');
    throw err;
  }
}

async function update(db, id, data) {
  const value = ensureValid(data, { partial: true });
  if (!isObjectId(id)) return null;
  const { ObjectId } = require('mongodb');
  try {
    return toApi(
      await db.collection(COLLECTION).findOneAndUpdate(
        { _id: new ObjectId(id) },
        { $set: { ...value, updated_at: new Date() } },
        { returnDocument: 'after' }
      )
    );
  } catch (err) {
    if (duplicate(err)) throw new ApiError(409, 'Email already exists');
    throw err;
  }
}

async function remove(db, id) {
  if (!isObjectId(id)) return false;
  const { ObjectId } = require('mongodb');
  const res = await db.collection(COLLECTION).deleteOne({ _id: new ObjectId(id) });
  return res.deletedCount === 1;
}

module.exports = { COLLECTION, EMAIL_RE, GROUP_RE, isObjectId, validateUser, toApi, list, findById, create, update, remove };
