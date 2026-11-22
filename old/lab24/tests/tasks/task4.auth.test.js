'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { ROOT, load, has, makeCtx, run, memoryLogger } = require('./_helpers');

const { loadConfig } = load('task4/config');
const { RateLimiter } = load('task4/utils/rateLimiter');
const { findForbiddenKey } = load('task4/utils/sanitize');
const { canModifyUser, canDeleteUser, ROLES } = load('task4/utils/policies');
const { createTokenService } = load('task4/utils/tokens');
const { createHasher } = load('task4/utils/password');
const { AuthService } = load('task4/services/authService');
const { authMiddleware, requireRole, requireOwnerOr } = load('task4/middleware/auth');
const { rateLimitMiddleware, sanitizeMiddleware } = load('task4/middleware/security');
const { errorMiddleware } = load('task4/middleware/error');
const { validateUserData } = load('task4/models/validation');
const { UnauthorizedError, ForbiddenError, ConflictError, ValidationError, TooManyRequestsError } = load('task4/utils/errors');

const SECRETS = { JWT_ACCESS_SECRET: 'a'.repeat(40), JWT_REFRESH_SECRET: 'b'.repeat(40) };
const config = loadConfig(SECRETS);

describe('Задание 4: конфигурация и секреты (.env)', () => {
  it('значения по умолчанию: access 15 мин, refresh 7 дней, bcrypt 10 раундов, 100 запросов/мин', () => {
    assert.equal(config.jwt.accessTtl, 900);
    assert.equal(config.jwt.refreshTtl, 604800);
    assert.equal(config.bcryptRounds, 10);
    assert.deepEqual(config.rateLimit, { limit: 100, windowMs: 60000 });
  });

  it('слабые, отсутствующие и одинаковые секреты — отказ запуска', () => {
    assert.throws(() => loadConfig({}), /JWT_ACCESS_SECRET/);
    assert.throws(() => loadConfig({ JWT_ACCESS_SECRET: 'short', JWT_REFRESH_SECRET: 'b'.repeat(40) }), /не короче 32/);
    assert.throws(() => loadConfig({ JWT_ACCESS_SECRET: 'a'.repeat(40), JWT_REFRESH_SECRET: 'a'.repeat(40) }), /должны отличаться/);
    assert.throws(() => loadConfig({ NODE_ENV: 'production', JWT_ACCESS_SECRET: `change-me${'a'.repeat(30)}`, JWT_REFRESH_SECRET: 'b'.repeat(40) }), /заглушки/);
  });

  it('CORS-белый список разбирается из строки', () => {
    assert.deepEqual(loadConfig({ ...SECRETS, CORS_ORIGINS: 'http://a.ru, http://b.ru ,' }).corsOrigins, ['http://a.ru', 'http://b.ru']);
  });
});

describe('Задание 4: rate limiting (100 запросов в минуту на IP)', () => {
  it('первые 100 запросов проходят, 101-й блокируется', () => {
    const limiter = new RateLimiter({ limit: 100, windowMs: 60000, now: () => 0 });
    let last;
    for (let i = 1; i <= 100; i++) { last = limiter.hit('1.2.3.4'); assert.equal(last.allowed, true, `запрос ${i}`); }
    assert.equal(last.remaining, 0);
    const blocked = limiter.hit('1.2.3.4');
    assert.equal(blocked.allowed, false);
    assert.equal(blocked.retryAfter, 60);
  });

  it('счётчики раздельные для разных IP; окно сбрасывается по истечении времени', () => {
    let t = 0;
    const limiter = new RateLimiter({ limit: 2, windowMs: 1000, now: () => t });
    limiter.hit('a'); limiter.hit('a');
    assert.equal(limiter.hit('a').allowed, false);
    assert.equal(limiter.hit('b').allowed, true);
    t = 1000;
    assert.equal(limiter.hit('a').allowed, true);
  });

  it('sweep удаляет истёкшие окна (память не растёт бесконечно)', () => {
    let t = 0;
    const limiter = new RateLimiter({ limit: 1, windowMs: 10, now: () => t });
    limiter.hit('a'); limiter.hit('b');
    t = 100;
    limiter.sweep();
    assert.equal(limiter.hits.size, 0);
  });

  it('middleware: заголовки X-RateLimit-*, при превышении — 429 с Retry-After', async () => {
    const mw = rateLimitMiddleware({ limit: 2, windowMs: 60000, now: () => 0 });
    const ctx = makeCtx({ ip: '9.9.9.9' });
    await run([mw], ctx);
    assert.equal(ctx.out['X-RateLimit-Limit'], '2');
    assert.equal(ctx.out['X-RateLimit-Remaining'], '1');
    await run([mw], makeCtx({ ip: '9.9.9.9' }));
    const blocked = makeCtx({ ip: '9.9.9.9' });
    await assert.rejects(run([mw], blocked), (e) => e instanceof TooManyRequestsError && e.status === 429);
    assert.equal(blocked.out['Retry-After'], '60');
  });

  it('429 оформляется errorMiddleware как { error, status, retryAfter }', async () => {
    const mw = rateLimitMiddleware({ limit: 1, windowMs: 60000, now: () => 0 });
    await run([mw], makeCtx());
    const ctx = await run([errorMiddleware({ logger: memoryLogger() }), mw], makeCtx());
    assert.equal(ctx.status, 429);
    assert.equal(ctx.body.error, 'Too many requests');
    assert.equal(ctx.body.retryAfter, 60);
  });
});

