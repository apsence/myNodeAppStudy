'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { load, mysqlError } = require('./helpers');

const { toHttpError } = load('middleware/errorHandler');
const { createLogger } = load('lib/logger');
const { ValidationError, NotFoundError, ConflictError } = load('lib/appErrors');

describe('Задание 5: маппинг ошибок MySQL в HTTP-статусы', () => {
  it('ER_DUP_ENTRY → 409 Conflict', () => {
    const r = toHttpError(mysqlError('ER_DUP_ENTRY', "Duplicate entry 'ББМО-04-23'"));
    assert.equal(r.status, 409);
    assert.equal(r.body.code, 'ER_DUP_ENTRY');
  });

  it('ER_NO_REFERENCED_ROW и ER_NO_REFERENCED_ROW_2 → 400 Bad Request', () => {
    assert.equal(toHttpError(mysqlError('ER_NO_REFERENCED_ROW')).status, 400);
    assert.equal(toHttpError(mysqlError('ER_NO_REFERENCED_ROW_2')).status, 400);
  });

  it('ECONNREFUSED → 503 Service Unavailable (и другие сетевые сбои)', () => {
    for (const code of ['ECONNREFUSED', 'ETIMEDOUT', 'PROTOCOL_CONNECTION_LOST', 'POOL_CLOSED']) {
      assert.equal(toHttpError(mysqlError(code)).status, 503, code);
    }
    assert.equal(toHttpError(mysqlError('ECONNREFUSED')).body.error, 'База данных недоступна');
  });

  it('ER_ROW_IS_REFERENCED_2 (удаление группы со студентами) → 409; ER_BAD_NULL_ERROR → 400', () => {
    assert.equal(toHttpError(mysqlError('ER_ROW_IS_REFERENCED_2')).status, 409);
    assert.equal(toHttpError(mysqlError('ER_BAD_NULL_ERROR')).status, 400);
  });

  it('откат транзакции: в ответе transaction=rolled back и индекс элемента', () => {
    const err = mysqlError('ER_NO_REFERENCED_ROW_2', 'FK', { transaction: 'rolled back', batchIndex: 1 });
    const { status, body } = toHttpError(err);
    assert.equal(status, 400);
    assert.equal(body.transaction, 'rolled back');
    assert.equal(body.failedIndex, 1);
  });

  it('структурированный JSON: error (+ code / details)', () => {
    const r = toHttpError(new ValidationError(['name обязательно']));
    assert.deepEqual(r, { status: 400, body: { error: 'Ошибка валидации', details: ['name обязательно'] } });
    assert.equal(toHttpError(new NotFoundError('нет')).status, 404);
    assert.equal(toHttpError(new ConflictError('дубль')).status, 409);
  });

  it('http-ошибки Koa (413 слишком большое тело, 400 плохой JSON) сохраняют статус', () => {
    assert.equal(toHttpError(Object.assign(new Error('Тело запроса слишком большое'), { status: 413, expose: true })).status, 413);
    assert.equal(toHttpError(Object.assign(new Error('Некорректный JSON'), { status: 400, expose: true })).status, 400);
  });

  it('неизвестная ошибка → 500 без утечки деталей (стек, SQL)', () => {
    const r = toHttpError(new Error("secret: SELECT password FROM users"));
    assert.equal(r.status, 500);
    assert.ok(!JSON.stringify(r.body).includes('secret'));
  });
});

describe('Задание 5: формат логов', () => {
  it('[дата] [ББМО-01-23] сообщение и служебные [INFO]', () => {
    const lines = [];
    const log = createLogger({ out: (l) => lines.push(l), now: () => new Date(2024, 0, 15, 14, 30, 25) });
    log.op('SELECT * FROM students LIMIT 3 OFFSET 0 (1.2ms)');
    log.info('Пул MySQL создан (лимит: 10)');
    assert.equal(lines[0], '[2024-01-15 14:30:25] [ББМО-01-23] SELECT * FROM students LIMIT 3 OFFSET 0 (1.2ms)');
    assert.equal(lines[1], '[INFO] Пул MySQL создан (лимит: 10)');
  });
});
