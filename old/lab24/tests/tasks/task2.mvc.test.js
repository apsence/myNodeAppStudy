'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { load, has, makeCtx, run, memoryLogger } = require('./_helpers');

const { validateUserData } = load('task2/models/validation');
const { User } = load('task2/models/user');
const { UserService } = load('task2/services/userService');
const { UserController } = load('task2/controllers/userController');
const { formatDetails, plural } = load('task2/utils/joiMessages');
const { createLogger } = load('task2/utils/logger');
const { errorMiddleware } = load('task2/middleware/error');
const { loggerMiddleware } = load('task2/middleware/logger');
const { validationMiddleware } = load('task2/middleware/validation');
const { dbMiddleware } = load('task2/middleware/db');
const { xGroup } = load('task2/middleware/headers');
const { ValidationError, ConflictError, NotFoundError } = load('task2/utils/errors');

const input = { name: 'Иван', email: 'ivan@example.com', group_name: 'ББМО-01-23', age: 20 };

/** Поддельная модель User: хранит пользователей в памяти. */
function fakeUserModel(initial = []) {
  const users = [...initial];
  return {
    users,
    async findAll() { return users; },
    async findById(id) { return users.find((u) => u._id === id) || null; },
    async findByEmail(email) { return users.find((u) => u.email === email) || null; },
    async create(data) { const u = { _id: String(users.length + 1), ...data }; users.push(u); return u; },
    async update(id, data) { const u = users.find((x) => x._id === id); return u ? Object.assign(u, data) : null; },
    async delete(id) { const i = users.findIndex((u) => u._id === id); if (i < 0) return false; users.splice(i, 1); return true; },
  };
}

function makeService(model = fakeUserModel()) {
  const logger = memoryLogger();
  const sent = [];
  const hashed = [];
  const service = new UserService({
    User: model,
    logger,
    mailer: { sendWelcome: async (u) => { sent.push(u.email); } },
    hasher: { hash: async (p) => { hashed.push(p); return `hashed:${p}`; } },
  });
  return { service, logger, sent, hashed, model };
}

describe('Задание 2: слой моделей', () => {
  it('валидация на уровне модели: обязательные поля, course 1–4, неизвестные поля', () => {
    assert.equal(validateUserData(input).valid, true);
    assert.equal(validateUserData({ ...input, course: 5 }).valid, false);
    assert.equal(validateUserData({ ...input, course: 2 }).valid, true);
    assert.equal(validateUserData({ ...input, hacker: 1 }).valid, false);
    assert.equal(validateUserData({ name: 'П' }).valid, false);
  });

  it('User.findByEmail не отправляет в БД объекты-операторы ({ $gt: "" })', async () => {
    let touched = false;
    User.init({ collection: () => { touched = true; return {}; } });
    assert.equal(await User.findByEmail({ $gt: '' }), null);
    assert.equal(touched, false);
  });

  it('User.create: логирует [MODEL] insertOne, не отдаёт password_hash, дубликат → ConflictError', async () => {
    const logs = [];
    const calls = [];
    User.init({ collection: () => ({ insertOne: async (doc) => { calls.push(doc); return { insertedId: 'f'.repeat(24) }; } }) }, { log: (m) => logs.push(m) });
    const user = await User.create({ ...input, password_hash: 'x'.repeat(60) });
    assert.deepEqual(logs, ['insertOne']);
    assert.equal(user.password_hash, undefined);
    assert.equal(calls[0].password_hash.length, 60);

    User.init({ collection: () => ({ insertOne: async () => { throw Object.assign(new Error('dup'), { code: 11000 }); } }) });
    await assert.rejects(User.create(input), ConflictError);
    await assert.rejects(User.create({ name: 'П' }), ValidationError);
  });
});

