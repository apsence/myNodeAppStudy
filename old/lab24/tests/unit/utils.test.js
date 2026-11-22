'use strict';

const assert = require('node:assert/strict');
const { load, collect } = require('../support/helpers');

const { parseSort, buildFilter, toSkip, paginate, mapStats } = load('src/utils/query');
const { escapeCell, toCsvLine, csvChunks, jsonChunks } = load('src/utils/csv');
const { formatDetails } = load('src/utils/joiMessages');
const { RateLimiter } = load('src/utils/rateLimiter');
const { findForbiddenKey } = load('src/utils/sanitize');
const { canModifyUser, canDeleteUser } = load('src/utils/policies');
const { detectImageType, EXT } = load('src/utils/image');
const { loadConfig } = load('src/config');
const { createEventBus } = load('src/utils/eventBus');
const { createLogger, createMemoryLogger } = load('src/utils/logger');

const SECRETS = { JWT_ACCESS_SECRET: 'a'.repeat(40), JWT_REFRESH_SECRET: 'b'.repeat(40) };

describe('query: сортировка, фильтры, пагинация, статистика', () => {
  it('parseSort: белый список и направление', () => {
    assert.deepEqual(parseSort('-name'), { name: -1 });
    assert.deepEqual(parseSort('age'), { age: 1 });
    assert.deepEqual(parseSort(), { created_at: -1 });
    assert.equal(parseSort('password_hash'), null);
  });

  it('buildFilter и paginate', () => {
    assert.deepEqual(buildFilter({ group_name: 'ББМО-01-23', course: 2, age_min: 18, age_max: 25, search: 'Иван' }), {
      group_name: 'ББМО-01-23', course: 2, age: { $gte: 18, $lte: 25 }, $text: { $search: 'Иван' },
    });
    assert.equal(toSkip(3, 10), 20);
    assert.deepEqual(paginate({ page: 2, limit: 5, total: 100 }), { total: 100, page: 2, limit: 5, pages: 20 });
  });

  it('mapStats', () => {
    assert.deepEqual(mapStats({ overall: [{ total: 3, avgAge: 20.46 }], byGroup: [{ _id: 'ББМО-01-23', count: 3 }], byCourse: [{ _id: 2, count: 3 }] }), {
      total: 3, averageAge: 20.5, byGroup: { 'ББМО-01-23': 3 }, byCourse: { 2: 3 },
    });
    assert.equal(mapStats(undefined).total, 0);
  });
});

describe('csv / json экспорт', () => {
  it('escapeCell: RFC 4180 и защита от formula-injection', () => {
    assert.equal(escapeCell('Иванов, Иван'), '"Иванов, Иван"');
    assert.equal(escapeCell('=1+1'), "'=1+1");
    assert.equal(escapeCell(-5), '-5');
    assert.equal(escapeCell(null), '');
    assert.equal(toCsvLine({ _id: '1', name: 'Иван' }, ['_id', 'name']), '1,Иван');
  });

  it('csvChunks: BOM и CRLF; jsonChunks: валидный JSON-массив', async () => {
    const rows = () => (async function* () { yield { _id: '1', name: 'Иван' }; yield { _id: '2', name: 'Мария' }; })();
    const csv = await collect(csvChunks(rows(), ['_id', 'name']));
    assert.equal(csv, '\uFEFF_id,name\r\n1,Иван\r\n2,Мария\r\n');
    const json = JSON.parse(await collect(jsonChunks(rows(), ['_id', 'name'])));
    assert.deepEqual(json, [{ _id: '1', name: 'Иван' }, { _id: '2', name: 'Мария' }]);
    assert.deepEqual(JSON.parse(await collect(jsonChunks((async function* () {})()))), []);
  });
});

describe('joiMessages', () => {
  it('русские сообщения', () => {
    const d = (type, path, context = {}) => ({ type, path, context });
    assert.deepEqual(formatDetails([d('number.positive', ['page']), d('number.max', ['limit'], { limit: 100 }), d('string.min', ['name'], { limit: 2 }), d('any.only', ['role'], { valids: ['user', 'admin'] }), d('custom', ['x'])]), [
      { field: 'page', message: 'должно быть больше 0' },
      { field: 'limit', message: 'не больше 100' },
      { field: 'name', message: 'минимум 2 символа' },
      { field: 'role', message: 'допустимые значения: user, admin' },
      { field: 'x', message: 'некорректное значение' },
    ]);
  });
});

describe('rateLimiter и sanitize', () => {
  it('лимит 100/мин: 101-й запрос блокируется, окно сбрасывается', () => {
    let t = 0;
    const limiter = new RateLimiter({ limit: 100, windowMs: 60000, now: () => t });
    for (let i = 0; i < 100; i++) assert.equal(limiter.hit('ip').allowed, true);
    assert.equal(limiter.hit('ip').allowed, false);
    t = 60000;
    assert.equal(limiter.hit('ip').allowed, true);
  });

  it('findForbiddenKey находит операторы MongoDB', () => {
    assert.equal(findForbiddenKey({ email: { $ne: null } }), 'email.$ne');
    assert.equal(findForbiddenKey({ 'a.b': 1 }), 'a.b');
    assert.equal(findForbiddenKey({ name: 'Иван' }), null);
  });
});

