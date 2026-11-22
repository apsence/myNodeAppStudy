'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = [path.join(__dirname, '..', '..'), path.join(__dirname, '..')].find((d) => fs.existsSync(path.join(d, 'src', 'app.js')));
if (!ROOT) throw new Error('Не найден корень проекта (папка с src/app.js)');

const load = (rel) => require(path.join(ROOT, rel));

function makeCtx(over = {}) {
  const incoming = Object.fromEntries(Object.entries(over.headers || {}).map(([k, v]) => [k.toLowerCase(), v]));
  const out = {};
  const ctx = {
    method: 'GET', path: '/', originalUrl: '/', ip: '127.0.0.1', status: 404, body: undefined,
    state: {}, params: {}, query: {}, request: { body: {} },
    get: (h) => incoming[h.toLowerCase()] || '',
    set: (k, v) => { out[k] = v; },
    out,
    ...over,
  };
  delete ctx.headers;
  return ctx;
}

async function run(middlewares, ctx, last = async () => {}) {
  const dispatch = async (i) => (i === middlewares.length ? last(ctx) : middlewares[i](ctx, () => dispatch(i + 1)));
  await dispatch(0);
  return ctx;
}

async function collect(stream) {
  let out = '';
  for await (const chunk of stream) out += chunk;
  return out;
}

module.exports = { ROOT, load, makeCtx, run, collect };
