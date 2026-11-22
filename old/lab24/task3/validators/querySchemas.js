'use strict';

const Joi = require('joi');
const { GROUP_RE } = require('../models/validation');
const { parseSort, SORT_FIELDS } = require('../utils/query');

const sortField = Joi.string()
  .custom((value, helpers) => (parseSort(value) ? value : helpers.error('sort.invalid')))
  .messages({ 'sort.invalid': `допустимые значения: ${SORT_FIELDS.join(', ')} (префикс "-" — по убыванию)` });

const filters = {
  group_name: Joi.string().pattern(GROUP_RE),
  course: Joi.number().integer().min(1).max(4),
  age_min: Joi.number().integer().min(0).max(150),
  age_max: Joi.number()
    .integer()
    .min(0)
    .max(150)
    .when('age_min', { is: Joi.exist(), then: Joi.number().min(Joi.ref('age_min')) }),
  search: Joi.string().trim().min(1).max(100),
  sort: sortField,
};

/** GET /api/users: page, limit (по умолчанию 1 и 10, максимум 100), фильтры, сортировка, поиск. */
const listQuerySchema = Joi.object({
  page: Joi.number().integer().positive().default(1),
  limit: Joi.number().integer().positive().max(100).default(10),
  ...filters,
});

/** GET /api/users/search?q=... */
const searchQuerySchema = Joi.object({
  q: Joi.string().trim().min(1).max(100).required(),
  limit: Joi.number().integer().positive().max(100).default(20),
});

/** GET /api/users/export: те же фильтры, без пагинации. */
const exportQuerySchema = Joi.object({ ...filters });

module.exports = { listQuerySchema, searchQuerySchema, exportQuerySchema };
