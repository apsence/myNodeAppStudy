'use strict';

class MetricsController {
  constructor({ metrics, cache, database, wsBroadcaster }) {
    this.metrics = metrics;
    this.cache = cache;
    this.database = database;
    this.wsBroadcaster = wsBroadcaster;
    this.get = this.get.bind(this);
  }

  async get(ctx) {
    ctx.body = this.metrics.snapshot({
      cache: this.cache.stats(),
      mongodb_connection: {
        connected: this.database.isConnected,
        replicaSet: this.database.replicaSet,
        transactions: this.database.transactionsSupported,
      },
      websocket: { clients: this.wsBroadcaster ? this.wsBroadcaster.clientCount() : 0 },
    });
  }
}

module.exports = { MetricsController };