describe('Задание 4: защита от NoSQL-инъекций', () => {
  it('операторы ($ne, $gt, $where) и точки в ключах находятся на любой глубине', () => {
    assert.equal(findForbiddenKey({ email: { $ne: null } }), 'email.$ne');
    assert.equal(findForbiddenKey({ a: { b: [{ $gt: '' }] } }), 'a.b[0].$gt');
    assert.equal(findForbiddenKey({ 'user.name': 'x' }), 'user.name');
    assert.equal(findForbiddenKey({ name: 'Иван', tags: ['a', 'b'], nested: { ok: 1 } }), null);
    assert.equal(findForbiddenKey(null), null);
    assert.equal(findForbiddenKey('строка'), null);
  });

  it('sanitizeMiddleware: подозрительный body или query → 400 Invalid input', async () => {
    const mw = sanitizeMiddleware();
    await assert.rejects(run([mw], makeCtx({ body: { email: { $ne: null }, password: { $ne: null } } })), (e) => e instanceof ValidationError && e.message === 'Invalid input' && e.details[0].field === 'email.$ne');
    await assert.rejects(run([mw], makeCtx({ query: { 'a.b': '1' } })), ValidationError);
    await run([mw], makeCtx({ body: { email: 'a@b.ru' }, query: { page: '1' } }));
  });
});

describe('Задание 4: роли и политики доступа', () => {
  const admin = { userId: 'A', role: 'admin' };
  const moderator = { userId: 'M', role: 'moderator' };
  const owner = { userId: 'U1', role: 'user' };
  const other = { userId: 'U2', role: 'user' };

  it('роли: user, admin, moderator', () => assert.deepEqual([...ROLES].sort(), ['admin', 'moderator', 'user']));

  it('изменять: владелец, admin, moderator; чужой user — нет', () => {
    assert.equal(canModifyUser(owner, 'U1'), true);
    assert.equal(canModifyUser(admin, 'U1'), true);
    assert.equal(canModifyUser(moderator, 'U1'), true);
    assert.equal(canModifyUser(other, 'U1'), false);
    assert.equal(canModifyUser(null, 'U1'), false);
  });

  it('удалять: только admin или владелец (moderator — нет)', () => {
    assert.equal(canDeleteUser(admin, 'U1'), true);
    assert.equal(canDeleteUser(owner, 'U1'), true);
    assert.equal(canDeleteUser(moderator, 'U1'), false);
    assert.equal(canDeleteUser(other, 'U1'), false);
  });

  it('requireRole: 403 с текстом как в задании', async () => {
    await assert.rejects(run([requireRole('admin')], makeCtx({ user: { role: 'user' } })), (e) => e instanceof ForbiddenError && e.status === 403 && e.message === 'Forbidden: admin role required');
    await assert.rejects(run([requireRole('admin', 'moderator')], makeCtx({ user: { role: 'user' } })), /admin or moderator role required/);
    await run([requireRole('admin')], makeCtx({ user: admin }));
    await assert.rejects(run([requireRole('admin')], makeCtx()), ForbiddenError);
  });

  it('requireOwnerOr: DELETE — владелец или admin; PUT — ещё и moderator', async () => {
    const withParams = (user) => makeCtx({ user, params: { id: 'U1' } });
    await run([requireOwnerOr('delete')], withParams(owner));
    await run([requireOwnerOr('delete')], withParams(admin));
    await assert.rejects(run([requireOwnerOr('delete')], withParams(moderator)), ForbiddenError);
    await assert.rejects(run([requireOwnerOr('delete')], withParams(other)), ForbiddenError);
    await run([requireOwnerOr('modify')], withParams(moderator));
  });

  it('роль можно назначить только из списка (валидация модели)', () => {
    assert.equal(validateUserData({ role: 'admin' }, { partial: true }).valid, true);
    assert.equal(validateUserData({ role: 'superuser' }, { partial: true }).valid, false);
  });
});

