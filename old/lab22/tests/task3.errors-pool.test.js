'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { load, mysqlError } = require('./helpers');

const { classifyError, isCriticalError, mapMysqlError } = load('lib/errors');
const { ManagedPool } = load('lib/db');
const { createLogger } = load('lib/logger');

describe('Задание 3: категории ошибок MySQL', () => {
  const table = [
    ['ECONNREFUSED', 'network'],
    ['ETIMEDOUT', 'network'],
    ['PROTOCOL_CONNECTION_LOST', 'network'],
    ['ER_ACCESS_DENIED_ERROR', 'auth'],
    ['ER_PARSE_ERROR', 'syntax'],
    ['ER_DUP_ENTRY', 'conflict'],
    ['ER_NO_REFERENCED_ROW', 'constraint'],
    ['ER_NO_REFERENCED_ROW_2', 'constraint'],
    ['ER_BAD_NULL_ERROR', 'constraint'],
  ];
  for (const [code, category] of table) {
    it(`${code} → ${category}`, () => {
      assert.equal(classifyError(mysqlError(code)).category, category);
    });
  }

  it('неизвестный код и ошибка без кода — категория unknown', () => {
    assert.equal(classifyError(mysqlError('WHATEVER')).category, 'unknown');
    assert.equal(classifyError(new Error('boom')).code, 'UNKNOWN');
  });

  it('«Pool is closed.» без кода распознаётся как POOL_CLOSED', () => {
    assert.equal(classifyError(new Error('Pool is closed.')).code, 'POOL_CLOSED');
  });

  it('критическими (пул нужно пересоздать) считаются только потеря соединения и закрытый пул', () => {
    assert.equal(isCriticalError(mysqlError('PROTOCOL_CONNECTION_LOST')), true);
    assert.equal(isCriticalError(mysqlError('POOL_CLOSED')), true);
    assert.equal(isCriticalError(mysqlError('ER_DUP_ENTRY')), false);
    assert.equal(isCriticalError(mysqlError('ER_ACCESS_DENIED_ERROR')), false);
  });

  it('mapMysqlError возвращает null для неизвестных ошибок', () => {
    assert.equal(mapMysqlError(new Error('x')), null);
  });
});

/** Фейковый пул: считает вызовы, умеет эмитить 'error' и падать на query. */
function fakePoolFactory(failures = []) {
  const created = [];
  const factory = () => {
    const handlers = {};
    const pool = {
      id: created.length + 1,
      ended: false,
      queries: [],
      on(event, fn) { handlers[event] = fn; return pool; },
      emit(event, arg) { if (handlers[event]) handlers[event](arg); },
      async query(sql) {
        pool.queries.push(sql);
        const failure = failures[pool.id - 1];
        if (failure) throw failure;
        return [[{ ok: 1 }]];
      },
      async getConnection() { return { release() {} }; },
      async end() { pool.ended = true; },
    };
    created.push(pool);
    return pool;
  };
  return { factory, created };
}

describe('Задание 3: обработка ошибок пула (ManagedPool)', () => {
  const quiet = () => { const lines = []; return { lines, logger: createLogger({ out: (l) => lines.push(l) }) }; };

  it("слушает событие 'error' пула и пересоздаёт пул при критической ошибке", async () => {
    const { lines, logger } = quiet();
    const { factory, created } = fakePoolFactory();
    const managed = new ManagedPool({ factory, logger });
    created[0].emit('error', mysqlError('PROTOCOL_CONNECTION_LOST'));
    await new Promise((r) => setImmediate(r));
    assert.equal(created.length, 2);
    assert.equal(created[0].ended, true);
    assert.equal(managed.pool, created[1]);
    assert.ok(lines.includes('[INFO] [POOL ERROR] PROTOCOL_CONNECTION_LOST'));
    assert.ok(lines.includes('[INFO] [POOL] Пересоздание пула...'));
  });

  it('некритическая ошибка пула только логируется — пул остаётся прежним', async () => {
    const { logger } = quiet();
    const { factory, created } = fakePoolFactory();
    const managed = new ManagedPool({ factory, logger });
    created[0].emit('error', mysqlError('ER_DUP_ENTRY'));
    assert.equal(created.length, 1);
    assert.equal(managed.recreations, 0);
    assert.deepEqual(managed.errors, ['ER_DUP_ENTRY']);
  });

  it('запрос на закрытом пуле: пересоздание и одна повторная попытка на новом пуле', async () => {
    const { logger } = quiet();
    const { factory, created } = fakePoolFactory([mysqlError('POOL_CLOSED', 'Pool is closed.')]);
    const managed = new ManagedPool({ factory, logger });
    const [rows] = await managed.query('SELECT 1');
    assert.deepEqual(rows, [{ ok: 1 }]);
    assert.equal(created.length, 2);
    assert.equal(managed.recreations, 1);
    assert.deepEqual(created[1].queries, ['SELECT 1']);
  });

  it('некритическая ошибка запроса пробрасывается без пересоздания и повтора', async () => {
    const { logger } = quiet();
    const { factory, created } = fakePoolFactory([mysqlError('ER_PARSE_ERROR')]);
    const managed = new ManagedPool({ factory, logger });
    await assert.rejects(managed.query('SELEC 1'), (e) => e.code === 'ER_PARSE_ERROR');
    assert.equal(created.length, 1);
    assert.equal(created[0].queries.length, 1);
  });

  it('одновременные сбои одного пула приводят к единственному пересозданию', async () => {
    const { logger } = quiet();
    const lost = mysqlError('PROTOCOL_CONNECTION_LOST');
    const { factory } = fakePoolFactory([lost]);
    const managed = new ManagedPool({ factory, logger });
    await Promise.all([managed.query('A'), managed.query('B'), managed.query('C')]);
    assert.equal(managed.recreations, 1);
  });

  it('если и новый пул падает — ошибка пробрасывается (бесконечных повторов нет)', async () => {
    const { logger } = quiet();
    const { factory, created } = fakePoolFactory([mysqlError('PROTOCOL_CONNECTION_LOST'), mysqlError('PROTOCOL_CONNECTION_LOST')]);
    const managed = new ManagedPool({ factory, logger });
    await assert.rejects(managed.query('SELECT 1'), (e) => e.code === 'PROTOCOL_CONNECTION_LOST');
    assert.equal(created.length, 2);
  });
});