describe('policies', () => {
  it('изменение и удаление', () => {
    assert.equal(canModifyUser({ userId: 'U1', role: 'user' }, 'U1'), true);
    assert.equal(canModifyUser({ userId: 'M', role: 'moderator' }, 'U1'), true);
    assert.equal(canDeleteUser({ userId: 'M', role: 'moderator' }, 'U1'), false);
    assert.equal(canDeleteUser({ userId: 'A', role: 'admin' }, 'U1'), true);
  });
});

describe('image: определение типа по сигнатуре', () => {
  const pad = (b) => Buffer.concat([b, Buffer.alloc(16)]);
  it('png, jpeg, webp распознаются, подделки и текст — нет', () => {
    assert.equal(detectImageType(pad(Buffer.from([0x89, 0x50, 0x4e, 0x47]))), 'image/png');
    assert.equal(detectImageType(pad(Buffer.from([0xff, 0xd8, 0xff, 0xe0]))), 'image/jpeg');
    assert.equal(detectImageType(Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBP'), Buffer.alloc(4)])), 'image/webp');
    assert.equal(detectImageType(Buffer.from('<?php echo 1; ?> not an image')), null);
    assert.equal(detectImageType(Buffer.from('short')), null);
    assert.deepEqual(Object.keys(EXT).sort(), ['image/jpeg', 'image/png', 'image/webp']);
  });
});

describe('config: переменные окружения', () => {
  it('значения по умолчанию', () => {
    const c = loadConfig(SECRETS);
    assert.equal(c.port, 3000);
    assert.equal(c.dbName, 'bbmo_01_23');
    assert.equal(c.uploadDir, 'uploads');
    assert.equal(c.smtp, null);
    assert.equal(c.tls, null);
    assert.equal(c.isProduction, false);
  });

  it('SMTP и TLS включаются переменными; порт и лимиты читаются из env', () => {
    const c = loadConfig({ ...SECRETS, SMTP_HOST: 'smtp.x', SMTP_PORT: '465', TLS_KEY: 'k', TLS_CERT: 'c', PORT: '8080', RATE_LIMIT_MAX: '5', NODE_ENV: 'production' });
    assert.deepEqual(c.smtp, { host: 'smtp.x', port: 465, user: '', pass: '' });
    assert.deepEqual(c.tls, { key: 'k', cert: 'c' });
    assert.equal(c.port, 8080);
    assert.equal(c.rateLimit.limit, 5);
    assert.equal(c.isProduction, true);
  });

  it('секреты: проверка длины и различия, заглушки запрещены в production', () => {
    assert.throws(() => loadConfig({}), /JWT_ACCESS_SECRET/);
    assert.throws(() => loadConfig({ JWT_ACCESS_SECRET: 'a'.repeat(40), JWT_REFRESH_SECRET: 'a'.repeat(40) }), /отличаться/);
    assert.throws(() => loadConfig({ NODE_ENV: 'production', JWT_ACCESS_SECRET: `change-me${'x'.repeat(30)}`, JWT_REFRESH_SECRET: 'b'.repeat(40) }), /заглушки/);
  });
});

describe('eventBus и логгер', () => {
  it('publishUser публикует { type, userId, at }', () => {
    const bus = createEventBus();
    const events = [];
    bus.on('user', (e) => events.push(e));
    bus.publishUser('created', 42);
    assert.equal(events[0].type, 'created');
    assert.equal(events[0].userId, '42');
    assert.match(events[0].at, /^\d{4}-\d{2}-\d{2}T/);
  });

  it('createLogger пишет структурированные записи через pino (подмена)', () => {
    const records = [];
    const fakePino = Object.assign(
      (opts) => {
        assert.ok(opts.redact.paths.includes('*.password'), 'пароли маскируются');
        const make = (bindings) => ({
          info: (extra, msg) => records.push({ level: 'info', ...bindings, ...extra, msg }),
          warn: (extra, msg) => records.push({ level: 'warn', ...bindings, ...extra, msg }),
          error: (extra, msg) => records.push({ level: 'error', ...bindings, ...extra, msg }),
          child: (b) => make({ ...bindings, ...b }),
        });
        return make(opts.base);
      },
      { stdTimeFunctions: { isoTime: () => '' } }
    );
    const log = createLogger({ pino: fakePino });
    log.service('Создание', { userId: '1' });
    log.error('Сбой');
    assert.deepEqual(records[0], { level: 'info', service: 'bbmo-users-api', group: 'ББМО-01-23', component: 'service', userId: '1', msg: 'Создание' });
    assert.equal(records[1].level, 'error');
  });

  it('createMemoryLogger собирает записи', () => {
    const log = createMemoryLogger();
    log.auth('LOGIN', { ip: '1.1.1.1' });
    assert.deepEqual(log.lines[0], { kind: 'auth', msg: 'LOGIN', ip: '1.1.1.1' });
  });
});