describe('Задание 4: authMiddleware (проверка JWT)', () => {
  const tokens = {
    verifyAccess(t) {
      if (t === 'good') return { userId: 'U1', email: 'ivan@example.com', role: 'user' };
      if (t === 'expired') throw new UnauthorizedError('Token expired', { hint: 'use refresh' });
      throw new UnauthorizedError('Invalid token');
    },
  };
  const mw = authMiddleware({ tokens });

  it('без заголовка → 401 Unauthorized (как в задании)', async () => {
    const ctx = makeCtx();
    await assert.rejects(run([mw], ctx), (e) => e.status === 401 && e.message === 'Unauthorized');
    const handled = await run([errorMiddleware({ logger: memoryLogger() }), mw], makeCtx());
    assert.deepEqual(handled.body, { error: 'Unauthorized', status: 401 });
  });

  it('неверная схема или токен → 401 Invalid token', async () => {
    await assert.rejects(run([mw], makeCtx({ headers: { Authorization: 'Basic abc' } })), /Invalid token/);
    await assert.rejects(run([mw], makeCtx({ headers: { Authorization: 'Bearer broken' } })), /Invalid token/);
  });

  it('истёкший токен → 401 Token expired с подсказкой обновить', async () => {
    const handled = await run([errorMiddleware({ logger: memoryLogger() }), mw], makeCtx({ headers: { Authorization: 'Bearer expired' } }));
    assert.equal(handled.status, 401);
    assert.equal(handled.body.error, 'Token expired');
    assert.equal(handled.body.hint, 'use refresh');
  });

  it('верный токен: payload { userId, email, role } попадает в ctx.user', async () => {
    const ctx = await run([mw], makeCtx({ headers: { Authorization: 'Bearer good' } }));
    assert.deepEqual(ctx.user, { userId: 'U1', email: 'ivan@example.com', role: 'user' });
    assert.equal(ctx.state.user, ctx.user);
  });
});

/** Фейки для AuthService: пользователи и refresh-токены в памяти, «хэш» — детерминированная строка. */
function makeAuth() {
  const users = [];
  const stored = new Map();
  const User = {
    async findByEmail(email, { withPassword } = {}) {
      if (typeof email !== 'string') return null;
      const u = users.find((x) => x.email === email.toLowerCase());
      if (!u) return null;
      return withPassword ? { ...u } : { ...u, password_hash: undefined };
    },
    async findById(id) { return users.find((u) => u._id === id) || null; },
    async create(data) { const u = { _id: `U${users.length + 1}`, ...data }; users.push(u); return { ...u, password_hash: undefined }; },
  };
  const RefreshToken = {
    async create({ jti }) { stored.set(jti, { revoked: false }); },
    async findActive(jti) { const r = stored.get(jti); return r && !r.revoked ? r : null; },
    async revoke(jti) { if (stored.has(jti)) stored.get(jti).revoked = true; },
  };
  const tokens = {
    accessTtl: 900, refreshTtl: 604800,
    signAccess: (u) => `access:${u._id}`,
    signRefresh: (u, jti) => `refresh:${u._id}:${jti}`,
    verifyRefresh(t) {
      const m = /^refresh:(\w+):(.+)$/.exec(t);
      if (!m) throw new UnauthorizedError('Invalid token');
      return { userId: m[1], jti: m[2] };
    },
  };
  const hasher = { hash: async (p) => `hash(${p})`, compare: async (p, h) => h === `hash(${p})` };
  const logger = memoryLogger();
  const service = new AuthService({ User, RefreshToken, tokens, hasher, logger, config });
  return { service, users, stored, logger };
}

