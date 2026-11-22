'use strict';

const request = require('supertest');
const jwt = require('jsonwebtoken');
const { buildTestApp, SECRETS } = require('../support/testApp');

describe('API (HTTP-слой, supertest): заголовки и ошибки', () => {
  const ctx = buildTestApp();
  const agent = request(ctx.app.callback());

  it('все ответы содержат X-Group и X-Request-Id', async () => {
    const res = await agent.get('/api/users').set('X-Request-Id', 'req-12345678');
    expect(res.status).toBe(200);
    expect(res.headers['x-group']).toBe('BBMO-01-23');
    expect(res.headers['x-request-id']).toBe('req-12345678');
  });

  it('неизвестный маршрут → 404 JSON, заголовок X-Group сохраняется', async () => {
    const res = await agent.get('/api/unknown');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Not found', status: 404 });
    expect(res.headers['x-group']).toBe('BBMO-01-23');
  });

  it('Helmet: заголовки безопасности', async () => {
    const res = await agent.get('/api/users');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('CORS: только источники из белого списка', async () => {
    const allowed = await agent.get('/api/users').set('Origin', 'http://allowed.example');
    expect(allowed.headers['access-control-allow-origin']).toBe('http://allowed.example');
    const denied = await agent.get('/api/users').set('Origin', 'http://evil.example');
    expect(denied.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('слишком большое тело → 413', async () => {
    const res = await agent.post('/api/auth/login').send({ email: 'a'.repeat(Math.round(1.2 * 1024 * 1024)) });
    expect(res.status).toBe(413);
  });
});

describe('API: чтение пользователей (публичные маршруты)', () => {
  const ctx = buildTestApp();
  const agent = request(ctx.app.callback());

  it('GET /api/users: значения по умолчанию page=1, limit=10 доходят до сервиса', async () => {
    const res = await agent.get('/api/users');
    expect(res.status).toBe(200);
    expect(res.body.pagination).toMatchObject({ page: 1, limit: 10 });
    expect(ctx.services.userService.calls.at(-1)[1]).toMatchObject({ page: 1, limit: 10 });
  });

  it('?page=2&limit=5&sort=-age&group_name=ББМО-01-23&course=2 — query приводится к числам', async () => {
    await agent.get('/api/users').query({ page: 2, limit: 5, sort: '-age', group_name: 'ББМО-01-23', course: 2 });
    expect(ctx.services.userService.calls.at(-1)[1]).toEqual({ page: 2, limit: 5, sort: '-age', group_name: 'ББМО-01-23', course: 2 });
  });

  it('?page=0 → 400 "должно быть больше 0" (пример из задания)', async () => {
    const res = await agent.get('/api/users').query({ page: 0 });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'Validation failed', details: [{ field: 'page', message: 'должно быть больше 0' }], status: 400 });
  });

  it('невалидные limit, sort, group_name → 400 со всеми ошибками сразу', async () => {
    const res = await agent.get('/api/users').query({ limit: 101, sort: 'password_hash', group_name: 'xx' });
    expect(res.status).toBe(400);
    expect(res.body.details.map((d) => d.field).sort()).toEqual(['group_name', 'limit', 'sort']);
  });

  it('GET /api/users/:id → 200; несуществующий → 404 "User not found"', async () => {
    expect((await agent.get('/api/users/abc')).body.data).toMatchObject({ _id: 'abc' });
    const res = await agent.get('/api/users/missing');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'User not found', status: 404 });
  });

  it('/stats и /search не перехватываются маршрутом /:id', async () => {
    expect((await agent.get('/api/users/stats')).body).toHaveProperty('total');
    expect((await agent.get('/api/users/search').query({ q: 'Иван' })).body).toHaveProperty('found');
    expect((await agent.get('/api/users/search')).status).toBe(400);
  });
});

describe('API: аутентификация и авторизация', () => {
  const ctx = buildTestApp();
  const agent = request(ctx.app.callback());
  const body = { name: 'Пётр', email: 'petr@example.com', group_name: 'ББМО-01-23', age: 20 };

  it('POST /api/users без токена → 401 Unauthorized', async () => {
    const res = await agent.post('/api/users').send(body);
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'Unauthorized', status: 401 });
  });

  it('неверный и истёкший токены → 401; у истёкшего есть подсказка', async () => {
    const bad = await agent.post('/api/users').set('Authorization', 'Bearer not.a.jwt').send(body);
    expect(bad.body.error).toBe('Invalid token');
    const expired = jwt.sign({ userId: 'U1', email: 'a@b.ru', role: 'user' }, SECRETS.JWT_ACCESS_SECRET, { algorithm: 'HS256', expiresIn: -10 });
    const res = await agent.post('/api/users').set('Authorization', `Bearer ${expired}`).send(body);
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Token expired');
    expect(res.body.hint).toMatch(/api\/auth\/refresh/);
  });

  it('токен, подписанный другим секретом, отклоняется', async () => {
    const forged = jwt.sign({ userId: 'U1', email: 'a@b.ru', role: 'admin' }, 'x'.repeat(40), { algorithm: 'HS256' });
    expect((await agent.get('/api/admin/users').set('Authorization', `Bearer ${forged}`)).status).toBe(401);
  });

  it('POST /api/users с токеном: ошибки валидации → 400 (name, email), успех → 201 + Location', async () => {
    const auth = ctx.auth(ctx.tokenFor('user'));
    const invalid = await agent.post('/api/users').set(auth).send({ name: 'П', email: 'invalid' });
    expect(invalid.status).toBe(400);
    expect(invalid.body.details).toEqual(expect.arrayContaining([
      { field: 'name', message: 'минимум 2 символа' },
      { field: 'email', message: 'неверный формат' },
      { field: 'group_name', message: 'обязательное поле' },
    ]));
    const created = await agent.post('/api/users').set(auth).send(body);
    expect(created.status).toBe(201);
    expect(created.headers.location).toBe('/api/users/new1');
  });

  it('PUT: чужой user → 403, владелец и moderator → 200', async () => {
    const put = (token, id) => agent.put(`/api/users/${id}`).set(ctx.auth(token)).send({ age: 21 });
    expect((await put(ctx.tokenFor('user', 'U2'), 'U1')).status).toBe(403);
    expect((await put(ctx.tokenFor('user', 'U1'), 'U1')).status).toBe(200);
    expect((await put(ctx.tokenFor('moderator', 'M1'), 'U1')).status).toBe(200);
  });

  it('DELETE: владелец и admin → 200; moderator и чужой user → 403', async () => {
    const del = (token) => agent.delete('/api/users/U1').set(ctx.auth(token));
    expect((await del(ctx.tokenFor('user', 'U1'))).status).toBe(200);
    expect((await del(ctx.tokenFor('admin', 'A1'))).status).toBe(200);
    expect((await del(ctx.tokenFor('moderator', 'M1'))).status).toBe(403);
    expect((await del(ctx.tokenFor('user', 'U2'))).body.error).toBe('Forbidden: admin role or ownership required');
  });

  it('GET /api/admin/users: user → 403 "Forbidden: admin role required", admin → 200', async () => {
    const forbidden = await agent.get('/api/admin/users').set(ctx.auth(ctx.tokenFor('user')));
    expect(forbidden.status).toBe(403);
    expect(forbidden.body).toEqual({ error: 'Forbidden: admin role required', status: 403 });
    expect((await agent.get('/api/admin/users').set(ctx.auth(ctx.tokenFor('admin')))).status).toBe(200);
    expect((await agent.get('/api/admin/users')).status).toBe(401);
  });

  it('назначение роли и восстановление — только admin; роль из списка', async () => {
    const admin = ctx.auth(ctx.tokenFor('admin'));
    expect((await agent.put('/api/admin/users/U1/role').set(admin).send({ role: 'moderator' })).body.data.role).toBe('moderator');
    expect((await agent.put('/api/admin/users/U1/role').set(admin).send({ role: 'root' })).status).toBe(400);
    expect((await agent.post('/api/admin/users/U1/restore').set(admin)).status).toBe(200);
    expect((await agent.put('/api/admin/users/U1/role').set(ctx.auth(ctx.tokenFor('user'))).send({ role: 'admin' })).status).toBe(403);
  });

  it('вход: неверный пароль → 401 Invalid credentials; верный → токены', async () => {
    const wrong = await agent.post('/api/auth/login').send({ email: 'ivan@example.com', password: 'wrong' });
    expect(wrong.status).toBe(401);
    expect(wrong.body).toEqual({ error: 'Invalid credentials', status: 401 });
    const ok = await agent.post('/api/auth/login').send({ email: 'ivan@example.com', password: 'secret123' });
    expect(ok.body).toMatchObject({ accessToken: 'a', refreshToken: 'r', expiresIn: 900 });
  });

  it('NoSQL-инъекция в теле входа → 400', async () => {
    const res = await agent.post('/api/auth/login').send({ email: { $ne: null }, password: { $ne: null } });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid input');
  });

  it('регистрация: короткий пароль и попытка передать role → 400', async () => {
    expect((await agent.post('/api/auth/register').send({ name: 'Иван', email: 'i@example.com', password: 'short' })).status).toBe(400);
    const res = await agent.post('/api/auth/register').send({ name: 'Иван', email: 'i@example.com', password: 'secret123', role: 'admin' });
    expect(res.status).toBe(400);
    expect(res.body.details).toEqual([{ field: 'role', message: 'неизвестное поле' }]);
    expect((await agent.post('/api/auth/register').send({ name: 'Иван', email: 'i@example.com', password: 'secret123' })).status).toBe(201);
  });

  it('refresh и logout требуют refreshToken', async () => {
    expect((await agent.post('/api/auth/refresh').send({})).status).toBe(400);
    expect((await agent.post('/api/auth/refresh').send({ refreshToken: 'x'.repeat(30) })).body).toMatchObject({ accessToken: 'a2' });
    expect((await agent.post('/api/auth/logout').send({ refreshToken: 'x'.repeat(30) })).body.data).toEqual({ loggedOut: true });
  });
});