describe('Задание 2: слой сервисов', () => {
  it('создание: проверка уникальности → вставка → email, лог как в задании', async () => {
    const { service, logger, sent } = makeService();
    const user = await service.create(input);
    assert.equal(user.email, 'ivan@example.com');
    assert.deepEqual(sent, ['ivan@example.com']);
    assert.deepEqual(logger.lines, [
      '[SERVICE] Создание пользователя: ivan@example.com',
      '[SERVICE] Проверка уникальности email',
      '[SERVICE] Email отправлен: ivan@example.com',
    ]);
  });

  it('повторный email → ConflictError (409 "Email already exists"), письмо не отправляется', async () => {
    const { service, logger, sent } = makeService(fakeUserModel([{ _id: '1', ...input }]));
    await assert.rejects(service.create(input), (e) => e instanceof ConflictError && e.status === 409 && e.message === 'Email already exists');
    assert.deepEqual(sent, []);
    assert.deepEqual(logger.lines.slice(1), ['[SERVICE] Проверка уникальности email', '[SERVICE] Email уже существует']);
  });

  it('пароль хэшируется и в открытом виде в модель не попадает', async () => {
    const { service, hashed, model } = makeService();
    await service.create({ ...input, password: 'secret123' });
    assert.deepEqual(hashed, ['secret123']);
    assert.equal(model.users[0].password, undefined);
    assert.equal(model.users[0].password_hash, 'hashed:secret123');
  });

  it('обновление: свой email можно оставить, чужой — нельзя', async () => {
    const { service } = makeService(fakeUserModel([{ _id: '1', ...input }, { _id: '2', ...input, email: 'maria@example.com' }]));
    assert.equal((await service.update('1', { email: 'ivan@example.com', age: 21 })).age, 21);
    await assert.rejects(service.update('1', { email: 'maria@example.com' }), ConflictError);
  });

  it('несуществующий пользователь → NotFoundError (404 "User not found")', async () => {
    const { service } = makeService();
    await assert.rejects(service.getById('999'), (e) => e instanceof NotFoundError && e.status === 404 && e.message === 'User not found');
    await assert.rejects(service.update('999', { age: 20 }), NotFoundError);
    await assert.rejects(service.delete('999'), NotFoundError);
  });

  it('сервис работает с подменяемой моделью — это и есть изоляция слоёв', async () => {
    const { service } = makeService(fakeUserModel([{ _id: '1', ...input }]));
    assert.equal((await service.list()).length, 1);
    assert.deepEqual(await service.delete('1'), { deleted: '1' });
  });
});

describe('Задание 2: слой контроллеров', () => {
  it('create: статус 201, Location, тело { data }', async () => {
    const { service } = makeService();
    const controller = new UserController({ service });
    const ctx = makeCtx({ state: { validated: { body: input } } });
    await controller.create(ctx);
    assert.equal(ctx.status, 201);
    assert.equal(ctx.out.Location, '/api/users/1');
    assert.equal(ctx.body.data.email, 'ivan@example.com');
  });

  it('getOne / remove: ctx.body = { data }', async () => {
    const { service } = makeService(fakeUserModel([{ _id: '1', ...input }]));
    const controller = new UserController({ service });
    const ctx = makeCtx({ params: { id: '1' } });
    await controller.getOne(ctx);
    assert.equal(ctx.body.data._id, '1');
    await controller.remove(ctx);
    assert.deepEqual(ctx.body, { data: { deleted: '1' } });
  });
});

describe('Задание 2: middleware', () => {
  it('dbMiddleware внедряет БД в ctx.db', async () => {
    const db = {};
    assert.equal((await run([dbMiddleware(db)], makeCtx())).db, db);
  });

  it('errorMiddleware: ValidationError → 400 + details; Conflict → 409; NotFound → 404; прочее → 500', async () => {
    const logger = memoryLogger();
    const mw = errorMiddleware({ logger });
    const details = [{ field: 'email', message: 'неверный формат' }];
    let ctx = await run([mw], makeCtx(), async () => { throw new ValidationError(details); });
    assert.deepEqual([ctx.status, ctx.body], [400, { error: 'Validation failed', details, status: 400 }]);
    ctx = await run([mw], makeCtx(), async () => { throw new ConflictError(); });
    assert.deepEqual([ctx.status, ctx.body], [409, { error: 'Email already exists', status: 409 }]);
    ctx = await run([mw], makeCtx(), async () => { throw new NotFoundError(); });
    assert.deepEqual(ctx.body, { error: 'User not found', status: 404 });
    ctx = await run([mw], makeCtx(), async () => { throw new Error('boom'); });
    assert.deepEqual([ctx.status, ctx.body], [500, { error: 'Internal server error', status: 500 }]);
    assert.ok(logger.lines.some((l) => l.includes('boom')));
  });

  it('loggerMiddleware: [дата] [HTTP] METHOD url → status (время)', async () => {
    const out = [];
    const logger = createLogger({ out: (l) => out.push(l), now: () => new Date(2024, 0, 15, 14, 30, 25) });
    await run([loggerMiddleware({ logger })], makeCtx({ method: 'POST', originalUrl: '/api/users' }), async (c) => { c.status = 201; });
    assert.match(out[0], /^\[2024-01-15 14:30:25\] \[HTTP\] POST \/api\/users → 201 \(\d+\.\dms\)$/);
  });

  it('xGroup: заголовок X-Group', async () => {
    assert.equal((await run([xGroup], makeCtx())).out['X-Group'], 'BBMO-01-23');
  });

  it('validationMiddleware: ошибки Joi превращаются в 400 с русскими сообщениями; успех кладёт данные в ctx.state.validated', async () => {
    const failing = { validate: () => ({ error: { details: [{ type: 'string.min', path: ['name'], context: { limit: 2 } }, { type: 'string.email', path: ['email'], context: {} }] } }) };
    await assert.rejects(
      run([validationMiddleware(failing)], makeCtx({ body: { name: 'П', email: 'invalid' } })),
      (e) => e instanceof ValidationError && JSON.stringify(e.details) === JSON.stringify([{ field: 'name', message: 'минимум 2 символа' }, { field: 'email', message: 'неверный формат' }])
    );
    const passing = { validate: (v) => ({ value: { ...v, normalized: true } }) };
    const ctx = await run([validationMiddleware(passing)], makeCtx({ body: { a: 1 } }));
    assert.deepEqual(ctx.state.validated.body, { a: 1, normalized: true });
  });
});

