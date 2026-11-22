'use strict';

/**
 * E2E: полный цикл с реальной MongoDB (mongodb-memory-server) и настоящими сервисами.
 * При первом запуске mongodb-memory-server скачивает бинарник MongoDB (нужен интернет, ~100 МБ).
 */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const request = require('supertest');
const { MongoMemoryServer } = require('mongodb-memory-server');
const { MongoClient } = require('mongodb');
const { load } = require('../support/helpers');
const { SECRETS } = require('../support/testApp');

jest.setTimeout(120000);

const { loadConfig } = load('src/config');
const { createApp } = load('src/app');
const { buildServices } = load('src/container');
const { createEventBus } = load('src/utils/eventBus');
const { createMetrics } = load('src/metrics');
const { createMemoryLogger } = load('src/utils/logger');
const { buildSpec } = load('src/docs/swagger');

let mongod; let client; let db; let agent; let uploadDir; let events;
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32)]);

const bearer = (token) => ({ Authorization: `Bearer ${token}` });

async function registerUser(name, email, password = 'secret123') {
  const res = await agent.post('/api/auth/register').send({ name, email, password });
  return { id: res.body.data.userId, accessToken: res.body.accessToken, refreshToken: res.body.refreshToken, status: res.status };
}

async function loginAs(email, password = 'secret123') {
  const res = await agent.post('/api/auth/login').send({ email, password });
  return res.body;
}

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  client = new MongoClient(mongod.getUri());
  await client.connect();
  db = client.db('bbmo_e2e');

  uploadDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bbmo-e2e-'));
  const config = loadConfig({ ...SECRETS, RATE_LIMIT_MAX: '10000', BCRYPT_ROUNDS: '4', UPLOAD_DIR: uploadDir });
  const logger = createMemoryLogger();
  const bus = createEventBus();
  events = [];
  bus.on('user', (e) => events.push(e));

  const built = buildServices({ db, config, logger, bus });
  await built.ensureIndexes();
  const app = createApp({ config, logger, services: built.services, tokens: built.tokens, metrics: createMetrics(), isDbUp: built.isDbUp, uploads: built.uploads, spec: buildSpec() });
  agent = request(app.callback());
});

afterAll(async () => {
  if (client) await client.close();
  if (mongod) await mongod.stop();
  fs.rmSync(uploadDir, { recursive: true, force: true });
});

describe('E2E: регистрация, вход, токены', () => {
  it('регистрация → 201, роль user, пароль в БД — bcrypt-хэш (не открытый текст)', async () => {
    const res = await agent.post('/api/auth/register').send({ name: 'Иван Иванов', email: 'ivan@example.com', password: 'secret123' });
    expect(res.status).toBe(201);
    expect(res.body.data.email).toBe('ivan@example.com');
    expect(res.body.accessToken).toBeTruthy();
    const doc = await db.collection('users').findOne({ email: 'ivan@example.com' });
    expect(doc.role).toBe('user');
    expect(doc.password).toBeUndefined();
    expect(doc.password_hash).toMatch(/^\$2[aby]\$04\$/); // 4 раунда в тестах для скорости; в приложении — 10
    expect(doc.password_hash).not.toContain('secret123');
  });

  it('повторная регистрация → 409; вход верный → токены; неверный → 401', async () => {
    expect((await agent.post('/api/auth/register').send({ name: 'Иван', email: 'ivan@example.com', password: 'secret123' })).status).toBe(409);
    const ok = await agent.post('/api/auth/login').send({ email: 'ivan@example.com', password: 'secret123' });
    expect(ok.status).toBe(200);
    expect(ok.body.expiresIn).toBe(900);
    const bad = await agent.post('/api/auth/login').send({ email: 'ivan@example.com', password: 'nope' });
    const unknown = await agent.post('/api/auth/login').send({ email: 'nobody@example.com', password: 'secret123' });
    expect([bad.status, unknown.status]).toEqual([401, 401]);
    expect(bad.body).toEqual(unknown.body);
  });

  it('NoSQL-инъекция во входе не работает: 400, а не вход без пароля', async () => {
    const res = await agent.post('/api/auth/login').send({ email: { $ne: null }, password: { $ne: null } });
    expect(res.status).toBe(400);
  });

  it('refresh: ротация токенов, повторное использование старого → 401; logout отзывает токен', async () => {
    const { refreshToken } = await loginAs('ivan@example.com');
    const fresh = await agent.post('/api/auth/refresh').send({ refreshToken });
    expect(fresh.status).toBe(200);
    expect((await agent.post('/api/auth/refresh').send({ refreshToken })).status).toBe(401);
    expect((await agent.post('/api/auth/logout').send({ refreshToken: fresh.body.refreshToken })).status).toBe(200);
    expect((await agent.post('/api/auth/refresh').send({ refreshToken: fresh.body.refreshToken })).status).toBe(401);
  });
});

