'use strict';
// In-memory кэш GET-запросов к /api/* (TTL 60 с) + инвалидация при изменении данных

function createCache(ttlMs) {
  const store = new Map(); // key -> { status, type, body, expires, storedAt }
  const stats = { hits: 0, misses: 0, invalidations: 0 };

  return {
    ttlMs,
    get(key) {
      const entry = store.get(key);
      if (!entry) return null;
      if (entry.expires <= Date.now()) {
        store.delete(key);
        return null;
      }
      return entry;
    },
    set(key, entry) {
      store.set(key, { ...entry, storedAt: Date.now(), expires: Date.now() + ttlMs });
    },
    invalidate(prefix = '') {
      let removed = 0;
      for (const key of store.keys()) {
        if (key.startsWith(prefix)) {
          store.delete(key);
          removed++;
        }
      }
      if (removed) stats.invalidations += removed;
      return removed;
    },
    hit() {
      stats.hits++;
    },
    miss() {
      stats.misses++;
    },
    stats() {
      return { ...stats, entries: store.size, ttlSeconds: ttlMs / 1000 };
    },
  };
}

module.exports = { createCache };
