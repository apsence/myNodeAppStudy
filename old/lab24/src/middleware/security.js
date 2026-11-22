'use strict';

const { RateLimiter } = require('../utils/rateLimiter');
const { findForbiddenKey } = require('../utils/sanitize');
const { TooManyRequestsError, ValidationError } = require('../utils/errors');

/** Helmet: заголовки безопасности (CSP, HSTS, X-Content-Type-Options и др.). */
function helmetMiddleware() {
  const mod = require('koa-helmet');
  return (mod.default || mod)();
}

/** CORS: разрешены только источники из белого списка (CORS_ORIGINS). */
function corsMiddleware({ origins }) {
  const cors = require('@koa/cors');
  return cors({
    origin: (ctx) => {
      const origin = ctx.get('Origin');
      return origin && origins.includes(origin) ? origin : ''; // пусто — CORS-заголовки не выставляются
    },
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization'],
    exposeHeaders: ['X-Group', 'X-RateLimit-Limit', 'X-RateLimit-Remaining', 'X-RateLimit-Reset'],
    maxAge: 600,
  });
}

/** Rate limiting: по умолчанию 100 запросов в минуту на IP, при превышении — 429 и Retry-After. */
function rateLimitMiddleware({ limit = 100, windowMs = 60000, now = Date.now } = {}) {
  const limiter = new RateLimiter({ limit, windowMs, now });
  return async function rateLimit(ctx, next) {
    const r = limiter.hit(ctx.ip);
    ctx.set('X-RateLimit-Limit', String(r.limit));
    ctx.set('X-RateLimit-Remaining', String(r.remaining));
    ctx.set('X-RateLimit-Reset', String(Math.ceil(r.resetAt / 1000)));
    if (!r.allowed) {
      ctx.set('Retry-After', String(r.retryAfter));
      throw new TooManyRequestsError('Too many requests', { retryAfter: r.retryAfter });
    }
    await next();
  };
}

/** Защита от NoSQL-инъекций: операторы MongoDB ($gt, $ne, ...) и точки в ключах запрещены в body и query. */
function sanitizeMiddleware() {
  return async function sanitize(ctx, next) {
    for (const value of [ctx.request.body, ctx.query]) {
      const bad = findForbiddenKey(value);
      if (bad) throw new ValidationError([{ field: bad, message: 'недопустимый ключ (операторы MongoDB запрещены)' }], 'Invalid input');
    }
    await next();
  };
}

module.exports = { helmetMiddleware, corsMiddleware, rateLimitMiddleware, sanitizeMiddleware };
