'use strict';

const { inspect } = require('node:util');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Детерминированный ГПСЧ (mulberry32). */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashString(str) {
  let h = 2166136261;
  for (const ch of String(str)) {
    h ^= ch.codePointAt(0);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Однострочный вывод объекта. */
const line = (value) => inspect(value, { breakLength: Infinity, depth: 5 });

const mb = (bytes) => (bytes / 1048576).toFixed(1);

const pad2 = (n) => String(n).padStart(2, '0');
function timestamp(d = new Date()) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
}

/** Для .catch() у drop(): игнорирует только «коллекции нет» (код 26). */
function ignoreNamespaceNotFound(err) {
  if (err && (err.code === 26 || /ns not found/i.test(err.message || ''))) return false;
  throw err;
}

/** Строка — корректный ObjectId (ровно 24 hex-символа). */
const isHexObjectId = (value) => typeof value === 'string' && /^[0-9a-fA-F]{24}$/.test(value);

const errLine = (err) => `${err.name}: ${err.message}`;

module.exports = { sleep, mulberry32, hashString, line, mb, timestamp, ignoreNamespaceNotFound, isHexObjectId, errLine };
