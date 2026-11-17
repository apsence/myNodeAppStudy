'use strict';

/** Метрики БД и HTTP: количество запросов, среднее время, ошибки. */
class Metrics {
  constructor({ now = Date.now } = {}) {
    this.now = now;
    this.startedAt = now();
    this.queries = 0;
    this.queryMs = 0;
    this.queryErrors = 0;
    this.requests = 0;
    this.requestMs = 0;
    this.byStatus = { '2xx': 0, '3xx': 0, '4xx': 0, '5xx': 0 };
  }

  recordQuery(ms, failed = false) {
    this.queries++;
    this.queryMs += ms;
    if (failed) this.queryErrors++;
  }

  recordRequest(status, ms) {
    this.requests++;
    this.requestMs += ms;
    const bucket = `${Math.floor(status / 100)}xx`;
    if (bucket in this.byStatus) this.byStatus[bucket]++;
  }

  snapshot({ cache = null, pool = null } = {}) {
    const round = (n) => Math.round(n * 100) / 100;
    return {
      queries: this.queries,
      avgTime: this.queries ? round(this.queryMs / this.queries) : 0,
      errors: this.queryErrors,
      cacheHitRate: cache ? cache.hitRate : 0,
      requests: {
        total: this.requests,
        avgTimeMs: this.requests ? round(this.requestMs / this.requests) : 0,
        byStatus: { ...this.byStatus },
      },
      pool,
      uptimeSeconds: Math.round((this.now() - this.startedAt) / 1000),
    };
  }
}

module.exports = { Metrics };
