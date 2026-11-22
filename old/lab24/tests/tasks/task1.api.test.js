'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { load, makeCtx, run } = require('./_helpers');

const { validateUser, create, findById, update, remove } = load('task1/models/user');
const { xGroup, errorHandler, injectDb } = load('task1/middleware');
const { ApiError } = load('task1/errors');

const ok = { name: 'Иван', email: 'ivan@example.com', group_name: 'ББМО-01-23', age: 20 };

describe('Задание 1: валидация пользователя', () => {
  it('корректные данные проходят, email приводится к нижнему регистру', () => {
    const r = validateUser({ ...ok, email: ' Ivan@Example.COM ' });
    assert.equal(r.valid, true);
    assert.equal(r.value.email, 'ivan@example.com');
  });

  it('пример из задания: name="П", email="invalid" → ошибки с полями и сообщениями', () => {
    const r = validateUser({ name: 'П', email: 'invalid' });
    assert.equal(r.valid, false);
    assert.deepEqual(r.errors.slice(0, 2), [
      { field: 'name', message: 'минимум 2 символа' },
      { field: 'email', message: 'неверный формат' },
    ]);
    assert.ok(r.errors.some((e) => e.field === 'group_name' && e.message === 'обязательное поле'));
  });

  it('group_name: формат ББМО-XX-XX', () => {
    for (const bad of ['ББМО-1-23', 'ббмо-01-23', 'XX-01-23', 'ББМО-01-2023']) assert.equal(validateUser({ ...ok, group_name: bad }).valid, false, bad);
    assert.equal(validateUser({ ...ok, group_name: 'ББМО-02-24' }).valid, true);
  });

  it('age: целое от 16 до 100 (необязательное)', () => {
    const { age, ...noAge } = ok;
    assert.equal(validateUser(noAge).valid, true);
    for (const bad of [15, 101, 20.5, 'двадцать', null]) assert.equal(validateUser({ ...ok, age: bad }).valid, false, String(bad));
    for (const good of [16, 100]) assert.equal(validateUser({ ...ok, age: good }).valid, true);
    assert.equal(validateUser({ ...ok, age: '20' }).value.age, 20); // form-urlencoded присылает строки
  });

  it('name должен быть строкой: объект (NoSQL-инъекция) отклоняется', () => {
    assert.equal(validateUser({ ...ok, name: { $ne: null } }).valid, false);
    assert.equal(validateUser({ ...ok, email: { $gt: '' } }).valid, false);
  });

  it('неизвестные поля и не-объекты отклоняются; partial допускает часть полей', () => {
    assert.equal(validateUser({ ...ok, role: 'admin' }).valid, false);
    assert.equal(validateUser(null).valid, false);
    assert.equal(validateUser({ age: 30 }, { partial: true }).valid, true);
    assert.equal(validateUser({}, { partial: true }).valid, false);
  });
});

/** Фейковая БД: ровно столько MongoDB, сколько нужно модели. */
function fakeDb({ insertError = null } = {}) {
  const calls = [];
  const col = {
    insertOne: async (doc) => { calls.push(['insertOne', doc]); if (insertError) throw insertError; return { insertedId: 'a'.repeat(24) }; },
    find: () => ({ sort: () => ({ limit: () => ({ toArray: async () => [{ _id: 'x', name: 'Иван' }] }) }) }),
    deleteOne: async () => ({ deletedCount: 0 }),
  };
  return { calls, collection: () => col };
}

describe('Задание 1: модель (на фейковой БД)', () => {
  it('create: добавляет created_at/updated_at и возвращает _id строкой', async () => {
    const db = fakeDb();
    const user = await create(db, ok);
    assert.equal(user._id, 'a'.repeat(24));
    assert.ok(db.calls[0][1].created_at instanceof Date);
  });

  it('create: невалидные данные → ApiError 400 Validation failed с details', async () => {
    await assert.rejects(create(fakeDb(), { name: 'П', email: 'invalid' }), (e) => e.status === 400 && e.message === 'Validation failed' && e.details.length >= 2);
  });

  it('create: дубликат email (код 11000 от MongoDB) → 409 Email already exists', async () => {
    await assert.rejects(create(fakeDb({ insertError: Object.assign(new Error('dup'), { code: 11000 }) }), ok), (e) => e.status === 409 && e.message === 'Email already exists');
  });

  it('id вроде «999» — просто «не найден» (null/false), без обращения к БД', async () => {
    const db = fakeDb();
    assert.equal(await findById(db, '999'), null);
    assert.equal(await update(db, '999', { name: 'Пётр' }), null);
    assert.equal(await remove(db, '999'), false);
    assert.equal(db.calls.length, 0);
  });
});

describe('Задание 1: middleware', () => {
  it('xGroup ставит заголовок X-Group: BBMO-01-23', async () => {
    const ctx = await run([xGroup], makeCtx());
    assert.equal(ctx.out['X-Group'], 'BBMO-01-23');
  });

  it('X-Group есть и у ответов с ошибкой', async () => {
    const ctx = await run([xGroup, errorHandler({ log: () => {} })], makeCtx(), async () => { throw new ApiError(404, 'User not found'); });
    assert.equal(ctx.status, 404);
    assert.equal(ctx.out['X-Group'], 'BBMO-01-23');
  });

  it('errorHandler: 404 → { error, status }, как в задании', async () => {
    const ctx = await run([errorHandler({ log: () => {} })], makeCtx(), async () => { throw new ApiError(404, 'User not found'); });
    assert.deepEqual(ctx.body, { error: 'User not found', status: 404 });
  });

  it('errorHandler: ошибки валидации → 400 с details', async () => {
    const details = [{ field: 'name', message: 'минимум 2 символа' }];
    const ctx = await run([errorHandler({ log: () => {} })], makeCtx(), async () => { throw new ApiError(400, 'Validation failed', details); });
    assert.equal(ctx.status, 400);
    assert.deepEqual(ctx.body, { error: 'Validation failed', details, status: 400 });
  });

  it('errorHandler: дубликат (11000) → 409; неизвестная ошибка → 500 без утечки деталей', async () => {
    let ctx = await run([errorHandler({ log: () => {} })], makeCtx(), async () => { throw Object.assign(new Error('dup'), { code: 11000 }); });
    assert.deepEqual(ctx.body, { error: 'Email already exists', status: 409 });
    const logged = [];
    ctx = await run([errorHandler({ log: (m) => logged.push(m) })], makeCtx(), async () => { throw new Error('secret db password'); });
    assert.equal(ctx.status, 500);
    assert.deepEqual(ctx.body, { error: 'Internal server error', status: 500 });
    assert.ok(logged[0].includes('secret db password'), 'подробности — только в лог');
  });

  it('errorHandler: ошибка bodyParser (413) сохраняет статус', async () => {
    const ctx = await run([errorHandler({ log: () => {} })], makeCtx(), async () => { throw Object.assign(new Error('request entity too large'), { status: 413, expose: true }); });
    assert.equal(ctx.status, 413);
  });

  it('неизвестный маршрут → 404 { error: "Not found" }', async () => {
    const ctx = await run([errorHandler({ log: () => {} })], makeCtx());
    assert.deepEqual(ctx.body, { error: 'Not found', status: 404 });
  });

  it('injectDb кладёт подключение в ctx.db', async () => {
    const db = { name: 'db' };
    const ctx = await run([injectDb(db)], makeCtx());
    assert.equal(ctx.db, db);
  });
});