describe('Задание 4: регистрация, вход, обновление токенов', () => {
  it('регистрация: роль user, пароль хэшируется, в ответе userId/email и пара токенов', async () => {
    const { service, users } = makeAuth();
    const res = await service.register({ name: 'Иван', email: 'ivan@example.com', password: 'secret123' }, '1.1.1.1');
    assert.deepEqual(res.data, { userId: 'U1', email: 'ivan@example.com' });
    assert.ok(res.accessToken && res.refreshToken);
    assert.equal(users[0].role, 'user');
    assert.equal(users[0].password_hash, 'hash(secret123)');
    assert.equal(users[0].password, undefined, 'пароль в открытом виде не хранится');
    assert.equal(users[0].group_name, 'ББМО-01-23');
  });

  it('повторная регистрация → 409', async () => {
    const { service } = makeAuth();
    await service.register({ name: 'Иван', email: 'ivan@example.com', password: 'secret123' });
    await assert.rejects(service.register({ name: 'Иван', email: 'ivan@example.com', password: 'other1234' }), ConflictError);
  });

  it('вход: accessToken, refreshToken, expiresIn=900', async () => {
    const { service } = makeAuth();
    await service.register({ name: 'Иван', email: 'ivan@example.com', password: 'secret123' });
    const res = await service.login({ email: 'ivan@example.com', password: 'secret123' }, '1.1.1.1');
    assert.equal(res.expiresIn, 900);
    assert.ok(res.accessToken.startsWith('access:') && res.refreshToken.startsWith('refresh:'));
  });

  it('неверный пароль и неизвестный email дают ОДИНАКОВЫЙ ответ (401 Invalid credentials, без деталей)', async () => {
    const { service } = makeAuth();
    await service.register({ name: 'Иван', email: 'ivan@example.com', password: 'secret123' });
    const wrongPassword = await service.login({ email: 'ivan@example.com', password: 'wrong' }).catch((e) => e);
    const unknownEmail = await service.login({ email: 'nobody@example.com', password: 'secret123' }).catch((e) => e);
    for (const e of [wrongPassword, unknownEmail]) {
      assert.ok(e instanceof UnauthorizedError);
      assert.equal(e.status, 401);
      assert.equal(e.message, 'Invalid credentials');
    }
    assert.deepEqual([wrongPassword.message, wrongPassword.status], [unknownEmail.message, unknownEmail.status]);
  });

  it('все попытки входа логируются: успех и неудача с причиной (причина — только в лог)', async () => {
    const { service, logger } = makeAuth();
    await service.register({ name: 'Иван', email: 'ivan@example.com', password: 'secret123' });
    await service.login({ email: 'ivan@example.com', password: 'secret123' }, '10.0.0.1').catch(() => {});
    await service.login({ email: 'ivan@example.com', password: 'bad' }, '10.0.0.2').catch(() => {});
    await service.login({ email: 'nobody@example.com', password: 'x' }, '10.0.0.3').catch(() => {});
    const text = logger.lines.join('\n');
    assert.match(text, /\[AUTH\] LOGIN SUCCESS userId=U1 email=ivan@example\.com role=user ip=10\.0\.0\.1/);
    assert.match(text, /LOGIN FAILED email=ivan@example\.com ip=10\.0\.0\.2 reason=bad_password/);
    assert.match(text, /LOGIN FAILED email=nobody@example\.com ip=10\.0\.0\.3 reason=unknown_email/);
  });

  it('пользователь без пароля (создан без password) войти не может', async () => {
    const { service, users } = makeAuth();
    users.push({ _id: 'U9', email: 'nopass@example.com', role: 'user' });
    await assert.rejects(service.login({ email: 'nopass@example.com', password: 'anything' }), /Invalid credentials/);
  });

  it('объект вместо email ({ $ne: null }) на уровне сервиса — как «не найден», а не обход проверки', async () => {
    const { service } = makeAuth();
    await assert.rejects(service.login({ email: { $ne: null }, password: 'x' }), /Invalid credentials/);
  });

  it('refresh: ротация — старый токен отзывается, повторное использование → 401', async () => {
    const { service } = makeAuth();
    const reg = await service.register({ name: 'Иван', email: 'ivan@example.com', password: 'secret123' });
    const fresh = await service.refresh(reg.refreshToken, '1.1.1.1');
    assert.ok(fresh.accessToken && fresh.refreshToken);
    assert.notEqual(fresh.refreshToken, reg.refreshToken);
    await assert.rejects(service.refresh(reg.refreshToken), (e) => e.status === 401 && e.message === 'Invalid token');
    await service.refresh(fresh.refreshToken);
  });

  it('logout отзывает refresh-токен', async () => {
    const { service } = makeAuth();
    const reg = await service.register({ name: 'Иван', email: 'ivan@example.com', password: 'secret123' });
    assert.deepEqual(await service.logout(reg.refreshToken), { loggedOut: true });
    await assert.rejects(service.refresh(reg.refreshToken), UnauthorizedError);
  });
});

