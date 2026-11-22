'use strict';

class SystemController {
  constructor({ cache, metrics }) {
    this.cache = cache;
    this.metrics = metrics;
    this.cacheStats = this.cacheStats.bind(this);
    this.metricsInfo = this.metricsInfo.bind(this);
    this.health = this.health.bind(this);
  }

  async cacheStats(ctx) { ctx.body = this.cache.stats(); }

  async metricsInfo(ctx) {
    ctx.body = this.metrics.snapshot({ cache: this.cache.stats(), pool: ctx.db.poolInfo() });
  }

  async health(ctx) {
    await ctx.db.query('SELECT 1');
    ctx.body = { status: 'ok' };
  }
}

module.exports = { SystemController };