describe('API: экспорт и импорт', () => {
  const ctx = buildTestApp();
  const agent = request(ctx.app.callback());

  it('GET /api/users/export: 401 без токена, 403 для user, 200 и CSV для admin', async () => {
    expect((await agent.get('/api/users/export')).status).toBe(401);
    expect((await agent.get('/api/users/export').set(ctx.auth(ctx.tokenFor('user')))).status).toBe(403);
    const res = await agent.get('/api/users/export').set(ctx.auth(ctx.tokenFor('admin')));
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/csv/);
    expect(res.headers['content-disposition']).toMatch(/attachment; filename="users\.csv"/);
    expect(res.text).toContain('Иван');
  });

  it('?format=json отдаёт application/json; неизвестный формат → 400', async () => {
    const res = await agent.get('/api/users/export').query({ format: 'json' }).set(ctx.auth(ctx.tokenFor('moderator')));
    expect(res.headers['content-disposition']).toMatch(/users\.json/);
    expect((await agent.get('/api/users/export').query({ format: 'xml' }).set(ctx.auth(ctx.tokenFor('admin')))).status).toBe(400);
  });

  it('POST /api/users/import — только admin', async () => {
    const items = [{ name: 'Мария', email: 'm@example.com', group_name: 'ББМО-01-23' }];
    expect((await agent.post('/api/users/import').set(ctx.auth(ctx.tokenFor('moderator'))).send(items)).status).toBe(403);
    const res = await agent.post('/api/users/import').set(ctx.auth(ctx.tokenFor('admin'))).send(items);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ received: 1, inserted: 1 });
  });
});

