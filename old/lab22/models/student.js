'use strict';

const { GROUP_REGEX } = require('../config/constants');
const { ValidationError } = require('../lib/appErrors');

const FIELDS = ['name', 'group_name', 'course', 'grade'];
const SORT_COLUMNS = { name: 'name', grade: 'grade', created_at: 'created_at' };
const MAX_LIMIT = 100;

const round2 = (n) => Math.round(n * 100) / 100;

/**
 * Валидация студента.
 *  name — обязательное, 2–100 символов; group_name — обязательное, формат ББМО-XX-XX;
 *  course — целое 1–4; grade — число 0–5 или NULL.
 * partial=true — для обновления (обязательных полей нет).
 * Возвращает { valid, errors, value }; value содержит только известные поля, строки обрезаны.
 */
function validateStudent(data, { partial = false } = {}) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return { valid: false, errors: ['тело запроса должно быть объектом'], value: null };
  }
  const errors = [];
  const value = {};
  for (const key of Object.keys(data)) {
    if (FIELDS.includes(key)) value[key] = typeof data[key] === 'string' ? data[key].trim() : data[key];
    else errors.push(`неизвестное поле ${key}`);
  }

  if (value.name !== undefined || !partial) {
    const len = typeof value.name === 'string' ? [...value.name].length : -1;
    if (value.name === undefined || value.name === null || value.name === '') errors.push('name обязательно');
    else if (typeof value.name !== 'string') errors.push('name должно быть строкой');
    else if (len < 2) errors.push('name слишком короткое (мин. 2 символа)');
    else if (len > 100) errors.push('name слишком длинное (макс. 100 символов)');
  }

  if (value.group_name !== undefined || !partial) {
    if (value.group_name === undefined || value.group_name === null || value.group_name === '') errors.push('group_name обязательно');
    else if (typeof value.group_name !== 'string' || !GROUP_REGEX.test(value.group_name)) errors.push('group_name не соответствует формату ББМО-XX-XX');
  }

  if (value.course !== undefined || !partial) {
    if (value.course === undefined || value.course === null) errors.push('course обязательно');
    else if (!Number.isInteger(value.course) || value.course < 1 || value.course > 4) errors.push('course должен быть целым числом от 1 до 4');
  }

  if (value.grade !== undefined && value.grade !== null) {
    if (typeof value.grade !== 'number' || !Number.isFinite(value.grade) || value.grade < 0 || value.grade > 5) {
      errors.push('grade должна быть числом от 0 до 5 (или NULL)');
    } else {
      value.grade = round2(value.grade); // DECIMAL(3,2): две цифры после запятой
    }
  }

  if (partial && Object.keys(value).length === 0 && errors.length === 0) errors.push('нет полей для обновления');
  return { valid: errors.length === 0, errors, value };
}

const present = (v) => v !== undefined && v !== null && v !== '';

function intParam(raw, name, { min, max, def }) {
  if (!present(raw)) return def;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < min || n > max) throw new ValidationError([`${name} должен быть целым числом от ${min} до ${max}`]);
  return n;
}

function numParam(raw, name) {
  if (!present(raw)) return undefined;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0 || n > 5) throw new ValidationError([`${name} должен быть числом от 0 до 5`]);
  return n;
}

/**
 * Разбор параметров списка (из query-строки или из кода):
 * limit (по умолчанию 10), offset (0), group_name, course, grade_min, grade_max,
 * sortBy: name | grade | created_at, order: asc | desc.
 */
function parseListOptions(raw = {}) {
  const limit = intParam(raw.limit, 'limit', { min: 1, max: MAX_LIMIT, def: 10 });
  const offset = intParam(raw.offset, 'offset', { min: 0, max: 1e9, def: 0 });

  const sortBy = present(raw.sortBy ?? raw.sort) ? raw.sortBy ?? raw.sort : 'created_at';
  if (!(sortBy in SORT_COLUMNS)) throw new ValidationError([`sortBy должен быть одним из: ${Object.keys(SORT_COLUMNS).join(', ')}`]);
  const order = present(raw.order) ? String(raw.order).toLowerCase() : 'asc';
  if (!['asc', 'desc'].includes(order)) throw new ValidationError(['order должен быть asc или desc']);

  const opts = { limit, offset, sortBy, order };
  if (present(raw.group_name)) {
    if (!GROUP_REGEX.test(String(raw.group_name))) throw new ValidationError(['group_name не соответствует формату ББМО-XX-XX']);
    opts.group_name = String(raw.group_name);
  }
  if (present(raw.course)) opts.course = intParam(raw.course, 'course', { min: 1, max: 4 });
  const gMin = numParam(raw.grade_min, 'grade_min');
  const gMax = numParam(raw.grade_max, 'grade_max');
  if (gMin !== undefined) opts.grade_min = gMin;
  if (gMax !== undefined) opts.grade_max = gMax;
  if (gMin !== undefined && gMax !== undefined && gMin > gMax) throw new ValidationError(['grade_min не может быть больше grade_max']);
  return opts;
}

/** Корректный положительный целочисленный id (из строки URL или числа). */
function parseId(raw) {
  const n = typeof raw === 'string' && /^\d+$/.test(raw) ? Number(raw) : raw;
  if (!Number.isInteger(n) || n < 1 || n > 2147483647) throw new ValidationError(['id должен быть положительным целым числом']);
  return n;
}

module.exports = { FIELDS, SORT_COLUMNS, MAX_LIMIT, validateStudent, parseListOptions, parseId };
