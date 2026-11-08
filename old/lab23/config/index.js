'use strict';

const path = require('node:path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const constants = require('./constants');

const int = (value, fallback) => {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) ? n : fallback;
};

/** Скрывает пароль в URI для вывода в консоль. */
function maskUri(uri) {
  return String(uri).replace(/\/\/([^:@/]+):([^@]*)@/, '//$1:***@');
}

/** Разбирает URI с одним хостом. Для нескольких хостов/srv возвращает null. */
function parseUri(uri) {
  try {
    const u = new URL(uri);
    return {
      protocol: u.protocol,
      user: u.username ? decodeURIComponent(u.username) : null,
      host: u.hostname,
      port: Number(u.port) || 27017,
      db: u.pathname.replace(/^\//, '') || null,
    };
  } catch {
    return null;
  }
}

const mongoUri = process.env.MONGODB_URI || constants.DEFAULT_URI;

module.exports = {
  ...constants,
  mongoUri,
  dbName: process.env.DB_NAME || (parseUri(mongoUri) || {}).db || constants.DEFAULT_DB,
  httpPort: int(process.env.HTTP_PORT, 3000),
  wsPort: int(process.env.WS_PORT, 3001),
  cacheTtlMs: int(process.env.CACHE_TTL_SECONDS, 60) * 1000,
  bigSize: int(process.env.BIG_SIZE, 1000000),
  maskUri,
  parseUri,
};
