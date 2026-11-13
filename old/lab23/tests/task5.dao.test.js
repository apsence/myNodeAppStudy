'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./helpers');

// DAO подключает пакет mongodb (ObjectId): без npm install тесты пропускаются
let hasMongo = true;
try { require.resolve('mongodb'); } catch { hasMongo = false; }

const GOOD = { name: 'Иван Иванов', group_name: 'ББМО-01-23', course: 2, grade: 4.5 };

/** Фейковая коллекция: запоминает вызовы, возвращает заготовленные значения. */
function makeFake({ transactionsSupported = true, insertManyError = null, aggregateResult = null } = {}) {
  const log = { insertMany: [], findArgs: null, sort: null, skip: null, limit: null, session: [] };
  const cursor = {
    sort(s) { log.sort = s; return cursor; },
    skip(n) { log.skip = n; return cursor; },
    limit(n) { log.limit = n; return cursor; },
    async toArray() { return [{ _id: 'a' }, { _id: 'b' }]; },
  };
  const collection = {
    async insertOne(doc) { doc._id = 'new-id'; return { insertedId: 'new-id' }; },
    async insertMany(docs, opts) {
      log.insertMany.push({ count: docs.length, withSession: Boolean(opts && opts.session) });
      if (insertManyError) throw insertManyError;
      return { insertedCount: docs.length };
    },
    find(filter) { log.findArgs = filter; return cursor; },
    async countDocuments() { return 42; },
    async findOne() { return { _id: 'x' }; },
    async findOneAndUpdate(filter, update, opts) { log.update = { update, opts }; return { _id: 'x', ...update.$set }; },
    async deleteOne() { return { deletedCount: 1 }; },
    aggregate() { return { toArray: async () => aggregateResult || [] }; },
  };
  let inTx = false;
  const session = {
    startTransaction() { inTx = true; log.session.push('start'); },
    async commitTransaction() { inTx = false; log.session.push('commit'); },
    async abortTransaction() { inTx = false; log.session.push('abort'); },
    async endSession() { log.session.push('end'); },
    inTransaction() { return inTx; },
  };
  const database = {
    transactionsSupported,
    db: { collection: () => collection },
    client: { startSession: () => session },
  };
  return { database, log };
}

function makeDao(fake) {
  const { StudentDAO } = load('dao/StudentDAO');
  const { createLogger } = load('utils/logger');
  const { Metrics } = load('utils/metrics');
  return new StudentDAO({ database: fake.database, logger: createLogger({ out: () => {} }), metrics: new Metrics() });
}

describe('Задание 5: StudentDAO (на фейковой коллекции)', { skip: !hasMongo && 'пакет mongodb не установлен (npm install)' }, () => {
  const { ValidationError } = load('utils/errors');

  it('create: валидирует, добавляет created_at, возвращает документ с _id', async () => {
    const dao = makeDao(makeFake());
    const doc = await dao.create(GOOD);
    assert.equal(doc._id, 'new-id');
    assert.ok(doc.created_at instanceof Date);
    await assert.rejects(dao.create({ ...GOOD, grade: 9 }), ValidationError);
  });

  it('findById / update / delete: некорректный ObjectId → ValidationError', async () => {
    const dao = makeDao(makeFake());
    await assert.rejects(dao.findById('123'), ValidationError);
    await assert.rejects(dao.update('123', { grade: 4 }), ValidationError);
    await assert.rejects(dao.delete('123'), ValidationError);
  });

  it('update использует $set и updated_at, возвращает документ после изменения', async () => {
    const fake = makeFake();
    const dao = makeDao(fake);
    const res = await dao.update('507f1f77bcf86cd799439011', { grade: 5 });
    assert.equal(res.grade, 5);
    assert.ok(fake.log.update.update.$set.updated_at instanceof Date);
    assert.equal(fake.log.update.opts.returnDocument, 'after');
    await assert.rejects(dao.update('507f1f77bcf86cd799439011', { _id: 'hack' }), ValidationError);
  });

  it('findAll: пагинация и стабильная сортировка (tie-breaker по _id), total из countDocuments', async () => {
    const fake = makeFake();
    const dao = makeDao(fake);
    const res = await dao.findAll({ filter: { course: 2 }, sort: { grade: -1 }, limit: 3, offset: 6 });
    assert.equal(res.total, 42);
    assert.deepEqual(fake.log.findArgs, { course: 2 });
    assert.deepEqual(Object.keys(fake.log.sort), ['grade', '_id']);
    assert.equal(fake.log.skip, 6);
    assert.equal(fake.log.limit, 3);
  });

  it('getStats: собирает total, averageGrade (2 знака), byGroup, byCourse из $facet', async () => {
    const dao = makeDao(makeFake({
      aggregateResult: [{
        overall: [{ _id: null, total: 1002, avg: 4.1149 }],
        byGroup: [{ _id: 'ББМО-01-23', count: 42 }, { _id: 'ББМО-02-23', count: 35 }],
        byCourse: [{ _id: 1, count: 10 }],
      }],
    }));
    assert.deepEqual(await dao.getStats(), {
      total: 1002, averageGrade: 4.11, byGroup: { 'ББМО-01-23': 42, 'ББМО-02-23': 35 }, byCourse: { 1: 10 },
    });
  });

  it('getStats на пустой коллекции не падает', async () => {
    const dao = makeDao(makeFake({ aggregateResult: [{ overall: [], byGroup: [], byCourse: [] }] }));
    assert.deepEqual(await dao.getStats(), { total: 0, averageGrade: null, byGroup: {}, byCourse: {} });
  });

  it('batchCreate: успех — insertMany внутри сессии, commit, endSession в finally', async () => {
    const fake = makeFake();
    const res = await makeDao(fake).batchCreate([GOOD, { ...GOOD, name: 'Мария Петрова' }]);
    assert.deepEqual(res, { inserted: 2, transaction: 'committed' });
    assert.deepEqual(fake.log.session, ['start', 'commit', 'end']);
    assert.deepEqual(fake.log.insertMany, [{ count: 2, withSession: true }]);
  });

  it('batchCreate: ошибка insertMany → abort, endSession, ошибка помечена как aborted', async () => {
    const fake = makeFake({ insertManyError: Object.assign(new Error('E11000'), { code: 11000 }) });
    await assert.rejects(makeDao(fake).batchCreate([GOOD]), (err) => err.code === 11000 && err.transaction === 'aborted');
    assert.deepEqual(fake.log.session, ['start', 'abort', 'end']);
  });

  it('batchCreate: невалидный элемент → ValidationError с индексом, транзакция даже не начинается', async () => {
    const fake = makeFake();
    await assert.rejects(
      makeDao(fake).batchCreate([GOOD, { name: 'X' }]),
      (err) => err instanceof ValidationError && err.details[0].index === 1
    );
    assert.deepEqual(fake.log.session, []);
    assert.deepEqual(fake.log.insertMany, []);
  });

  it('batchCreate: пустой массив отклоняется', async () => {
    await assert.rejects(makeDao(makeFake()).batchCreate([]), ValidationError);
  });

  it('batchCreate без реплика-сета: обычный insertMany без сессии и честный статус', async () => {
    const fake = makeFake({ transactionsSupported: false });
    const res = await makeDao(fake).batchCreate([GOOD]);
    assert.match(res.transaction, /unsupported/);
    assert.deepEqual(fake.log.insertMany, [{ count: 1, withSession: false }]);
    assert.deepEqual(fake.log.session, []);
  });
});
