'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { Readable } = require('node:stream');
const { load } = require('./helpers');

const SECRETS = { JWT_ACCESS_SECRET: 'a'.repeat(40), JWT_REFRESH_SECRET: 'b'.repeat(40) };

/** Поддельные сервисы: проверяем HTTP-слой (маршруты, валидацию, авторизацию, ошибки) без БД. */
function fakeServices() {
  const { NotFoundError, UnauthorizedError } = load('src/utils/errors');
  const calls = [];
  const userService = {
    calls,
    list: async (q) => { calls.push(['list', q]); return { data: [], pagination: { total: 0, page: q.page, limit: q.limit, pages: 0 } }; },
    search: async (q) => ({ found: 0, data: [], q }),
    stats: async () => ({ total: 0, averageAge: null, byGroup: {}, byCourse: {} }),
    getById: async (id) => { if (id === 'missing') throw new NotFoundError(); return { _id: id, name: 'Иван' }; },
    create: async (b) => { calls.push(['create', b]); return { _id: 'new1', ...b }; },
    update: async (id, b) => ({ _id: id, ...b }),
    delete: async (id) => ({ deleted: id }),
    exportStream: (q) => ({ stream: Readable.from(['\uFEFF_id,name\r\n', '1,Иван\r\n']), format: q.format || 'csv' }),
    importUsers: async (items) => ({ received: items.length, inserted: items.length, skipped: [] }),
    setRole: async (id, role) => ({ _id: id, role }),
    restore: async (id) => ({ _id: id }),
    setAvatar: async (id, filename) => ({ _id: id, avatar: filename }),
  };
  const authService = {
    register: async (b) => ({ data: { userId: 'U1', email: b.email }, accessToken: 'a', refreshToken: 'r', expiresIn: 900 }),
    login: async ({ password }) => {
      if (password !== 'secret123') throw new UnauthorizedError('Invalid credentials');
      return { accessToken: 'a', refreshToken: 'r', expiresIn: 900 };
    },
    refresh: async () => ({ accessToken: 'a2', refreshToken: 'r2', expiresIn: 900 }),
    logout: async () => ({ loggedOut: true }),
  };
  return { userService, authService };
}

/** Собирает приложение с поддельными сервисами и настоящими tokens/Joi/Koa. */
function buildTestApp({ env = {}, services = fakeServices(), dbUp = { value: true } } = {}) {
  const { loadConfig } = load('src/config');
  const { createApp } = load('src/app');
  const { createTokenService } = load('src/utils/tokens');
  const { createMetrics } = load('src/metrics');
  const { createUploadStore } = load('src/services/uploadStore');
  const { createMemoryLogger } = load('src/utils/logger');
  const { buildSpec } = load('src/docs/swagger');

  const uploadDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bbmo-uploads-'));
  const config = loadConfig({ ...SECRETS, RATE_LIMIT_MAX: '1000', CORS_ORIGINS: 'http://allowed.example', UPLOAD_DIR: uploadDir, ...env });
  const tokens = createTokenService({ config });
  const app = createApp({
    config, services, tokens,
    logger: createMemoryLogger(),
    metrics: createMetrics(),
    isDbUp: async () => dbUp.value,
    uploads: createUploadStore({ dir: uploadDir }),
    spec: buildSpec(),
  });
  const tokenFor = (role, userId = 'U1', email = 'u1@example.com') => tokens.signAccess({ _id: userId, email, role });
  return { app, config, tokens, services, dbUp, uploadDir, tokenFor, auth: (t) => ({ Authorization: `Bearer ${t}` }) };
}

module.exports = { SECRETS, fakeServices, buildTestApp };
