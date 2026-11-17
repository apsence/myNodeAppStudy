'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./helpers');

const { TTLCache } = load('lib/cache');
const { Metrics } = load('lib/metrics');

describe('Задание 5: кэш (TTL 60 с, инвалидация, статистика)', () => {
  it('значение доступно до истечения TTL и пропадает ровно по его окончании', () => {
    let t = 0;
    const cache = new TTLCache({ ttlMs: 60000, now: () => t });
    cache.set('k', { a: 1 });
    t = 59999;
    assert.deepEqual(cache.get('k'), { a: 1 });
    t = 60000;
    assert.equal(cache.get('k'), undefined);
    assert.equal(cache.stats().size, 0);
  });

  it('clear() — инвалидация сбрасывает все записи и считается в статистике', () => {
    const cache = new TTLCache();
    cache.set('a', 1);
    cache.set('b', 2);
    cache.clear();
    assert.equal(cache.get('a'), undefined);
    assert.equal(cache.stats().invalidations, 1);
    cache.clear(); // пустой кэш инвалидацией не считается
    assert.equal(cache.stats().invalidations, 1);
  });

  it('статистика: hits, misses, hitRate в долях (как cacheHitRate 0.65 в примере)', () => {
    const cache = new TTLCache();
    cache.set('a', 1);
    cache.get('a');
    cache.get('a');
    cache.get('nope');
    assert.deepEqual(cache.stats(), { size: 1, hits: 2, misses: 1, hitRate: 0.67, invalidations: 0, ttlSeconds: 60 });
  });

  it('при переполнении вытесняет самую старую запись', () => {
    const cache = new TTLCache({ maxEntries: 2 });
    cache.set('a', 1);
    cache.set('b', 2);
    cache.set('c', 3);
    assert.equal(cache.get('a'), undefined);
    assert.equal(cache.get('c'), 3);
  });
});

describe('Задание 5: метрики (/api/metrics)', () => {
  it('queries, avgTime, errors и cacheHitRate как в примере из задания', () => {
    const m = new Metrics();
    m.recordQuery(2, false);
    m.recordQuery(4, false);
    m.recordQuery(3, true);
    const s = m.snapshot({ cache: { hitRate: 0.65 } });
    assert.equal(s.queries, 3);
    assert.equal(s.avgTime, 3);
    assert.equal(s.errors, 1);
    assert.equal(s.cacheHitRate, 0.65);
  });

  it('HTTP-запросы считаются по классам статусов', () => {
    const m = new Metrics();
    m.recordRequest(200, 10);
    m.recordRequest(404, 2);
    m.recordRequest(409, 4);
    m.recordRequest(503, 1);
    const s = m.snapshot();
    assert.equal(s.requests.total, 4);
    assert.deepEqual(s.requests.byStatus, { '2xx': 1, '3xx': 0, '4xx': 2, '5xx': 1 });
    assert.equal(s.requests.avgTimeMs, 4.25);
  });

  it('без данных: нули, без деления на ноль', () => {
    const s = new Metrics().snapshot();
    assert.equal(s.avgTime, 0);
    assert.equal(s.cacheHitRate, 0);
    assert.equal(s.requests.avgTimeMs, 0);
  });
});
