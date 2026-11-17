'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { load, mysqlError } = require('./helpers');

const { createDb } = load('lib/db');
const { createLogger } = load('lib/logger');
const { Metrics } = load('lib/metrics');

function fakePool({ failOn = null, failBegin = false, failRollback = false } = {}) {
  const log = [];
  const conn = {
    async beginTransaction() { log.push('begin'); if (failBegin) throw new Error('begin failed'); },
    async commit() { log.push('commit'); },
    async rollback() { log.push('rollback'); if (failRollback) throw new Error('rollback failed'); },
    release() { log.push('release'); },
    async query(sql) {
      log.push(`query:${sql}`);
      if (failOn && sql.includes(failOn)) throw mysqlError('ER_DUP_ENTRY', 'Duplicate entry');
      return [{ affectedRows: 1 }];
    },
  };
  return { log, async getConnection() { log.push('getConnection'); return conn; }, async query(sql) { log.push(`pool:${sql}`); return [[{ one: 1 }]]; } };
}

describe('Задание 3: транзакции (commit / rollback / release)', () => {
  it('успех: getConnection → begin → INSERT ×2 → commit → release', async () => {
    const pool = fakePool();
    const db = createDb(pool);
    await db.transaction(async (tx) => {
      await tx.query('INSERT 1');
      await tx.query('INSERT 2');
    });
    assert.deepEqual(pool.log, ['getConnection', 'begin', 'query:INSERT 1', 'query:INSERT 2', 'commit', 'release']);
  });

  it('ошибка во втором INSERT: rollback вместо commit, соединение возвращается в пул, ошибка пробрасывается', async () => {
    const pool = fakePool({ failOn: 'INSERT 3' });
    const db = createDb(pool);
    await assert.rejects(
      db.transaction(async (tx) => {
        await tx.query('INSERT 1');
        await tx.query('INSERT 3');
      }),
      (e) => e.code === 'ER_DUP_ENTRY'
    );
    assert.deepEqual(pool.log, ['getConnection', 'begin', 'query:INSERT 1', 'query:INSERT 3', 'rollback', 'release']);
    assert.ok(!pool.log.includes('commit'));
  });

  it('release() вызывается, даже если не удалось начать транзакцию', async () => {
    const pool = fakePool({ failBegin: true });
    await assert.rejects(createDb(pool).transaction(async () => {}), /begin failed/);
    assert.equal(pool.log.at(-1), 'release');
  });

  it('сбой самого rollback не маскирует исходную ошибку и не мешает release()', async () => {
    const pool = fakePool({ failOn: 'BAD', failRollback: true });
    await assert.rejects(createDb(pool).transaction((tx) => tx.query('BAD')), (e) => e.code === 'ER_DUP_ENTRY');
    assert.equal(pool.log.at(-1), 'release');
  });

  it('возвращает результат колбэка', async () => {
    const res = await createDb(fakePool()).transaction(async () => 42);
    assert.equal(res, 42);
  });

  it('логирует BEGIN TRANSACTION / COMMIT / ROLLBACK и SQL внутри транзакции', async () => {
    const lines = [];
    const logger = createLogger({ out: (l) => lines.push(l), now: () => new Date(2024, 0, 15, 14, 30, 28) });
    const db = createDb(fakePool({ failOn: 'BAD' }), { logger });
    await db.transaction((tx) => tx.query('INSERT INTO students (name) VALUES (?)', ['Анна'])).catch(() => {});
    await db.transaction((tx) => tx.query('BAD')).catch(() => {});
    const text = lines.join('\n');
    assert.match(text, /\[2024-01-15 14:30:28\] \[ББМО-01-23\] BEGIN TRANSACTION/);
    assert.match(text, /INSERT INTO students \(name\) VALUES \(\?\) \["Анна"\] \(\d+\.\dms\)/);
    assert.match(text, /\] COMMIT/);
    assert.match(text, /\] ROLLBACK/);
    assert.match(text, /ОШИБКА/);
  });
});

describe('Задание 3: логирование SQL и метрики запросов', () => {
  it('db.query считает запросы, среднее время и ошибки', async () => {
    const metrics = new Metrics();
    const pool = { async query(sql) { if (sql === 'BAD') throw mysqlError('ER_PARSE_ERROR'); return [[]]; } };
    const db = createDb(pool, { metrics });
    await db.query('SELECT 1');
    await db.query('SELECT 2');
    await db.query('BAD').catch(() => {});
    const s = metrics.snapshot();
    assert.equal(s.queries, 3);
    assert.equal(s.errors, 1);
    assert.ok(s.avgTime >= 0);
  });

  it('SQL в логе сжимается до одной строки, значения параметров не подставляются в текст SQL', async () => {
    const lines = [];
    const db = createDb({ async query() { return [[]]; } }, { logger: createLogger({ out: (l) => lines.push(l) }) });
    await db.query('SELECT *\n   FROM students\n  WHERE name = ?', ["'; DROP TABLE students; --"]);
    assert.match(lines[0], /SELECT \* FROM students WHERE name = \? \[/);
    assert.ok(!lines[0].split('[')[0].includes('DROP'), 'DROP не должен попадать в текст SQL');
  });
});
