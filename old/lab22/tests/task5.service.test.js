'use strict';

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./helpers');

const { StudentService } = load('services/StudentService');
const { GroupService } = load('services/GroupService');
const { TTLCache } = load('lib/cache');
const { createLogger } = load('lib/logger');
const { ValidationError, NotFoundError } = load('lib/appErrors');

const quiet = () => createLogger({ out: () => {} });

function fakeStudentDao() {
  const calls = { findAll: 0, findById: 0, getStats: 0, create: 0, batch: 0 };
  const dao = {
    calls,
    async findAll(opts) { calls.findAll++; return { data: [{ id: 1 }], pagination: { total: 100, limit: opts.limit, offset: opts.offset, page: 1, pages: 10 }, opts }; },
    async findById(id) { calls.findById++; return id === 404 ? null : { id }; },
    async getStats() { calls.getStats++; return { total: 1 }; },
    async create(data) { calls.create++; return { id: 1, ...data }; },
    async update(id, data) { return id === 404 ? null : { id, ...data }; },
    async delete(id) { return id !== 404; },
    async batchCreate(items) { calls.batch++; return { created: items.length, transaction: 'committed' }; },
  };
  return dao;
}

describe('Задание 5: StudentService — кэш и инвалидация', () => {
  let dao, cache, service;
  const DB = { name: 'fake-ctx-db' };
  beforeEach(() => {
    dao = fakeStudentDao();
    cache = new TTLCache({ ttlMs: 60000 });
    service = new StudentService({ cache, logger: quiet(), daoFactory: (db) => { assert.equal(db, DB, 'сервис обязан работать с ctx.db'); return dao; } });
  });

  it('второй одинаковый GET берётся из кэша (HIT), БД не опрашивается', async () => {
    const a = await service.list(DB, { limit: '3' });
    const b = await service.list(DB, { limit: '3' });
    assert.equal(a.cacheHit, false);
    assert.equal(b.cacheHit, true);
    assert.equal(dao.calls.findAll, 1);
    assert.equal(a.value.pagination.pages, 10);
  });

  it('разные параметры — разные ключи кэша', async () => {
    await service.list(DB, { limit: '3' });
    await service.list(DB, { limit: '3', course: '2' });
    assert.equal(dao.calls.findAll, 2);
  });

  it('валидация идёт до кэша и БД', async () => {
    await assert.rejects(service.list(DB, { limit: '9999' }), ValidationError);
    await assert.rejects(service.getById(DB, 'abc'), ValidationError);
    assert.equal(dao.calls.findAll + dao.calls.findById, 0);
  });

  it('create / update / remove / batch инвалидируют кэш', async () => {
    await service.list(DB, {});
    await service.create(DB, { name: 'Иван' });
    assert.equal((await service.list(DB, {})).cacheHit, false);

    await service.stats(DB);
    await service.update(DB, 1, { grade: 5 });
    assert.equal((await service.stats(DB)).cacheHit, false);

    await service.list(DB, {});
    await service.remove(DB, 1);
    assert.equal((await service.list(DB, {})).cacheHit, false);

    await service.list(DB, {});
    await service.batchCreate(DB, [{ name: 'Анна' }]);
    assert.equal((await service.list(DB, {})).cacheHit, false);
    assert.ok(cache.stats().invalidations >= 4);
  });

  it('несуществующий студент → NotFoundError, в кэш не попадает', async () => {
    await assert.rejects(service.getById(DB, 404), NotFoundError);
    await assert.rejects(service.getById(DB, 404), NotFoundError);
    assert.equal(dao.calls.findById, 2);
    await assert.rejects(service.update(DB, 404, { grade: 4 }), NotFoundError);
    await assert.rejects(service.remove(DB, 404), NotFoundError);
  });

  it('ошибка записи не сбрасывает кэш (данные не менялись)', async () => {
    await service.stats(DB);
    dao.create = async () => { throw new Error('db down'); };
    await assert.rejects(service.create(DB, {}), /db down/);
    assert.equal((await service.stats(DB)).cacheHit, true);
  });
});

describe('Задание 5: GroupService', () => {
  const DB = {};
  const groupsDao = { async list() { return [{ id: 1, name: 'ББМО-01-23', students: 3 }]; }, async findById(id) { return id === 1 ? { id: 1, name: 'ББМО-01-23', curator: 'Иванов И.И.' } : null; }, async create(d) { return { id: 9, ...d }; } };

  it('studentsOf: ищет группу по id и фильтрует студентов по её названию; для неизвестной — 404', async () => {
    let seen;
    const service = new GroupService({
      cache: new TTLCache(), logger: quiet(),
      groupDaoFactory: () => groupsDao,
      studentDaoFactory: () => ({ async findAll(opts) { seen = opts; return { data: [], pagination: { total: 0 } }; } }),
    });
    const r = await service.studentsOf(DB, '1', { limit: '2' });
    assert.equal(seen.group_name, 'ББМО-01-23');
    assert.equal(seen.limit, 2);
    assert.equal(r.value.group.name, 'ББМО-01-23');
    await assert.rejects(service.studentsOf(DB, '99', {}), NotFoundError);
    await assert.rejects(service.studentsOf(DB, 'abc', {}), ValidationError);
  });

  it('список групп кэшируется, создание группы сбрасывает кэш', async () => {
    const service = new GroupService({ cache: new TTLCache(), logger: quiet(), groupDaoFactory: () => groupsDao });
    await service.list(DB);
    assert.equal((await service.list(DB)).cacheHit, true);
    await service.create(DB, { name: 'ББМО-04-23' });
    assert.equal((await service.list(DB)).cacheHit, false);
  });
});
