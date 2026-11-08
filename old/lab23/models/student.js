'use strict';

/**
 * Модель студента: ЕДИНАЯ JSON Schema, которая используется
 *  - на уровне MongoDB (валидатор коллекции, $jsonSchema),
 *  - на уровне приложения (validateStudentInput проверяет по той же схеме).
 */

const NUMERIC = ['int', 'long', 'double', 'decimal'];

const STUDENT_SCHEMA = {
  bsonType: 'object',
  title: 'Student',
  required: ['name', 'group_name', 'course', 'grade', 'created_at'],
  additionalProperties: false,
  properties: {
    _id: { bsonType: 'objectId' },
    name: { bsonType: 'string', minLength: 2, maxLength: 100, description: 'ФИО студента' },
    group_name: { bsonType: 'string', pattern: '^[^-]+-\\d{2}-\\d{2}$', description: 'Группа, например ББМО-01-23' },
    course: { bsonType: ['int', 'long'], minimum: 1, maximum: 6, description: 'Курс 1–6' },
    grade: { bsonType: NUMERIC, minimum: 2, maximum: 5, description: 'Оценка 2–5' },
    email: { bsonType: 'string', pattern: '^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$' },
    created_at: { bsonType: 'date' },
    updated_at: { bsonType: 'date' },
  },
};

// Поля, которые может передавать клиент (остальные выставляет сервер)
const INPUT_FIELDS = ['name', 'group_name', 'course', 'grade', 'email'];
const REQUIRED_INPUT = ['name', 'group_name', 'course', 'grade'];

const TYPE_CHECKS = {
  string: (v) => typeof v === 'string',
  int: (v) => Number.isInteger(v) && v >= -2147483648 && v <= 2147483647,
  long: (v) => Number.isInteger(v),
  double: (v) => typeof v === 'number' && Number.isFinite(v),
  decimal: (v) => typeof v === 'number' && Number.isFinite(v),
  date: (v) => v instanceof Date && !Number.isNaN(v.getTime()),
};

function matchesType(value, bsonType) {
  const types = Array.isArray(bsonType) ? bsonType : [bsonType];
  return types.some((t) => TYPE_CHECKS[t] && TYPE_CHECKS[t](value));
}

/** Проверка одного значения по описанию свойства схемы. Возвращает массив сообщений об ошибках. */
function checkField(field, value, spec) {
  if (!matchesType(value, spec.bsonType)) {
    const t = Array.isArray(spec.bsonType) ? spec.bsonType.join('|') : spec.bsonType;
    return [`поле "${field}" должно иметь тип ${t}`];
  }
  const errors = [];
  if (typeof value === 'string') {
    const len = [...value].length;
    if (spec.minLength !== undefined && len < spec.minLength) errors.push(`поле "${field}": минимум ${spec.minLength} симв.`);
    if (spec.maxLength !== undefined && len > spec.maxLength) errors.push(`поле "${field}": максимум ${spec.maxLength} симв.`);
    if (spec.pattern && !new RegExp(spec.pattern).test(value)) errors.push(`поле "${field}" не соответствует формату`);
  }
  if (typeof value === 'number') {
    if (spec.minimum !== undefined && value < spec.minimum) errors.push(`поле "${field}": минимум ${spec.minimum}`);
    if (spec.maximum !== undefined && value > spec.maximum) errors.push(`поле "${field}": максимум ${spec.maximum}`);
  }
  return errors;
}

/**
 * Валидация входных данных. partial=true — для обновления (обязательных полей нет).
 * Возвращает { valid, errors, value }, где value — копия с обрезанными пробелами в строках.
 */
function validateStudentInput(data, { partial = false } = {}) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return { valid: false, errors: ['тело запроса должно быть JSON-объектом'], value: null };
  }
  const errors = [];
  const value = {};
  for (const key of Object.keys(data)) {
    if (!INPUT_FIELDS.includes(key)) errors.push(`неизвестное или запрещённое поле "${key}"`);
    else value[key] = typeof data[key] === 'string' ? data[key].trim() : data[key];
  }
  if (!partial) {
    for (const req of REQUIRED_INPUT) if (value[req] === undefined) errors.push(`поле "${req}" обязательно`);
  } else if (Object.keys(value).length === 0 && errors.length === 0) {
    errors.push('нет полей для обновления');
  }
  for (const field of INPUT_FIELDS) {
    if (value[field] !== undefined) errors.push(...checkField(field, value[field], STUDENT_SCHEMA.properties[field]));
  }
  return { valid: errors.length === 0, errors, value };
}

/** Документ для вставки: проверенные поля + created_at. */
function buildDocument(value, now = new Date()) {
  return { ...value, created_at: now };
}

module.exports = { STUDENT_SCHEMA, INPUT_FIELDS, validateStudentInput, buildDocument, checkField };