describe('E2E: пользователи — CRUD, поиск, фильтры, статистика', () => {
  let ivan;
  beforeAll(async () => {
    ivan = await loginAs('ivan@example.com');
    const mk = (name, email, group_name, course, age) => agent.post('/api/users').set(bearer(ivan.accessToken)).send({ name, email, group_name, course, age });
    await mk('Мария Петрова', 'maria@example.com', 'ББМО-01-23', 2, 19);
    await mk('Иван Петров', 'ivan.p@example.com', 'ББМО-02-23', 2, 22);
    await mk('Олег Сидоров', 'oleg@example.com', 'ББМО-01-23', 3, 25);
  });

  it('создание без токена → 401; дубликат email → 409; ошибки валидации → 400', async () => {
    expect((await agent.post('/api/users').send({ name: 'Хакер', email: 'h@example.com', group_name: 'ББМО-01-23' })).status).toBe(401);
    const dup = await agent.post('/api/users').set(bearer(ivan.accessToken)).send({ name: 'Мария', email: 'MARIA@example.com', group_name: 'ББМО-01-23' });
    expect(dup.status).toBe(409);
    expect(dup.body.error).toBe('Email already exists');
    const invalid = await agent.post('/api/users').set(bearer(ivan.accessToken)).send({ name: 'П', email: 'invalid' });
    expect(invalid.status).toBe(400);
  });

  it('GET /api/users: пагинация (total, page, limit, pages) и сортировка', async () => {
    const res = await agent.get('/api/users').query({ page: 1, limit: 2, sort: '-age' });
    expect(res.status).toBe(200);
    expect(res.body.pagination).toEqual({ total: 4, page: 1, limit: 2, pages: 2 });
    expect(res.body.data).toHaveLength(2);
    expect(res.body.data[0].age).toBeGreaterThanOrEqual(res.body.data[1].age ?? 0);
    expect(res.body.data[0].password_hash).toBeUndefined();
  });

  it('фильтры: группа + курс, возраст; комбинирование', async () => {
    const byGroup = await agent.get('/api/users').query({ group_name: 'ББМО-01-23' });
    expect(byGroup.body.pagination.total).toBe(2);
    const combo = await agent.get('/api/users').query({ group_name: 'ББМО-01-23', course: 3 });
    expect(combo.body.data.map((u) => u.name)).toEqual(['Олег Сидоров']);
    const ages = await agent.get('/api/users').query({ age_min: 20, age_max: 23 });
    expect(ages.body.data.map((u) => u.name)).toEqual(['Иван Петров']);
  });

  it('полнотекстовый поиск с ранжированием: /search?q=Иван', async () => {
    const res = await agent.get('/api/users/search').query({ q: 'Иван' });
    expect(res.status).toBe(200);
    expect(res.body.found).toBeGreaterThanOrEqual(2);
    expect(res.body.data[0]).toHaveProperty('score');
    const scores = res.body.data.map((u) => u.score);
    expect([...scores].sort((a, b) => b - a)).toEqual(scores);
  });

  it('статистика агрегацией: total, averageAge, byGroup, byCourse', async () => {
    const res = await agent.get('/api/users/stats');
    expect(res.body.total).toBe(4);
    expect(res.body.byGroup).toEqual({ 'ББМО-01-23': 3, 'ББМО-02-23': 1 });
    expect(res.body.byCourse).toEqual({ 2: 2, 3: 1 });
    expect(res.body.averageAge).toBeCloseTo(22, 0);
  });

  it('GET по id и несуществующий id: 200 / 404', async () => {
    const list = await agent.get('/api/users').query({ search: 'Олег' });
    const id = list.body.data[0]._id;
    expect((await agent.get(`/api/users/${id}`)).body.data.name).toBe('Олег Сидоров');
    expect((await agent.get('/api/users/999')).status).toBe(404);
    expect((await agent.get('/api/users/65a5b1c2d3e4f5a6b7c8d9e0')).status).toBe(404);
  });
});

