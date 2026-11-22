'use strict';

/** Разбор параметров списка: сортировка, фильтры, пагинация, статистика. Чистые функции без зависимостей. */
const SORT_FIELDS = ['name', 'email', 'age', 'course', 'group_name', 'created_at'];
const DEFAULT_SORT = { created_at: -1 };

/** '-name' → { name: -1 }, 'age' → { age: 1 }; поле не из белого списка → null. */
function parseSort(sort) {
  if (sort === undefined || sort === null || sort === '') return { ...DEFAULT_SORT };
  if (typeof sort !== 'string') return null;
  const desc = sort.startsWith('-');
  const field = desc ? sort.slice(1) : sort;
  if (!SORT_FIELDS.includes(field)) return null;
  return { [field]: desc ? -1 : 1 };
}

/** Фильтры комбинируются через AND. Значения попадают в запрос только после проверки Joi (типы!). */
function buildFilter({ group_name, course, age_min, age_max, search } = {}) {
  const filter = {};
  if (group_name !== undefined) filter.group_name = group_name;
  if (course !== undefined) filter.course = course;
  if (age_min !== undefined || age_max !== undefined) {
    filter.age = {};
    if (age_min !== undefined) filter.age.$gte = age_min;
    if (age_max !== undefined) filter.age.$lte = age_max;
  }
  if (search !== undefined) filter.$text = { $search: search };
  return filter;
}

const toSkip = (page, limit) => (page - 1) * limit;

function paginate({ page, limit, total }) {
  return { total, page, limit, pages: Math.ceil(total / limit) };
}

/** Результат $facet-агрегации → { total, averageAge, byGroup, byCourse }. */
function mapStats(facet) {
  const overall = (facet && facet.overall && facet.overall[0]) || { total: 0, avgAge: null };
  const round1 = (n) => (n === null || n === undefined ? null : Math.round(n * 10) / 10);
  return {
    total: overall.total,
    averageAge: round1(overall.avgAge),
    byGroup: Object.fromEntries(((facet && facet.byGroup) || []).map((g) => [g._id, g.count])),
    byCourse: Object.fromEntries(((facet && facet.byCourse) || []).map((c) => [String(c._id), c.count])),
  };
}

module.exports = { SORT_FIELDS, DEFAULT_SORT, parseSort, buildFilter, toSkip, paginate, mapStats };
