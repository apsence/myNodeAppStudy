'use strict';

const { performance } = require('node:perf_hooks');

/** Самый внешний middleware: логирует запрос и считает HTTP-метрики. */
function requestLogger({ logger, metrics }) {
  return async function requestLoggerMiddleware(ctx, next) {
    const t0 = performance.now();
    try {
      await next();
    } finally {
      const ms = performance.now() - t0;
      logger.op(`HTTP ${ctx.method} ${ctx.originalUrl} → ${ctx.status} (${ms.toFixed(1)}ms)`);
      metrics.recordRequest(ctx.status, ms);
    }
  };
}

module.exports = { requestLogger };
