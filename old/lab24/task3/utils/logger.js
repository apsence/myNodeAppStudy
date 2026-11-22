'use strict';

const pad2 = (n) => String(n).padStart(2, '0');
function timestamp(d = new Date()) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
}

/**
 * Логгеры по слоям: [дата] [SERVICE] ..., [MODEL] ..., [HTTP] ..., [AUTH] ...
 * out/now вынесены в параметры, чтобы подменять их в тестах.
 */
function createLogger({ out = console.log, now = () => new Date() } = {}) {
  const tagged = (tag) => (msg) => out(`[${timestamp(now())}] [${tag}] ${msg}`);
  return {
    service: tagged('SERVICE'),
    model: tagged('MODEL'),
    http: tagged('HTTP'),
    auth: tagged('AUTH'),
    info: (msg) => out(`[INFO] ${msg}`),
    warn: (msg) => out(`[WARN] ${msg}`),
    error: (msg) => out(`[ERROR] ${msg}`),
  };
}

module.exports = { createLogger, timestamp };