describe('Задание 4: JWT (HS256) и bcrypt', { skip: !(has('jsonwebtoken') && has('bcryptjs')) && 'нужны jsonwebtoken и bcryptjs (npm install)' }, () => {
  const jwt = require(require.resolve('jsonwebtoken', { paths: [ROOT] }));
  const tokens = createTokenService({ config });
  const user = { _id: 'abc123', email: 'ivan@example.com', role: 'admin' };

  it('access-токен: payload { userId, email, role }, алгоритм HS256, срок 15 минут', () => {
    const t = tokens.signAccess(user);
    const decoded = jwt.decode(t, { complete: true });
    assert.equal(decoded.header.alg, 'HS256');
    assert.deepEqual({ userId: decoded.payload.userId, email: decoded.payload.email, role: decoded.payload.role }, { userId: 'abc123', email: 'ivan@example.com', role: 'admin' });
    assert.equal(decoded.payload.exp - decoded.payload.iat, 900);
  });

  it('refresh-токен: срок 7 дней, есть jti, подписан ДРУГИМ секретом (access им не проверить)', () => {
    const t = tokens.signRefresh(user, 'jti-1');
    const payload = tokens.verifyRefresh(t);
    assert.equal(payload.jti, 'jti-1');
    assert.equal(payload.exp - payload.iat, 604800);
    assert.throws(() => tokens.verifyAccess(t), /Invalid token/);
  });

  it('подделка и мусор → 401 Invalid token; alg=none не принимается', () => {
    const t = tokens.signAccess(user);
    assert.throws(() => tokens.verifyAccess(`${t}x`), (e) => e.status === 401 && e.message === 'Invalid token');
    assert.throws(() => tokens.verifyAccess('garbage'), UnauthorizedError);
    const none = `${Buffer.from('{"alg":"none","typ":"JWT"}').toString('base64url')}.${Buffer.from('{"userId":"1","role":"admin"}').toString('base64url')}.`;
    assert.throws(() => tokens.verifyAccess(none), UnauthorizedError);
  });

  it('истёкший токен → 401 Token expired + подсказка обновить через /api/auth/refresh', () => {
    const expired = jwt.sign({ userId: '1', email: 'a@b.ru', role: 'user' }, config.jwt.accessSecret, { algorithm: 'HS256', expiresIn: -10 });
    assert.throws(() => tokens.verifyAccess(expired), (e) => e.status === 401 && e.message === 'Token expired' && /api\/auth\/refresh/.test(e.extra.hint));
  });

  it('bcrypt: 10 раундов ($2a$10$), хэш ≠ пароль, compare работает', async () => {
    const hasher = createHasher({ rounds: config.bcryptRounds });
    const hash = await hasher.hash('secret123');
    assert.match(hash, /^\$2[aby]\$10\$/);
    assert.notEqual(hash, 'secret123');
    assert.equal(await hasher.compare('secret123', hash), true);
    assert.equal(await hasher.compare('wrong', hash), false);
    assert.notEqual(await hasher.hash('secret123'), hash, 'соль у каждого хэша своя');
  });
});

describe('Задание 4: схемы Joi для входа (нужен пакет joi)', { skip: !has('joi') && 'пакет joi не установлен (npm install)' }, () => {
  const { registerSchema, loginSchema, roleSchema } = load('task4/validators/authSchemas');
  const { formatDetails } = load('task4/utils/joiMessages');
  const check = (schema, v) => { const { error } = schema.validate(v, { abortEarly: false }); return error ? formatDetails(error.details) : []; };

  it('регистрация: пароль от 8 символов, поля role нет (нельзя самому стать админом)', () => {
    assert.deepEqual(check(registerSchema, { name: 'Иван', email: 'ivan@example.com', password: 'secret123' }), []);
    assert.deepEqual(check(registerSchema, { name: 'Иван', email: 'ivan@example.com', password: 'short' }), [{ field: 'password', message: 'минимум 8 символов' }]);
    assert.deepEqual(check(registerSchema, { name: 'Иван', email: 'ivan@example.com', password: 'secret123', role: 'admin' }), [{ field: 'role', message: 'неизвестное поле' }]);
  });

  it('вход: объекты вместо строк (NoSQL-инъекция) отклоняются типизацией', () => {
    const errors = check(loginSchema, { email: { $ne: null }, password: { $ne: null } });
    assert.equal(errors.length >= 2, true);
    assert.ok(errors.every((e) => ['email', 'password'].some((f) => e.field.startsWith(f))));
  });

  it('смена роли: только user | admin | moderator', () => {
    assert.deepEqual(check(roleSchema, { role: 'moderator' }), []);
    assert.equal(check(roleSchema, { role: 'root' })[0].field, 'role');
  });
});
