'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { load, has, memoryLogger } = require('./_helpers');

const { parseSort, buildFilter, toSkip, paginate, mapStats, SORT_FIELDS } = load('task3/utils/query');
const { escapeCell, toCsvLine, csvChunks } = load('task3/utils/csv');
const { UserService } = load('task3/services/userService');
const { formatDetails } = load('task3/utils/joiMessages');

async function collect(stream) {
  let out = '';
  for await (const chunk of stream) out += chunk;
  return out;
}

describe('Задание 3: сортировка', () => {
  it('?sort=name → A-Z, ?sort=-name → Z-A, ?sort=age, ?sort=-created_at', () => {
    assert.deepEqual(parseSort('name'), { name: 1 });
    assert.deepEqual(parseSort('-name'), { name: -1 });
    assert.deepEqual(parseSort('age'), { age: 1 });
    assert.deepEqual(parseSort('-created_at'), { created_at: -1 });
  });

  it('по умолчанию — новые сверху; поля вне белого списка отклоняются', () => {
    assert.deepEqual(parseSort(undefined), { created_at: -1 });
    for (const bad of ['password_hash', '-password_hash', '$where', 'name;drop', '', '--name', 5, {}]) {
      if (bad === '') continue; // пустая строка = «не задано»
      assert.equal(parseSort(bad), null, String(bad));
    }
    assert.deepEqual(SORT_FIELDS.slice().sort(), ['age', 'course', 'created_at', 'email', 'group_name', 'name']);
  });
});

describe('Задание 3: фильтрация', () => {
  it('по группе, курсу, возрасту; комбинирование', () => {
    assert.deepEqual(buildFilter({ group_name: 'ББМО-01-23' }), { group_name: 'ББМО-01-23' });
    assert.deepEqual(buildFilter({ course: 2 }), { course: 2 });
    assert.deepEqual(buildFilter({ age_min: 18, age_max: 25 }), { age: { $gte: 18, $lte: 25 } });
    assert.deepEqual(buildFilter({ age_min: 18 }), { age: { $gte: 18 } });
    assert.deepEqual(buildFilter({ group_name: 'ББМО-01-23', course: 2, age_max: 25 }), { group_name: 'ББМО-01-23', course: 2, age: { $lte: 25 } });
    assert.deepEqual(buildFilter({}), {});
  });

  it('?search= использует текстовый индекс ($text)', () => {
    assert.deepEqual(buildFilter({ search: 'Иван' }), { $text: { $search: 'Иван' } });
  });
});

describe('Задание 3: пагинация', () => {
  it('метаданные total, page, limit, pages (как в примере: 100 записей, limit 5 → 20 страниц)', () => {
    assert.deepEqual(paginate({ page: 2, limit: 5, total: 100 }), { total: 100, page: 2, limit: 5, pages: 20 });
    assert.deepEqual(paginate({ page: 1, limit: 10, total: 25 }), { total: 25, page: 1, limit: 10, pages: 3 });
    assert.equal(paginate({ page: 1, limit: 10, total: 0 }).pages, 0);
  });

  it('skip считается от страницы', () => {
    assert.equal(toSkip(1, 10), 0);
    assert.equal(toSkip(2, 5), 5);
    assert.equal(toSkip(3, 10), 20);
  });
});

describe('Задание 3: статистика (результат агрегации MongoDB)', () => {
  it('total, averageAge (1 знак), byGroup, byCourse — как в примере', () => {
    const facet = {
      overall: [{ _id: null, total: 100, avgAge: 20.4567 }],
      byGroup: [{ _id: 'ББМО-01-23', count: 40 }, { _id: 'ББМО-02-23', count: 35 }, { _id: 'ББМО-03-23', count: 25 }],
      byCourse: [{ _id: 1, count: 30 }, { _id: 2, count: 35 }, { _id: 3, count: 20 }, { _id: 4, count: 15 }],
    };
    assert.deepEqual(mapStats(facet), {
      total: 100, averageAge: 20.5,
      byGroup: { 'ББМО-01-23': 40, 'ББМО-02-23': 35, 'ББМО-03-23': 25 },
      byCourse: { 1: 30, 2: 35, 3: 20, 4: 15 },
    });
  });

  it('пустая коллекция не ломает статистику', () => {
    assert.deepEqual(mapStats({ overall: [], byGroup: [], byCourse: [] }), { total: 0, averageAge: null, byGroup: {}, byCourse: {} });
    assert.equal(mapStats(undefined).total, 0);
  });
});

