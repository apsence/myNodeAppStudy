'use strict';

/** In-memory кэш с TTL. now() вынесен в параметр, чтобы время подменялось в тестах. */
class TTLCache {
  constructor({ ttlMs = 60000, maxEntries = 500, now = Date.now } = {}) {
    this.ttlMs = ttlMs;
    this.maxEntries = maxEntries;
    this.now = now;
    this.map = new Map();
    this.hits = 0;
    this.misses = 0;
    this.invalidations = 0;
  }

  get(key) {
    const entry = this.map.get(key);
    if (!entry) { this.misses++; return undefined; }
    if (entry.expiresAt <= this.now()) {
      this.map.delete(key);
      this.misses++;
      return undefined;
    }
    this.hits++;
    return entry.value;
  }

  set(key, value) {
    if (this.map.size >= this.maxEntries && !this.map.has(key)) {
      this.map.delete(this.map.keys().next().value); // вытесняем самую старую запись
    }
    this.map.set(key, { value, expiresAt: this.now() + this.ttlMs });
  }

  delete(key) { return this.map.delete(key); }

  /** Инвалидация: любая запись в БД может менять любые выборки, поэтому очищаем всё. */
  clear() {
    if (this.map.size) this.invalidations++;
    this.map.clear();
  }

  stats() {
    const total = this.hits + this.misses;
    return {
      size: this.map.size,
      hits: this.hits,
      misses: this.misses,
      hitRate: total ? Math.round((this.hits / total) * 100) / 100 : 0,
      invalidations: this.invalidations,
      ttlSeconds: this.ttlMs / 1000,
    };
  }
}

module.exports = { TTLCache };
