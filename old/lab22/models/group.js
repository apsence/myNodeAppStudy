'use strict';

const { GROUP_REGEX } = require('../config/constants');

/** Валидация группы: name в формате ББМО-XX-XX, curator необязателен (до 100 символов). */
function validateGroup(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return { valid: false, errors: ['тело запроса должно быть объектом'], value: null };
  }
  const errors = [];
  for (const key of Object.keys(data)) if (!['name', 'curator'].includes(key)) errors.push(`неизвестное поле ${key}`);
  const name = typeof data.name === 'string' ? data.name.trim() : data.name;
  const curator = typeof data.curator === 'string' ? data.curator.trim() : data.curator;

  if (!name) errors.push('name обязательно');
  else if (typeof name !== 'string' || !GROUP_REGEX.test(name)) errors.push('name не соответствует формату ББМО-XX-XX');
  if (curator !== undefined && curator !== null && (typeof curator !== 'string' || [...curator].length > 100)) {
    errors.push('curator должен быть строкой до 100 символов');
  }
  return { valid: errors.length === 0, errors, value: { name, curator: curator || null } };
}

module.exports = { validateGroup };
