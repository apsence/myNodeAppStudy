'use strict';

/** Метрики: запросы, среднее время, ошибки, операции MongoDB. */
class Metrics {
  constructor({ now = Date.now } = {}) {
    this.now = now;
    this.startedAt = now();
    this.total = 0;
    this.totalMs = 0;
    this.byStatus = { '2xx': 0, '3xx': 0, '4xx': 0, '5xx': 0 };
    this.byRoute = new Map();
    this.dbOps = new Map();
  }

  recordRequest({ method, route, status, ms }) {
    this.total++;
    this.totalMs += ms;
    const bucket = `${Math.floor(status / 100)}xx`;
    if (bucket in this.byStatus) this.byStatus[bucket]++;
    const key = `${method} ${route}`;
    const r = this.byRoute.get(key) || { count: 0, totalMs: 0, errors: 0 };
    r.count++;
    r.totalMs += ms;
    if (status >= 400) r.errors++;
    this.byRoute.set(key, r);
  }

  recordDbOp(name, ms) {
    const o = this.dbOps.get(name) || { count: 0, totalMs: 0 };
    o.count++;
    o.totalMs += ms;
    this.dbOps.set(name, o);
  }

  snapshot(extra = {}) {
    const round = (n) => Math.round(n * 100) / 100;
    const routes = {};
    for (const [k, v] of this.byRoute) routes[k] = { count: v.count, avgMs: round(v.totalMs / v.count), errors: v.errors };
    const dbOps = {};
    for (const [k, v] of this.dbOps) dbOps[k] = { count: v.count, avgMs: round(v.totalMs / v.count) };
    return {
      uptimeSeconds: Math.round((this.now() - this.startedAt) / 1000),
      requests: {
        total: this.total,
        averageMs: this.total ? round(this.totalMs / this.total) : 0,
        errors: this.byStatus['4xx'] + this.byStatus['5xx'],
        serverErrors: this.byStatus['5xx'],
        byStatus: { ...this.byStatus },
        byRoute: routes,
      },
      mongodb: dbOps,
      ...extra,
    };
  }
}

module.exports = { Metrics };
