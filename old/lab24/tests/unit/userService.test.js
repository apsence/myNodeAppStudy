'use strict';

const assert = require('node:assert/strict');
const { load, collect } = require('../support/helpers');

const { UserService } = load('src/services/userService');
const { createMemoryLogger } = load('src/utils/logger');
const { ValidationError, ConflictError, NotFoundError } = load('src/utils/errors');

const input = { name: 'Иван', email: 'ivan@example.com', group_name: 'ББМО-01-23', age: 20 };

/** Поддельная модель с мягким удалением. */
function fakeUser(initial = []) {
  const users = initial.map((u) => ({ ...u }));
  const calls = {};
  return {
    users, calls,
    async findAll(o) { calls.findAll = o; return users.filter((u) => Boolean(u.deleted_at) === Boolean(o.onlyDeleted)); },
    async count(f, o) { calls.count = o; return users.length; },
    async search(q, l) { return { found: 1, data: [{ name: q, score: 1.5, limit: l }] }; },
    async stats() { return { total: users.length }; },
    stream() { calls.stream = true; return (async function* () { for (const u of users) yield u; })(); },
    async findById(id) { return users.find((u) => u._id === id && !u.deleted_at) || null; },
    async findByEmail(email) { return users.find((u) => u.email === email && !u.deleted_at) || null; },
    async findEmails(emails) { return new Set(users.filter((u) => emails.includes(u.email)).map((u) => u.email)); },
    async create(d) { const u = { _id: String(users.length + 1), ...d }; users.push(u); return u; },
    async insertMany(items) { calls.insertMany = items; items.forEach((d) => users.push({ _id: String(users.length + 1), ...d })); return items.length; },
    async update(id, d) { const u = users.find((x) => x._id === id && !x.deleted_at); return u ? Object.assign(u, d) : null; },
    async setRole(id, role) { const u = users.find((x) => x._id === id); if (!u) return null; u.role = role; return u; },
    async setAvatar(id, f) { const u = users.find((x) => x._id === id); if (!u) return null; const previous = u.avatar || null; u.avatar = f; return { user: u, previous }; },
    async delete(id) { const u = users.find((x) => x._id === id && !x.deleted_at); if (!u) return false; u.deleted_at = new Date(); return true; },
    async restore(id) { const u = users.find((x) => x._id === id && x.deleted_at); if (!u) return null; delete u.deleted_at; return u; },
  };
}

function make(initial) {
  const User = fakeUser(initial);
  const events = [];
  const mails = [];
  const removed = [];
  const revoked = [];
  const uploads = { verify: async (f) => f.endsWith('.png'), remove: async (f) => { if (f) removed.push(f); } };
  const service = new UserService({
    User, logger: createMemoryLogger(),
    mailer: { sendWelcome: async (u) => { mails.push(u.email); } },
    hasher: { hash: async (p) => `h(${p})` },
    bus: { publishUser: (type, id) => events.push([type, String(id)]) },
    uploads,
    revokeSessions: async (id) => { revoked.push(id); },
  });
  return { service, User, events, mails, removed, revoked };
}

describe('UserService: создание, обновление, удаление', () => {
  it('create: хэш пароля, письмо, событие created', async () => {
    const { service, User, mails, events } = make();
    const user = await service.create({ ...input, password: 'secret123' });
    assert.equal(user.password_hash, 'h(secret123)');
    assert.equal(User.users[0].password, undefined);
    assert.deepEqual(mails, ['ivan@example.com']);
    assert.deepEqual(events, [['created', '1']]);
  });

  it('create: занятый email → 409, письма и события нет', async () => {
    const { service, mails, events } = make([{ _id: '1', ...input }]);
    await assert.rejects(service.create(input), ConflictError);
    assert.deepEqual([mails, events], [[], []]);
  });

  it('update: событие updated; чужой email → 409; нет пользователя → 404', async () => {
    const { service, events } = make([{ _id: '1', ...input }, { _id: '2', ...input, email: 'm@example.com' }]);
    assert.equal((await service.update('1', { age: 30 })).age, 30);
    assert.deepEqual(events, [['updated', '1']]);
    await assert.rejects(service.update('1', { email: 'm@example.com' }), ConflictError);
    await assert.rejects(service.update('999', { age: 30 }), NotFoundError);
  });

  it('delete: мягкое удаление, отзыв сессий, событие deleted; повтор → 404', async () => {
    const { service, User, revoked, events } = make([{ _id: '1', ...input }]);
    assert.deepEqual(await service.delete('1'), { deleted: '1' });
    assert.ok(User.users[0].deleted_at instanceof Date, 'запись остаётся в БД');
    assert.deepEqual(revoked, ['1']);
    assert.deepEqual(events, [['deleted', '1']]);
    await assert.rejects(service.delete('1'), NotFoundError);
    assert.deepEqual(revoked, ['1'], 'при 404 сессии не отзываются повторно');
  });

  it('getById не видит удалённых; restore возвращает пользователя и публикует restored', async () => {
    const { service, events } = make([{ _id: '1', ...input }]);
    await service.delete('1');
    await assert.rejects(service.getById('1'), NotFoundError);
    const restored = await service.restore('1');
    assert.equal(restored.deleted_at, undefined);
    assert.equal((await service.getById('1'))._id, '1');
    assert.deepEqual(events.at(-1), ['restored', '1']);
    await assert.rejects(service.restore('1'), (e) => e instanceof NotFoundError && e.message === 'Deleted user not found');
  });

  it('setRole: меняет роль и публикует событие', async () => {
    const { service, events } = make([{ _id: '1', ...input }]);
    assert.equal((await service.setRole('1', 'moderator')).role, 'moderator');
    assert.deepEqual(events, [['updated', '1']]);
    await assert.rejects(service.setRole('9', 'admin'), NotFoundError);
  });
});

