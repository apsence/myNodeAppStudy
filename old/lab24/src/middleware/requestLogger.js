'use strict';

const { randomUUID } = require('node:crypto');

const VALID_ID = /^[\w-]{8,64}$/;

/** JSON-лог каждого запроса + сквозной X-Request-Id (чужой id принимается только если безопасен). */
function requestLogger({ logger }) {
  return async function logRequests(ctx, next) {
    const incoming = ctx.get('X-Request-Id');
    const requestId = VALID_ID.test(incoming) ? incoming : randomUUID();
    ctx.state.requestId = requestId;
    ctx.set('X-Request-Id', requestId);
    const t0 = process.hrtime.bigint();
    try {
      await next();
    } finally {
      const durationMs = Number(process.hrtime.bigint() - t0) / 1e6;
      logger.http(`${ctx.method} ${ctx.path}`, {
        requestId,
        method: ctx.method,
        url: ctx.originalUrl,
        status: ctx.status,
        durationMs: Math.round(durationMs * 10) / 10,
        ip: ctx.ip,
        userId: ctx.user && ctx.user.userId,
      });
    }
  };
}

module.exports = { requestLogger };