describe('E2E: роли, мягкое удаление, импорт/экспорт, аватар, уведомления', () => {
  let admin; let user; let userId;

  beforeAll(async () => {
    await registerUser('Администратор', 'admin@example.com');
    await db.collection('users').updateOne({ email: 'admin@example.com' }, { $set: { role: 'admin' } });
    admin = await loginAs('admin@example.com'); // токен получает роль из БД
    const reg = await registerUser('Анна Смирнова', 'anna@example.com');
    userId = reg.id;
    user = await loginAs('anna@example.com');
  });

  it('обычный пользователь не видит админский список (403), админ — видит', async () => {
    expect((await agent.get('/api/admin/users').set(bearer(user.accessToken))).status).toBe(403);
    const res = await agent.get('/api/admin/users').set(bearer(admin.accessToken));
    expect(res.status).toBe(200);
    expect(res.body.data.some((u) => u.email === 'admin@example.com' && u.role === 'admin')).toBe(true);
  });

  it('админ назначает роль moderator', async () => {
    const res = await agent.put(`/api/admin/users/${userId}/role`).set(bearer(admin.accessToken)).send({ role: 'moderator' });
    expect(res.status).toBe(200);
    expect(res.body.data.role).toBe('moderator');
    await agent.put(`/api/admin/users/${userId}/role`).set(bearer(admin.accessToken)).send({ role: 'user' });
  });

  it('аватар: png принимается и раздаётся; текст под видом png → 400; чужой профиль → 403', async () => {
    const ok = await agent.post(`/api/users/${userId}/avatar`).set(bearer(user.accessToken)).attach('avatar', PNG, { filename: 'a.png', contentType: 'image/png' });
    expect(ok.status).toBe(200);
    const url = ok.body.data.avatarUrl;
    expect(url).toMatch(/^\/uploads\/[a-f0-9]{24}\.png$/);
    expect(fs.existsSync(path.join(uploadDir, path.basename(url)))).toBe(true);
    const file = await agent.get(url);
    expect(file.status).toBe(200);
    expect(file.headers['x-content-type-options']).toBe('nosniff');

    const filesBefore = fs.readdirSync(uploadDir).length;
    const fake = await agent.post(`/api/users/${userId}/avatar`).set(bearer(user.accessToken)).attach('avatar', Buffer.from('<?php echo 1; ?> not an image'), { filename: 'x.png', contentType: 'image/png' });
    expect(fake.status).toBe(400);
    expect(fs.readdirSync(uploadDir).length).toBe(filesBefore); // мусорный файл удалён

    const other = await loginAs('ivan@example.com');
    expect((await agent.post(`/api/users/${userId}/avatar`).set(bearer(other.accessToken)).attach('avatar', PNG, { filename: 'a.png', contentType: 'image/png' })).status).toBe(403);
    expect((await agent.get('/uploads/..%2F..%2Fetc%2Fpasswd')).status).toBe(404);
  });

  it('экспорт CSV и JSON (admin): заголовки, содержимое', async () => {
    const csv = await agent.get('/api/users/export').set(bearer(admin.accessToken));
    expect(csv.status).toBe(200);
    expect(csv.headers['content-type']).toMatch(/text\/csv/);
    expect(csv.text).toContain('anna@example.com');
    expect(csv.text).not.toContain('password_hash');
    const json = await agent.get('/api/users/export').query({ format: 'json' }).set(bearer(admin.accessToken));
    expect(JSON.parse(json.text).some((u) => u.email === 'anna@example.com')).toBe(true);
    expect((await agent.get('/api/users/export').set(bearer(user.accessToken))).status).toBe(403);
  });

  it('импорт (admin): валидные добавляются, дубликаты и невалидные пропускаются с причиной', async () => {
    const res = await agent.post('/api/users/import').set(bearer(admin.accessToken)).send([
      { name: 'Импорт Один', email: 'import1@example.com', group_name: 'ББМО-03-23', course: 1, age: 18 },
      { name: 'Импорт Два', email: 'import2@example.com', group_name: 'ББМО-03-23' },
      { name: 'Дубль', email: 'anna@example.com', group_name: 'ББМО-03-23' },
      { name: 'П', email: 'плохой' },
    ]);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ received: 4, inserted: 2 });
    expect(res.body.data.skipped.map((s) => s.index)).toEqual([2, 3]);
    expect(await db.collection('users').countDocuments({ email: /^import\d@example\.com$/ })).toBe(2);
    expect((await agent.post('/api/users/import').set(bearer(user.accessToken)).send([])).status).toBe(403);
  });

  it('soft delete: DELETE ставит deleted_at, запись скрыта, сессии отозваны; admin восстанавливает', async () => {
    const victim = await registerUser('Удаляемый', 'victim@example.com');
    const del = await agent.delete(`/api/users/${victim.id}`).set(bearer(victim.accessToken)); // владелец
    expect(del.status).toBe(200);

    expect((await agent.get(`/api/users/${victim.id}`)).status).toBe(404);
    const search = await agent.get('/api/users').query({ search: 'Удаляемый' });
    expect(search.body.data).toHaveLength(0);

    const raw = await db.collection('users').findOne({ email: 'victim@example.com' });
    expect(raw).not.toBeNull();
    expect(raw.deleted_at).toBeInstanceOf(Date);

    expect((await agent.post('/api/auth/refresh').send({ refreshToken: victim.refreshToken })).status).toBe(401);
    expect((await agent.post('/api/auth/login').send({ email: 'victim@example.com', password: 'secret123' })).status).toBe(401);

    const onlyDeleted = await agent.get('/api/admin/users').query({ deleted: 'only' }).set(bearer(admin.accessToken));
    expect(onlyDeleted.body.data.map((u) => u.email)).toContain('victim@example.com');

    expect((await agent.post(`/api/admin/users/${victim.id}/restore`).set(bearer(admin.accessToken))).status).toBe(200);
    expect((await agent.get(`/api/users/${victim.id}`)).status).toBe(200);
  });

  it('moderator не может удалять чужие записи, admin может', async () => {
    await db.collection('users').updateOne({ email: 'anna@example.com' }, { $set: { role: 'moderator' } });
    const mod = await loginAs('anna@example.com');
    const target = await registerUser('Цель', 'target@example.com');
    expect((await agent.delete(`/api/users/${target.id}`).set(bearer(mod.accessToken))).status).toBe(403);
    expect((await agent.put(`/api/users/${target.id}`).set(bearer(mod.accessToken)).send({ age: 30 })).status).toBe(200);
    expect((await agent.delete(`/api/users/${target.id}`).set(bearer(admin.accessToken))).status).toBe(200);
    await db.collection('users').updateOne({ email: 'anna@example.com' }, { $set: { role: 'user' } });
  });

  it('события пользователей публикуются в шину (источник WebSocket-уведомлений)', () => {
    const types = new Set(events.map((e) => e.type));
    for (const t of ['created', 'updated', 'deleted', 'restored', 'imported']) expect(types.has(t)).toBe(true);
  });

  it('/health и /ready: БД подключена; /metrics доступен', async () => {
    expect((await agent.get('/health')).body).toMatchObject({ status: 'ok', db: 'connected' });
    expect((await agent.get('/ready')).body).toEqual({ ready: true });
    expect((await agent.get('/metrics')).text).toContain('http_requests_total');
  });
});
