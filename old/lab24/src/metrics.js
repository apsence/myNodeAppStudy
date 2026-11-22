'use strict';

/** Метрики Prometheus: http_requests_total, http_request_duration_seconds, user_events_total + системные. */
function createMetrics({ client = null } = {}) {
  const prom = client || require('prom-client');
  const register = new prom.Registry();
  prom.collectDefaultMetrics({ register });

  const labelNames = ['method', 'path', 'status'];
  const httpRequests = new prom.Counter({ name: 'http_requests_total', help: 'Total HTTP requests', labelNames, registers: [register] });
  const httpDuration = new prom.Histogram({
    name: 'http_request_duration_seconds',
    help: 'HTTP request duration in seconds',
    labelNames,
    buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5],
    registers: [register],
  });
  const userEvents = new prom.Counter({ name: 'user_events_total', help: 'User domain events', labelNames: ['type'], registers: [register] });

  return {
    register,
    httpRequests,
    httpDuration,
    userEvents,
    /** Метка path — шаблон маршрута (/api/users/:id), а не реальный URL: иначе число меток растёт бесконтрольно. */
    middleware() {
      return async function collect(ctx, next) {
        const t0 = process.hrtime.bigint();
        try {
          await next();
        } finally {
          const labels = { method: ctx.method, path: ctx._matchedRoute || (ctx.status === 404 ? 'unmatched' : ctx.path), status: String(ctx.status) };
          httpRequests.inc(labels);
          httpDuration.observe(labels, Number(process.hrtime.bigint() - t0) / 1e9);
        }
      };
    },
    async render() {
      return { contentType: register.contentType, body: await register.metrics() };
    },
  };
}

module.exports = { createMetrics };
