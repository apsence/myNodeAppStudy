'use strict';

const fs = require('node:fs');
const path = require('node:path');

// Корень проекта = папка с server.js (работает и из lab22/tests/, и если тесты лежат прямо в lab22/)
const ROOT = [__dirname, path.join(__dirname, '..')].find((d) => fs.existsSync(path.join(d, 'server.js')));
if (!ROOT) throw new Error('Не найден server.js: оставьте тесты в lab22/tests или lab22');

/** require() модуля проекта по относительному пути: load('lib/cache'). */
const load = (rel) => require(path.join(ROOT, rel));

const norm = (sql) => String(sql).replace(/\s+/g, ' ').trim();

/** Фейковая db: записывает SQL и параметры, ответы выдаёт handler(sql, params). */
function fakeDb(handler = () => [[]]) {
  const db = {
    calls: [],
    txLog: [],
    async query(sql, params = []) {
      db.calls.push({ sql: norm(sql), params });
      const r = await handler(norm(sql), params, db.calls.length);
      return r === undefined ? [[]] : r;
    },
    async transaction(fn) {
      db.txLog.push('begin');
      try {
        const res = await fn({ query: db.query });
        db.txLog.push('commit');
        return res;
      } catch (err) {
        db.txLog.push('rollback');
        throw err;
      }
    },
  };
  return db;
}

/** Ошибка в стиле mysql2. */
const mysqlError = (code, message = code, extra = {}) => Object.assign(new Error(message), { code, ...extra });

module.exports = { ROOT, load, norm, fakeDb, mysqlError };
