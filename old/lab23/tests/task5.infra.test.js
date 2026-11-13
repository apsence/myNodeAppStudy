'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./helpers');

const { toHttpError } = load('middleware/errorHandler');
const { createLogger } = load('utils/logger');
const { ValidationError, NotFoundError, ConflictError } = load('utils/errors');
const { isHexObjectId, ignoreNamespaceNotFound } = load('utils/common');
const cfg = load('config/constants');

describe('Задание 5: ошибки → HTTP-ответы', () => {
  it('AppError-классы дают свои статусы', () => {
    assert.equal(toHttpError(new ValidationError(['x'])).status, 400);
    assert.equal(toHttpError(new NotFoundError()).status, 404);
    assert.equal(toHttpError(new ConflictError()).status, 409);
    assert.deepEqual(toHttpError(new ValidationError(['a'])).body.details, ['a']);
  });

  it('дубликат ключа MongoDB (11000) → 409; при откате транзакции сообщает об этом', () => {
    const e = Object.assign(new Error('E11000'), { code: 11000, keyValue: { email: 'a@b.ru' }, transaction: 'aborted' });
    const r = toHttpError(e);
    assert.equal(r.status, 409);
    assert.equal(r.body.transaction, 'rolled back');
    assert.deepEqual(r.body.details, { email: 'a@b.ru' });
  });

  it('ошибка валидатора коллекции (121) → 400', () => {
    assert.equal(toHttpError(Object.assign(new Error('x'), { code: 121 })).status, 400);
  });

  it('недоступная БД → 503; http-ошибки Koa сохраняют статус; прочее → 500 без утечки деталей', () => {
    assert.equal(toHttpError(Object.assign(new Error('x'), { name: 'MongoServerSelectionError' })).status, 503);
    assert.equal(toHttpError(Object.assign(new Error('Некорректный JSON'), { status: 400, expose: true })).status, 400);
    assert.equal(toHttpError(Object.assign(new Error('БД'), { status: 503 })).status, 503);
    const r = toHttpError(new Error('secret stack info'));
    assert.equal(r.status, 500);
    assert.ok(!JSON.stringify(r.body).includes('secret'));
  });
});

describe('Задание 5: логирование', () => {
  it('op() печатает [дата] [ББМО-01-23] сообщение', () => {
    const lines = [];
    const log = createLogger({ out: (l) => lines.push(l), now: () => new Date(2024, 0, 15, 14, 30, 25) });
    log.op('find students (1.2ms)');
    log.info('Koa-сервер на порту 3000');
    assert.equal(lines[0], '[2024-01-15 14:30:25] [ББМО-01-23] find students (1.2ms)');
    assert.equal(lines[1], '[INFO] Koa-сервер на порту 3000');
  });
});

describe('Общие утилиты и конфигурация', () => {
  it('isHexObjectId принимает только 24 hex-символа', () => {
    assert.equal(isHexObjectId('507f1f77bcf86cd799439011'), true);
    for (const bad of ['123', 'zzzzzzzzzzzzzzzzzzzzzzzz', '507f1f77bcf86cd79943901', 5, null, undefined, '12 chars str']) {
      assert.equal(isHexObjectId(bad), false, String(bad));
    }
  });

  it('ignoreNamespaceNotFound глотает только «коллекции нет» (код 26)', () => {
    assert.equal(ignoreNamespaceNotFound({ code: 26, message: 'ns not found' }), false);
    assert.throws(() => ignoreNamespaceNotFound({ code: 13, message: 'Unauthorized' }));
  });

  it('константы: группа, БД и отдельные коллекции для заданий', () => {
    assert.equal(cfg.GROUP, 'ББМО-01-23');
    assert.equal(cfg.DEFAULT_DB, 'bbmo_01_23');
    assert.equal(new Set(Object.values(cfg.COLLECTIONS)).size, Object.keys(cfg.COLLECTIONS).length);
  });
});