describe('Задание 2: сообщения валидации (Joi → русский)', () => {
  it('склонение: 2 символа, 5 символов, 21 символ', () => {
    assert.equal(plural(2, 'символ', 'символа', 'символов'), 'символа');
    assert.equal(plural(5, 'символ', 'символа', 'символов'), 'символов');
    assert.equal(plural(21, 'символ', 'символа', 'символов'), 'символ');
    assert.equal(plural(11, 'символ', 'символа', 'символов'), 'символов');
  });

  it('formatDetails: типичные ошибки Joi', () => {
    const d = (type, path, context = {}) => ({ type, path, context });
    assert.deepEqual(formatDetails([
      d('string.min', ['name'], { limit: 2 }), d('string.max', ['name'], { limit: 100 }), d('string.email', ['email']),
      d('any.required', ['group_name']), d('string.pattern.base', ['group_name']), d('number.min', ['age'], { limit: 16 }),
      d('number.integer', ['age']), d('object.unknown', ['hack']), d('object.min', []),
    ]), [
      { field: 'name', message: 'минимум 2 символа' }, { field: 'name', message: 'максимум 100 символов' }, { field: 'email', message: 'неверный формат' },
      { field: 'group_name', message: 'обязательное поле' }, { field: 'group_name', message: 'неверный формат (ожидается ББМО-XX-XX)' },
      { field: 'age', message: 'не меньше 16' }, { field: 'age', message: 'должно быть целым числом' },
      { field: 'hack', message: 'неизвестное поле' }, { field: '_body', message: 'нет полей для обновления' },
    ]);
  });
});

describe('Задание 2: схемы Joi (нужен пакет joi)', { skip: !has('joi') && 'пакет joi не установлен (npm install)' }, () => {
  const { createUserSchema, updateUserSchema } = load('task2/validators/userSchemas');
  const check = (schema, value) => {
    const { error, value: v } = schema.validate(value, { abortEarly: false });
    return { errors: error ? formatDetails(error.details) : [], value: v };
  };

  it('пример из задания: name="П", email="invalid" → ошибки Joi', () => {
    const { errors } = check(createUserSchema, { name: 'П', email: 'invalid' });
    assert.deepEqual(errors.slice(0, 2), [{ field: 'name', message: 'минимум 2 символа' }, { field: 'email', message: 'неверный формат' }]);
    assert.ok(errors.some((e) => e.field === 'group_name' && e.message === 'обязательное поле'));
  });

  it('правила: name 2–100, group_name по regex, age 16–100, course 1–4', () => {
    assert.equal(check(createUserSchema, input).errors.length, 0);
    assert.deepEqual(check(createUserSchema, { ...input, age: 15 }).errors, [{ field: 'age', message: 'не меньше 16' }]);
    assert.deepEqual(check(createUserSchema, { ...input, course: 5 }).errors, [{ field: 'course', message: 'не больше 4' }]);
    assert.equal(check(createUserSchema, { ...input, group_name: 'ББМО-1-23' }).errors[0].field, 'group_name');
  });

  it('email нормализуется (trim + lowercase), неизвестные поля запрещены', () => {
    assert.equal(check(createUserSchema, { ...input, email: ' Ivan@Example.COM ' }).value.email, 'ivan@example.com');
    assert.deepEqual(check(createUserSchema, { ...input, role: 'admin' }).errors, [{ field: 'role', message: 'неизвестное поле' }]);
  });

  it('обновление: хотя бы одно поле', () => {
    assert.deepEqual(check(updateUserSchema, {}).errors, [{ field: '_body', message: 'нет полей для обновления' }]);
    assert.equal(check(updateUserSchema, { age: 30 }).errors.length, 0);
  });
});
