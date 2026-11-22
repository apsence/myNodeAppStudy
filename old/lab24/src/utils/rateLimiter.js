'use strict';

/** Ограничение частоты запросов (фиксированное окно, in-memory): по умолчанию 100 запросов в минуту на IP. */
class RateLimiter {
  constructor({ limit = 100, windowMs = 60000, now = Date.now, maxKeys = 10000 } = {}) {
    this.limit = limit;
    this.windowMs = windowMs;
    this.now = now;
    this.maxKeys = maxKeys;
    this.hits = new Map();
  }

  hit(key) {
    const t = this.now();
    if (this.hits.size > this.maxKeys) this.sweep(t);
    let entry = this.hits.get(key);
    if (!entry || entry.resetAt <= t) {
      entry = { count: 0, resetAt: t + this.windowMs };
      this.hits.set(key, entry);
    }
    entry.count++;
    return {
      allowed: entry.count <= this.limit,
      limit: this.limit,
      remaining: Math.max(0, this.limit - entry.count),
      resetAt: entry.resetAt,
      retryAfter: Math.max(1, Math.ceil((entry.resetAt - t) / 1000)),
    };
  }

  /** Удаляет истёкшие окна, чтобы карта не росла бесконечно. */
  sweep(t = this.now()) {
    for (const [key, entry] of this.hits) if (entry.resetAt <= t) this.hits.delete(key);
  }
}

module.exports = { RateLimiter };
