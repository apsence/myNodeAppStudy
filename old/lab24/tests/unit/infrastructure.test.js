'use strict';

const assert = require('node:assert/strict');
const { load, makeCtx, run } = require('../support/helpers');

const { createMailService } = load('src/services/mailService');
const { createUploadStore, SAFE_NAME } = load('src/services/uploadStore');
const { toHttpError, errorMiddleware } = load('src/middleware/error');
const { requestLogger } = load('src/middleware/requestLogger');
const { createMetrics } = load('src/metrics');
const { attachWebSocket } = load('src/realtime/wsServer');
const { createEventBus } = load('src/utils/eventBus');
const { createMemoryLogger } = load('src/utils/logger');
const { ValidationError, UnauthorizedError, NotFoundError, ConflictError, TooManyRequestsError } = load('src/utils/errors');

describe('mailService (nodemailer)', () => {
  const fakeNodemailer = (sendMail, record = {}) => ({ createTransport: (opts) => { record.opts = opts; return { sendMail }; } });

  it('без SMTP используется jsonTransport — письма в сеть не уходят', async () => {
    const record = {};
    const sent = [];
    const mail = createMailService({ config: { smtp: null, mailFrom: 'BBMO <n@x>' }, logger: createMemoryLogger(), nodemailer: fakeNodemailer(async (m) => { sent.push(m); return { messageId: 'id1' }; }, record) });
    assert.deepEqual(record.opts, { jsonTransport: true });
    assert.deepEqual(await mail.sendWelcome({ name: 'Иван', email: 'ivan@example.com' }), { delivered: true });
    assert.equal(sent[0].to, 'ivan@example.com');
    assert.match(sent[0].text, /Иван/);
  });

  it('с SMTP: host/port/auth из конфигурации, secure только для 465', () => {
    const record = {};
    createMailService({ config: { smtp: { host: 'smtp.x', port: 465, user: 'u', pass: 'p' } }, logger: createMemoryLogger(), nodemailer: fakeNodemailer(async () => ({}), record) });
    assert.deepEqual(record.opts, { host: 'smtp.x', port: 465, secure: true, auth: { user: 'u', pass: 'p' } });
  });

  it('сбой отправки не ломает регистрацию: ошибка логируется, delivered=false', async () => {
    const logger = createMemoryLogger();
    const mail = createMailService({ config: { smtp: null }, logger, nodemailer: fakeNodemailer(async () => { throw new Error('SMTP down'); }) });
    assert.deepEqual(await mail.sendWelcome({ name: 'И', email: 'a@b.ru' }), { delivered: false });
    assert.match(logger.lines.at(-1).msg, /SMTP down/);
  });
});

describe('uploadStore', () => {
  const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47]), Buffer.alloc(16)]);
  const fakeFs = (content, unlinked = []) => ({
    open: async () => ({ read: async (buf) => { content.copy(buf); }, close: async () => {} }),
    unlink: async (p) => { unlinked.push(p); },
  });
  const name = `${'a'.repeat(24)}.png`;

  it('допустимые имена — только сгенерированные сервером', () => {
    assert.ok(SAFE_NAME.test(name));
    for (const bad of ['../../etc/passwd', 'avatar.png', `${'a'.repeat(24)}.php`, `${'A'.repeat(24)}.png`, '']) assert.equal(SAFE_NAME.test(bad), false, bad);
  });

  it('verify: сигнатура png подтверждает файл, текст под видом png — нет, небезопасное имя — сразу false', async () => {
    assert.equal(await createUploadStore({ dir: '/tmp', fs: fakeFs(png) }).verify(name), true);
    assert.equal(await createUploadStore({ dir: '/tmp', fs: fakeFs(Buffer.from('<?php evil ?> text....')) }).verify(name), false);
    assert.equal(await createUploadStore({ dir: '/tmp', fs: fakeFs(png) }).verify('../x.png'), false);
  });

  it('remove удаляет только безопасные имена', async () => {
    const unlinked = [];
    const store = createUploadStore({ dir: '/data', fs: fakeFs(png, unlinked) });
    await store.remove(name);
    await store.remove('../../etc/passwd');
    await store.remove(null);
    assert.equal(unlinked.length, 1);
    assert.ok(unlinked[0].endsWith(name));
  });
});

describe('error middleware', () => {
  it('toHttpError: ошибки приложения, Mongo, multer, koa', () => {
    assert.deepEqual(toHttpError(new ValidationError([{ field: 'name', message: 'x' }])), { status: 400, body: { error: 'Validation failed', details: [{ field: 'name', message: 'x' }] } });
    assert.equal(toHttpError(new NotFoundError()).status, 404);
    assert.equal(toHttpError(new ConflictError()).status, 409);
    assert.equal(toHttpError(new UnauthorizedError('Token expired', { hint: 'refresh' })).body.hint, 'refresh');
    assert.equal(toHttpError(new TooManyRequestsError('Too many requests', { retryAfter: 5 })).body.retryAfter, 5);
    assert.equal(toHttpError(Object.assign(new Error('dup'), { code: 11000 })).status, 409);
    assert.equal(toHttpError(Object.assign(new Error('big'), { name: 'MulterError', code: 'LIMIT_FILE_SIZE' })).status, 413);
    assert.equal(toHttpError(Object.assign(new Error('x'), { name: 'MulterError', code: 'LIMIT_UNEXPECTED_FILE', field: 'f' })).status, 400);
    assert.equal(toHttpError(Object.assign(new Error('too large'), { status: 413, expose: true })).status, 413);
    assert.deepEqual(toHttpError(new Error('secret')), { status: 500, body: { error: 'Internal server error' } });
  });

  it('5xx пишутся в лог с requestId, детали клиенту не отдаются', async () => {
    const logger = createMemoryLogger();
    const ctx = makeCtx({ state: { requestId: 'req-1' } });
    await run([errorMiddleware({ logger })], ctx, async () => { throw new Error('db password leaked'); });
    assert.deepEqual(ctx.body, { error: 'Internal server error', status: 500 });
    assert.equal(logger.lines[0].requestId, 'req-1');
  });
});

