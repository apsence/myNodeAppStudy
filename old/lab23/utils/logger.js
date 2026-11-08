'use strict';

const { GROUP } = require('../config/constants');
const { timestamp } = require('./common');

/**
 * Логгер. op() — «операционные» записи в формате [дата] [группа] сообщение,
 * info/warn/error — служебные сообщения с префиксом уровня.
 */
function createLogger({ out = console.log, now = () => new Date() } = {}) {
  return {
    info: (msg) => out(`[INFO] ${msg}`),
    warn: (msg) => out(`[WARN] ${msg}`),
    error: (msg) => out(`[ERROR] ${msg}`),
    op: (msg) => out(`[${timestamp(now())}] [${GROUP}] ${msg}`),
  };
}

module.exports = { createLogger };
