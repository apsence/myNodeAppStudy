'use strict';

const { performance } = require('node:perf_hooks');

/** Логирует каждый запрос и собирает метрики (самый внешний middleware). */
function requestLogger({ logger, metrics }) {
  return async function requestLoggerMiddleware(ctx, next) {
    const t0 = performance.now();
    try {
      await next();
    } finally {
      const ms = performance.now() - t0;
      const route = ctx._matchedRoute || ctx.path;
      logger.op(`${ctx.method} ${ctx.originalUrl} → ${ctx.status} (${ms.toFixed(1)}ms)`);
      metrics.recordRequest({ method: ctx.method, route, status: ctx.status, ms });
    }
  };
}

module.exports = { requestLogger };
