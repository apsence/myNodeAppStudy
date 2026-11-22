'use strict';

/**
 * Логи в JSON (pino): одна строка — одна запись, удобно для ELK/Loki.
 * Интерфейс совместим с остальным кодом: logger.service(msg), logger.auth(msg), logger.http(msg, extra) ...
 * Секреты (Authorization, пароли, токены) маскируются.
 */
function createLogger({ level = 'info', pino = null, destination } = {}) {
  const lib = pino || require('pino');
  const root = lib(
    {
      level,
      base: { service: 'bbmo-users-api', group: 'ББМО-01-23' },
      timestamp: lib.stdTimeFunctions ? lib.stdTimeFunctions.isoTime : undefined,
      redact: { paths: ['req.headers.authorization', '*.password', '*.password_hash', '*.refreshToken', '*.accessToken'], censor: '[REDACTED]' },
    },
    destination
  );
  const component = (name) => {
    const child = root.child({ component: name });
    return (msg, extra) => child.info(extra || {}, msg);
  };
  return {
    service: component('service'),
    model: component('model'),
    http: component('http'),
    auth: component('auth'),
    info: (msg, extra) => root.info(extra || {}, msg),
    warn: (msg, extra) => root.warn(extra || {}, msg),
    error: (msg, extra) => root.error(extra || {}, msg),
    raw: root,
  };
}

/** Логгер-«пустышка» для тестов: собирает сообщения в массив. */
function createMemoryLogger() {
  const lines = [];
  const push = (kind) => (msg, extra) => lines.push({ kind, msg, ...(extra || {}) });
  return { lines, service: push('service'), model: push('model'), http: push('http'), auth: push('auth'), info: push('info'), warn: push('warn'), error: push('error') };
}

module.exports = { createLogger, createMemoryLogger };