describe('Задание 3: экспорт в CSV', () => {
  it('экранирование: запятые, кавычки, переводы строк', () => {
    assert.equal(escapeCell('Иванов, Иван'), '"Иванов, Иван"');
    assert.equal(escapeCell('Он сказал "да"'), '"Он сказал ""да"""');
    assert.equal(escapeCell('a\nb'), '"a\nb"');
    assert.equal(escapeCell(null), '');
    assert.equal(escapeCell(20), '20');
  });

  it('защита от CSV/formula-injection: =, +, -, @ в начале строки', () => {
    for (const evil of ['=1+1', '+cmd', '-2+3', '@SUM(A1)']) assert.equal(escapeCell(evil), `'${evil}`, evil);
    assert.equal(escapeCell(-5), '-5', 'числа не трогаем');
  });

  it('дата в ISO, строка по колонкам', () => {
    const row = { _id: '1', name: 'Иван', email: 'a@b.ru', group_name: 'ББМО-01-23', course: 2, age: 20, created_at: new Date('2024-01-15T14:30:25Z') };
    assert.equal(toCsvLine(row), '1,Иван,a@b.ru,ББМО-01-23,2,20,2024-01-15T14:30:25.000Z');
  });

  it('потоковый CSV: BOM для Excel, заголовок, строки с CRLF', async () => {
    async function* rows() { yield { _id: '1', name: 'Иван', email: 'i@x.ru' }; yield { _id: '2', name: 'Мария', email: 'm@x.ru' }; }
    const text = await collect(csvChunks(rows()));
    assert.ok(text.startsWith('\uFEFF_id,name,email,group_name,course,age,created_at\r\n'));
    assert.equal(text.split('\r\n').filter(Boolean).length, 3);
  });
});

/** Поддельная модель: запоминает, как сервис её вызвал. */
function fakeUserModel() {
  const calls = {};
  return {
    calls,
    async findAll(opts) { calls.findAll = opts; return [{ _id: '1', name: 'Иван' }]; },
    async count(filter) { calls.count = filter; return 100; },
    async search(q, limit) { calls.search = { q, limit }; return { found: 15, data: [{ name: 'Иван Иванов', score: 1.5 }] }; },
    async stats() { return { total: 100 }; },
    stream(filter, sort) { calls.stream = { filter, sort }; return (async function* () { yield { _id: '1', name: 'Иван', email: 'i@x.ru' }; })(); },
  };
}

describe('Задание 3: UserService (список, поиск, экспорт)', () => {
  const make = () => {
    const User = fakeUserModel();
    return { User, service: new UserService({ User, logger: memoryLogger(), mailer: {}, hasher: {} }) };
  };

  it('?page=2&limit=5&sort=-age → skip 5, limit 5, sort age убыв., pagination из total', async () => {
    const { User, service } = make();
    const res = await service.list({ page: 2, limit: 5, sort: '-age' });
    assert.deepEqual(User.calls.findAll.sort, { age: -1 });
    assert.equal(User.calls.findAll.skip, 5);
    assert.equal(User.calls.findAll.limit, 5);
    assert.deepEqual(res.pagination, { total: 100, page: 2, limit: 5, pages: 20 });
    assert.equal(res.data.length, 1);
  });

  it('значения по умолчанию: page=1, limit=10, новые сверху', async () => {
    const { User, service } = make();
    await service.list({});
    assert.deepEqual([User.calls.findAll.skip, User.calls.findAll.limit], [0, 10]);
    assert.deepEqual(User.calls.findAll.sort, { created_at: -1 });
  });

  it('фильтры передаются в модель и в count (total считается по тому же фильтру)', async () => {
    const { User, service } = make();
    await service.list({ group_name: 'ББМО-01-23', course: 2, age_min: 18 });
    const expected = { group_name: 'ББМО-01-23', course: 2, age: { $gte: 18 } };
    assert.deepEqual(User.calls.findAll.filter, expected);
    assert.deepEqual(User.calls.count, expected);
  });

  it('поиск в списке: без явной сортировки — по релевантности (textScore), с поиском score добавляется', async () => {
    const { User, service } = make();
    await service.list({ search: 'Иван' });
    assert.deepEqual(User.calls.findAll.sort, { score: { $meta: 'textScore' } });
    assert.equal(User.calls.findAll.scored, true);
    await service.list({ search: 'Иван', sort: 'name' });
    assert.deepEqual(User.calls.findAll.sort, { name: 1 });
  });

  it('search(): ранжированный результат { found, data }', async () => {
    const { User, service } = make();
    assert.deepEqual(await service.search({ q: 'Иван' }), { found: 15, data: [{ name: 'Иван Иванов', score: 1.5 }] });
    assert.deepEqual(User.calls.search, { q: 'Иван', limit: 20 });
  });

  it('exportCsv: поток CSV с теми же фильтрами', async () => {
    const { User, service } = make();
    const text = await collect(service.exportCsv({ group_name: 'ББМО-01-23', sort: 'name' }));
    assert.ok(text.includes('Иван'));
    assert.deepEqual(User.calls.stream, { filter: { group_name: 'ББМО-01-23' }, sort: { name: 1 } });
  });
});

