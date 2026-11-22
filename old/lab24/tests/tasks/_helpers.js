'use strict';

const fs = require('node:fs');
const path = require('node:path');

// Корень проекта = папка, где лежат task1/ и src/ (работает из tests/tasks/ и при плоской раскладке)
const ROOT = [path.join(__dirname, '..', '..'), path.join(__dirname, '..'), __dirname].find((d) => fs.existsSync(path.join(d, 'task1', 'app.js')));
if (!ROOT) throw new Error('Не найден корень проекта (папка с task1/app.js)');

const load = (rel) => require(path.join(ROOT, rel));
const has = (pkg) => {
  try {
    require.resolve(pkg, { paths: [ROOT] });
    return true;
  } catch {
    return false;
  }
};

/** Минимальный «контекст Koa» для проверки middleware без Koa. */
function makeCtx(over = {}) {
  const incoming = Object.fromEntries(Object.entries(over.headers || {}).map(([k, v]) => [k.toLowerCase(), v]));
  const out = {};
  const ctx = {
    method: 'GET', path: '/', originalUrl: '/', ip: '127.0.0.1', status: 404, body: undefined,
    state: {}, params: {}, query: {}, request: { body: over.body === undefined ? {} : over.body },
    get: (h) => incoming[h.toLowerCase()] || '',
    set: (k, v) => { out[k] = v; },
    out,
    ...over,
  };
  delete ctx.headers;
  return ctx;
}

/** Цепочка middleware (как koa-compose). */
async function run(middlewares, ctx, last = async () => {}) {
  const dispatch = async (i) => (i === middlewares.length ? last(ctx) : middlewares[i](ctx, () => dispatch(i + 1)));
  await dispatch(0);
  return ctx;
}

const memoryLogger = () => {
  const lines = [];
  const mk = (tag) => (msg) => lines.push(`[${tag}] ${msg}`);
  return { lines, service: mk('SERVICE'), model: mk('MODEL'), http: mk('HTTP'), auth: mk('AUTH'), info: mk('INFO'), warn: mk('WARN'), error: mk('ERROR') };
};

module.exports = { ROOT, load, has, makeCtx, run, memoryLogger };