describe('UserService: список и экспорт', () => {
  it('deleted=only показывает только удалённых (admin)', async () => {
    const { service, User } = make([{ _id: '1', ...input }, { _id: '2', ...input, email: 'x@x.ru', deleted_at: new Date() }]);
    const res = await service.list({ page: 1, limit: 10, deleted: 'only' });
    assert.equal(User.calls.findAll.onlyDeleted, true);
    assert.deepEqual(res.data.map((u) => u._id), ['2']);
    assert.equal((await service.list({ page: 1, limit: 10 })).data[0]._id, '1');
  });

  it('exportStream: csv по умолчанию и json', async () => {
    const { service } = make([{ _id: '1', ...input }]);
    const csv = service.exportStream({});
    assert.equal(csv.format, 'csv');
    assert.ok((await collect(csv.stream)).includes('ivan@example.com'));
    const json = service.exportStream({ format: 'json' });
    assert.equal(json.format, 'json');
    assert.equal(JSON.parse(await collect(json.stream))[0].email, 'ivan@example.com');
  });

  it('search и stats делегируются модели', async () => {
    const { service } = make([{ _id: '1', ...input }]);
    assert.equal((await service.search({ q: 'Иван' })).found, 1);
    assert.equal((await service.stats()).total, 1);
  });
});

describe('UserService: аватар', () => {
  it('успех: старый файл удаляется, событие updated', async () => {
    const { service, removed, events } = make([{ _id: '1', ...input, avatar: 'old.png' }]);
    const user = await service.setAvatar('1', 'new.png');
    assert.equal(user.avatar, 'new.png');
    assert.deepEqual(removed, ['old.png']);
    assert.deepEqual(events, [['updated', '1']]);
  });

  it('файл не картинка → 400 и файл удаляется с диска', async () => {
    const { service, removed } = make([{ _id: '1', ...input }]);
    await assert.rejects(service.setAvatar('1', 'evil.php'), ValidationError);
    assert.deepEqual(removed, ['evil.php']);
  });

  it('пользователь не найден → 404 и загруженный файл удаляется', async () => {
    const { service, removed } = make();
    await assert.rejects(service.setAvatar('9', 'x.png'), NotFoundError);
    assert.deepEqual(removed, ['x.png']);
  });
});

describe('UserService: импорт', () => {
  it('разбор: валидные добавляются; невалидные, дубликаты в файле, существующие email и лишние поля пропускаются с причиной', async () => {
    const { service, User, events } = make([{ _id: '1', ...input, email: 'exists@example.com' }]);
    const res = await service.importUsers([
      { name: 'Мария', email: 'maria@example.com', group_name: 'ББМО-01-23' },
      { name: 'П', email: 'bad' },
      { name: 'Мария 2', email: 'maria@example.com', group_name: 'ББМО-01-23' },
      { name: 'Олег', email: 'exists@example.com', group_name: 'ББМО-01-23' },
      { name: 'Хакер', email: 'h@example.com', group_name: 'ББМО-01-23', role: 'admin' },
      { name: 'Анна', email: 'anna@example.com', group_name: 'ББМО-02-23', age: 19 },
    ]);
    assert.equal(res.received, 6);
    assert.equal(res.inserted, 2);
    assert.deepEqual(User.calls.insertMany.map((u) => u.email), ['maria@example.com', 'anna@example.com']);
    assert.deepEqual(res.skipped.map((s) => s.index), [1, 2, 3, 4]);
    assert.match(res.skipped[0].reason, /name: минимум 2 символа/);
    assert.equal(res.skipped[1].reason, 'дубликат внутри файла');
    assert.equal(res.skipped[2].reason, 'email уже существует');
    assert.match(res.skipped[3].reason, /недопустимые поля: role/);
    assert.deepEqual(events, [['imported', 'bulk']]);
  });

  it('пустой, не массив и слишком большой ввод отклоняются; без валидных записей вставки нет', async () => {
    const { service, User, events } = make();
    await assert.rejects(service.importUsers([]), ValidationError);
    await assert.rejects(service.importUsers({}), ValidationError);
    await assert.rejects(service.importUsers(new Array(1001).fill({})), ValidationError);
    const res = await service.importUsers([{ name: 'П' }]);
    assert.equal(res.inserted, 0);
    assert.equal(User.calls.insertMany, undefined);
    assert.deepEqual(events, []);
  });
});