describe('requestLogger (JSON-логи и X-Request-Id)', () => {
  it('принимает безопасный X-Request-Id, иначе генерирует; пишет статус и длительность', async () => {
    const logger = createMemoryLogger();
    const ctx = await run([requestLogger({ logger })], makeCtx({ method: 'GET', originalUrl: '/api/users?limit=1', path: '/api/users', headers: { 'X-Request-Id': 'req-12345678' } }), async (c) => { c.status = 200; });
    assert.equal(ctx.out['X-Request-Id'], 'req-12345678');
    assert.deepEqual([logger.lines[0].method, logger.lines[0].status, logger.lines[0].url], ['GET', 200, '/api/users?limit=1']);
    assert.equal(typeof logger.lines[0].durationMs, 'number');

    const evil = await run([requestLogger({ logger })], makeCtx({ headers: { 'X-Request-Id': 'x\ny{inject}' } }));
    assert.match(evil.out['X-Request-Id'], /^[0-9a-f-]{36}$/);
  });
});

describe('metrics (Prometheus)', () => {
  class Counter { constructor(o) { this.o = o; this.calls = []; } inc(l) { this.calls.push(l); } }
  class Histogram { constructor(o) { this.o = o; this.calls = []; } observe(l, v) { this.calls.push([l, v]); } }
  class Registry { constructor() { this.contentType = 'text/plain; version=0.0.4'; } async metrics() { return '# HELP http_requests_total'; } }
  const prom = { Registry, Counter, Histogram, collectDefaultMetrics: () => {} };

  it('http_requests_total и http_request_duration_seconds: метка path — шаблон маршрута', async () => {
    const m = createMetrics({ client: prom });
    assert.equal(m.httpRequests.o.name, 'http_requests_total');
    assert.equal(m.httpDuration.o.name, 'http_request_duration_seconds');
    await run([m.middleware()], makeCtx({ method: 'GET', path: '/api/users/65a1', _matchedRoute: '/api/users/:id' }), async (c) => { c.status = 200; });
    assert.deepEqual(m.httpRequests.calls[0], { method: 'GET', path: '/api/users/:id', status: '200' });
    assert.ok(m.httpDuration.calls[0][1] >= 0);
  });

  it('неизвестные маршруты → path="unmatched" (нет взрыва кардинальности); render отдаёт текст и contentType', async () => {
    const m = createMetrics({ client: prom });
    await run([m.middleware()], makeCtx({ path: '/random/123' }));
    assert.equal(m.httpRequests.calls[0].path, 'unmatched');
    assert.deepEqual(await m.render(), { contentType: 'text/plain; version=0.0.4', body: '# HELP http_requests_total' });
  });
});

describe('WebSocket-уведомления', () => {
  /** Фейковый ws-сервер: конструктор запоминает обработчики, clients — множество сокетов. */
  function fakeWss() {
    const handlers = {};
    const wss = { clients: new Set(), on: (e, f) => { handlers[e] = f; }, close: (cb) => cb(), handlers };
    return { wss, Server: function Server() { return wss; } };
  }
  const makeSocket = () => { const s = { sent: [], closed: null, readyState: 1, send: (m) => s.sent.push(JSON.parse(m)), close: (code) => { s.closed = code; }, terminate() {}, on() {} }; return s; };

  it('без валидного токена соединение закрывается кодом 4401', () => {
    const { wss, Server } = fakeWss();
    attachWebSocket({ server: {}, tokens: { verifyAccess: () => { throw new Error('bad'); } }, bus: createEventBus(), logger: createMemoryLogger(), WebSocketServer: Server });
    const socket = makeSocket();
    wss.handlers.connection(socket, { url: '/ws?token=bad' });
    assert.equal(socket.closed, 4401);
  });

  it('с валидным токеном клиент получает hello и события пользователей (без персональных данных)', () => {
    const { wss, Server } = fakeWss();
    const bus = createEventBus();
    attachWebSocket({ server: {}, tokens: { verifyAccess: (t) => ({ email: 'ivan@example.com', t }) }, bus, logger: createMemoryLogger(), WebSocketServer: Server });
    const socket = makeSocket();
    wss.handlers.connection(socket, { url: '/ws?token=good' });
    wss.clients.add(socket);
    assert.deepEqual(socket.sent[0], { type: 'hello', user: 'ivan@example.com' });
    bus.publishUser('created', 'U1');
    assert.equal(socket.sent[1].type, 'created');
    assert.equal(socket.sent[1].userId, 'U1');
    assert.equal(socket.sent[1].email, undefined);
  });

  it('close() отписывается от шины', async () => {
    const { Server } = fakeWss();
    const bus = createEventBus();
    const ws = attachWebSocket({ server: {}, tokens: {}, bus, logger: createMemoryLogger(), WebSocketServer: Server });
    assert.equal(bus.listenerCount('user'), 1);
    await ws.close();
    assert.equal(bus.listenerCount('user'), 0);
  });
});