describe('API: rate limiting', () => {
  it('сверх лимита → 429, Retry-After и X-RateLimit-*; служебные маршруты лимитом не блокируются', async () => {
    const ctx = buildTestApp({ env: { RATE_LIMIT_MAX: '3' } });
    const agent = request(ctx.app.callback());
    for (let i = 0; i < 3; i++) expect((await agent.get('/api/users')).status).toBe(200);
    const blocked = await agent.get('/api/users');
    expect(blocked.status).toBe(429);
    expect(blocked.body).toMatchObject({ error: 'Too many requests', status: 429 });
    expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);
    expect(blocked.headers['x-ratelimit-remaining']).toBe('0');
    expect((await agent.get('/health')).status).toBe(200);
  });
});

describe('мониторинг: /health, /ready, /metrics', () => {
  const ctx = buildTestApp();
  const agent = request(ctx.app.callback());

  it('/health: status ok, uptime, db connected; при недоступной БД — 503', async () => {
    const ok = await agent.get('/health');
    expect(ok.status).toBe(200);
    expect(ok.body).toMatchObject({ status: 'ok', db: 'connected' });
    expect(typeof ok.body.uptime).toBe('number');
    ctx.dbUp.value = false;
    const down = await agent.get('/health');
    expect(down.status).toBe(503);
    expect(down.body).toMatchObject({ status: 'degraded', db: 'disconnected' });
    ctx.dbUp.value = true;
  });

  it('/ready отражает доступность БД', async () => {
    expect((await agent.get('/ready')).body).toEqual({ ready: true });
    ctx.dbUp.value = false;
    expect((await agent.get('/ready')).status).toBe(503);
    ctx.dbUp.value = true;
  });

  it('/metrics: формат Prometheus, http_requests_total с шаблоном маршрута', async () => {
    await agent.get('/api/users');
    await agent.get('/api/users/missing');
    const res = await agent.get('/metrics');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/plain/);
    expect(res.text).toContain('# TYPE http_requests_total counter');
    expect(res.text).toMatch(/http_requests_total\{[^}]*path="\/api\/users"[^}]*\}\s+\d+/);
    expect(res.text).toMatch(/http_requests_total\{[^}]*path="\/api\/users\/:id"[^}]*\}\s+\d+/);
    expect(res.text).toContain('http_request_duration_seconds');
    expect(res.text).toContain('process_cpu_user_seconds_total');
  });
});

describe('документация: Swagger / OpenAPI', () => {
  const ctx = buildTestApp();
  const agent = request(ctx.app.callback());

  it('/api-docs отдаёт страницу Swagger UI', async () => {
    const res = await agent.get('/api-docs');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/html/);
    expect(res.text.toLowerCase()).toContain('swagger');
  });

  it('/api-docs.json: спецификация собрана из JSDoc контроллеров', async () => {
    const res = await agent.get('/api-docs.json');
    expect(res.body.openapi).toMatch(/^3\./);
    const paths = Object.keys(res.body.paths);
    for (const p of ['/api/users', '/api/users/{id}', '/api/users/search', '/api/users/export', '/api/auth/login', '/api/admin/users', '/health', '/metrics']) {
      expect(paths).toContain(p);
    }
    expect(res.body.components.securitySchemes.bearerAuth).toMatchObject({ type: 'http', scheme: 'bearer' });
  });
});
