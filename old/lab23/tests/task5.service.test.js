'use strict';

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./helpers');

const { StudentService, parseListQuery } = load('services/StudentService');
const { TTLCache } = load('utils/cache');
const { createLogger } = load('utils/logger');
const { ValidationError, NotFoundError } = load('utils/errors');

/** Подделка DAO: считает вызовы, ничего не знает про MongoDB. */
function fakeDao() {
  const calls = { findAll: 0, findById: 0, getStats: 0, search: 0, create: 0, batch: 0 };
  return {
    calls,
    async findAll(opts) { calls.findAll++; return { data: [{ _id: '1' }], total: 42, opts }; },
    async findById(id) { calls.findById++; return id === 'missing' ? null : { _id: id }; },
    async getStats() { calls.getStats++; return { total: 1 }; },
    async search(q) { calls.search++; return { found: 0, data: [] }; },
    async create(data) { calls.create++; return { _id: 'new', ...data }; },
    async update(id, data) { return id === 'missing' ? null : { _id: id, ...data }; },
    async delete(id) { return id !== 'missing'; },
    async batchCreate(items) { calls.batch++; return { inserted: items.length, transaction: 'committed' }; },
  };
}

describe('Задание 5: parseListQuery (пагинация, сортировка, фильтры)', () => {
  it('значения по умолчанию', () => {
    assert.deepEqual(parseListQuery({}), { filter: {}, sort: { created_at: -1 }, limit: 10, offset: 0 });
  });

  it('разбирает limit/offset/sort/order и фильтры', () => {
    const r = parseListQuery({ limit: '3', offset: '6', sort: 'grade', order: 'asc', group_name: 'ББМО-01-23', course: '2', min_grade: '3.5', max_grade: '5' });
    assert.deepEqual(r, { filter: { group_name: 'ББМО-01-23', course: 2, grade: { $gte: 3.5, $lte: 5 } }, sort: { grade: 1 }, limit: 3, offset: 6 });
  });

  it('отклоняет некорректные значения', () => {
    for (const q of [{ limit: '0' }, { limit: '101' }, { limit: 'abc' }, { offset: '-1' }, { sort: 'password' }, { order: 'sideways' }, { course: '9' }, { min_grade: 'x' }]) {
      assert.throws(() => parseListQuery(q), ValidationError, JSON.stringify(q));
    }
  });
});

describe('Задание 5: StudentService (кэш и инвалидация)', () => {
  let dao, cache, service;
  beforeEach(() => {
    dao = fakeDao();
    cache = new TTLCache({ ttlMs: 60000 });
    service = new StudentService({ dao, cache, logger: createLogger({ out: () => {} }) });
  });

  it('повторный GET списка берётся из кэша (HIT), в БД второй запрос не идёт', async () => {
    const a = await service.list({ limit: '3' });
    const b = await service.list({ limit: '3' });
    assert.equal(a.cacheHit, false);
    assert.equal(b.cacheHit, true);
    assert.equal(dao.calls.findAll, 1);
    assert.deepEqual(a.value.pagination, { total: 42, limit: 3, offset: 0 });
  });

  it('разные параметры — разные ключи кэша', async () => {
    await service.list({ limit: '3' });
    await service.list({ limit: '5' });
    assert.equal(dao.calls.findAll, 2);
  });

  it('create/update/delete/batch инвалидируют кэш', async () => {
    await service.list({});
    await service.create({ name: 'Иван Иванов', course: 1, grade: 4 });
    assert.equal((await service.list({})).cacheHit, false);

    await service.stats();
    await service.update('1', { grade: 5 });
    assert.equal((await service.stats()).cacheHit, false);

    await service.list({});
    await service.delete('1');
    assert.equal((await service.list({})).cacheHit, false);

    await service.list({});
    await service.batchCreate([{ name: 'Иван Иванов', course: 1, grade: 4 }]);
    assert.equal((await service.list({})).cacheHit, false);
  });

  it('onExternalChange() (Change Stream) сбрасывает кэш', async () => {
    await service.stats();
    service.onExternalChange();
    assert.equal((await service.stats()).cacheHit, false);
  });

  it('create подставляет группу ББМО-01-23 по умолчанию, но не перетирает переданную', async () => {
    assert.equal((await service.create({ name: 'Иван Иванов' })).group_name, 'ББМО-01-23');
    assert.equal((await service.create({ name: 'Иван Иванов', group_name: 'ББМО-02-23' })).group_name, 'ББМО-02-23');
  });

  it('несуществующий студент → NotFoundError и в кэш не попадает', async () => {
    await assert.rejects(service.getById('missing'), NotFoundError);
    await assert.rejects(service.getById('missing'), NotFoundError);
    assert.equal(dao.calls.findById, 2);
    await assert.rejects(service.update('missing', { grade: 4 }), NotFoundError);
    await assert.rejects(service.delete('missing'), NotFoundError);
  });

  it('поиск: пустой q → ValidationError; результат кэшируется', async () => {
    await assert.rejects(service.search('   '), ValidationError);
    await assert.rejects(service.search(undefined), ValidationError);
    await service.search('Иван');
    assert.equal((await service.search('Иван')).cacheHit, true);
    assert.equal(dao.calls.search, 1);
  });

  it('batch: не массив и слишком большой массив отклоняются', async () => {
    await assert.rejects(service.batchCreate({}), ValidationError);
    await assert.rejects(service.batchCreate(new Array(5001).fill({})), ValidationError);
    assert.equal(dao.calls.batch, 0);
  });
});
