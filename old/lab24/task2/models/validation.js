'use strict';

/** Валидация на уровне модели: последний рубеж перед записью в БД (HTTP-слой проверяет Joi). */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const GROUP_RE = /^ББМО-\d{2}-\d{2}$/;
const ALLOWED = ['name', 'email', 'group_name', 'age', 'course', 'password_hash'];

const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isObjectId = (id) => typeof id === 'string' && /^[0-9a-fA-F]{24}$/.test(id);

function validateUserData(data, { partial = false } = {}) {
  if (!isPlainObject(data)) {
    return { valid: false, errors: [{ field: '_body', message: 'тело запроса должно быть объектом' }], value: null };
  }
  const errors = [];
  const value = {};
  const fail = (field, message) => errors.push({ field, message });
  for (const key of Object.keys(data)) if (!ALLOWED.includes(key)) fail(key, 'неизвестное поле');

  if (data.name === undefined) { if (!partial) fail('name', 'обязательное поле'); }
  else if (typeof data.name !== 'string') fail('name', 'должно быть строкой');
  else {
    const name = data.name.trim();
    const len = [...name].length;
    if (len < 2) fail('name', 'минимум 2 символа');
    else if (len > 100) fail('name', 'максимум 100 символов');
    else value.name = name;
  }

  if (data.email === undefined) { if (!partial) fail('email', 'обязательное поле'); }
  else if (typeof data.email !== 'string' || !EMAIL_RE.test(data.email.trim())) fail('email', 'неверный формат');
  else value.email = data.email.trim().toLowerCase();

  if (data.group_name === undefined) { if (!partial) fail('group_name', 'обязательное поле'); }
  else if (typeof data.group_name !== 'string' || !GROUP_RE.test(data.group_name.trim())) fail('group_name', 'неверный формат (ожидается ББМО-XX-XX)');
  else value.group_name = data.group_name.trim();

  if (data.age !== undefined) {
    if (!Number.isInteger(data.age) || data.age < 16 || data.age > 100) fail('age', 'должно быть целым числом от 16 до 100');
    else value.age = data.age;
  }
  if (data.course !== undefined) {
    if (!Number.isInteger(data.course) || data.course < 1 || data.course > 4) fail('course', 'должно быть целым числом от 1 до 4');
    else value.course = data.course;
  }
  if (data.password_hash !== undefined) {
    if (typeof data.password_hash !== 'string' || data.password_hash.length < 20) fail('password_hash', 'некорректный хэш');
    else value.password_hash = data.password_hash;
  }
  if (partial && errors.length === 0 && Object.keys(value).length === 0) fail('_body', 'нет полей для обновления');
  return { valid: errors.length === 0, errors, value };
}

module.exports = { EMAIL_RE, GROUP_RE, isObjectId, validateUserData };