describe('Задание 3: валидация query-параметров Joi (нужен пакет joi)', { skip: !has('joi') && 'пакет joi не установлен (npm install)' }, () => {
  const { listQuerySchema, searchQuerySchema, exportQuerySchema } = load('task3/validators/querySchemas');
  const check = (schema, value) => {
    const { error, value: v } = schema.validate(value, { abortEarly: false });
    return { errors: error ? formatDetails(error.details) : [], value: v };
  };

  it('page=0 → "должно быть больше 0" (пример из задания)', () => {
    assert.deepEqual(check(listQuerySchema, { page: '0' }).errors, [{ field: 'page', message: 'должно быть больше 0' }]);
  });

  it('значения по умолчанию и приведение строк к числам', () => {
    const { value, errors } = check(listQuerySchema, {});
    assert.deepEqual(errors, []);
    assert.deepEqual([value.page, value.limit], [1, 10]);
    assert.equal(check(listQuerySchema, { page: '2', limit: '5' }).value.limit, 5);
  });

  it('limit: целый, положительный, максимум 100', () => {
    assert.deepEqual(check(listQuerySchema, { limit: '101' }).errors, [{ field: 'limit', message: 'не больше 100' }]);
    assert.equal(check(listQuerySchema, { limit: 'abc' }).errors[0].field, 'limit');
    assert.equal(check(listQuerySchema, { limit: '2.5' }).errors[0].field, 'limit');
    assert.equal(check(listQuerySchema, { limit: '100' }).errors.length, 0);
  });

  it('sort — только из белого списка', () => {
    assert.equal(check(listQuerySchema, { sort: '-age' }).errors.length, 0);
    const bad = check(listQuerySchema, { sort: 'password_hash' }).errors;
    assert.equal(bad[0].field, 'sort');
    assert.match(bad[0].message, /допустимые значения/);
  });

  it('group_name — формат ББМО-XX-XX, course 1–4, age_max не меньше age_min', () => {
    assert.equal(check(listQuerySchema, { group_name: 'ббмо' }).errors[0].field, 'group_name');
    assert.equal(check(listQuerySchema, { group_name: 'ББМО-01-23', course: '2' }).errors.length, 0);
    assert.equal(check(listQuerySchema, { course: '7' }).errors[0].field, 'course');
    assert.equal(check(listQuerySchema, { age_min: '30', age_max: '20' }).errors[0].field, 'age_max');
  });

  it('неизвестные параметры и объекты в query отклоняются', () => {
    assert.deepEqual(check(listQuerySchema, { hack: '1' }).errors, [{ field: 'hack', message: 'неизвестное поле' }]);
    assert.equal(check(listQuerySchema, { search: ['a', 'b'] }).errors[0].field, 'search');
  });

  it('search: q обязателен; export принимает те же фильтры без пагинации', () => {
    assert.deepEqual(check(searchQuerySchema, {}).errors, [{ field: 'q', message: 'обязательное поле' }]);
    assert.equal(check(searchQuerySchema, { q: 'Иван' }).value.limit, 20);
    assert.equal(check(exportQuerySchema, { group_name: 'ББМО-01-23' }).errors.length, 0);
    assert.equal(check(exportQuerySchema, { page: '1' }).errors[0].field, 'page');
  });
});
