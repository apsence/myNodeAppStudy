'use strict';

/** loggerMiddleware: [дата] [HTTP] METHOD url → status (время). */
function loggerMiddleware({ logger }) {
  return async function requestLogger(ctx, next) {
    const t0 = process.hrtime.bigint();
    try {
      await next();
    } finally {
      const ms = Number(process.hrtime.bigint() - t0) / 1e6;
      logger.http(`${ctx.method} ${ctx.originalUrl} → ${ctx.status} (${ms.toFixed(1)}ms)`);
    }
  };
}

module.exports = { loggerMiddleware };
