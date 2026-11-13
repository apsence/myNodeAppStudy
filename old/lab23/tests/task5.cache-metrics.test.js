'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./helpers');

const { TTLCache } = load('utils/cache');
const { Metrics } = load('utils/metrics');

describe('Задание 5: кэширование (TTL 60 с, инвалидация)', () => {
  it('возвращает сохранённое значение до истечения TTL', () => {
    let t = 1000;
    const cache = new TTLCache({ ttlMs: 60000, now: () => t });
    cache.set('k', { a: 1 });
    t += 59999;
    assert.deepEqual(cache.get('k'), { a: 1 });
  });

  it('значение протухает ровно по истечении TTL', () => {
    let t = 0;
    const cache = new TTLCache({ ttlMs: 60000, now: () => t });
    cache.set('k', 'v');
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
  });

  it('считает hits / misses / hitRate', () => {
    const cache = new TTLCache();
    cache.set('a', 1);
    cache.get('a');
    cache.get('a');
    cache.get('nope');
    assert.deepEqual(
      { hits: cache.stats().hits, misses: cache.stats().misses, hitRate: cache.stats().hitRate },
      { hits: 2, misses: 1, hitRate: 67 }
    );
  });

  it('ограничивает размер: вытесняет самую старую запись', () => {
    const cache = new TTLCache({ maxEntries: 2 });
    cache.set('a', 1);
    cache.set('b', 2);
    cache.set('c', 3);
    assert.equal(cache.get('a'), undefined);
    assert.equal(cache.get('c'), 3);
  });
});

describe('Задание 5: метрики (/api/metrics)', () => {
  it('считает запросы, среднее время и ошибки по статусам', () => {
    const m = new Metrics();
    m.recordRequest({ method: 'GET', route: '/api/students', status: 200, ms: 10 });
    m.recordRequest({ method: 'GET', route: '/api/students', status: 200, ms: 20 });
    m.recordRequest({ method: 'GET', route: '/api/students/:id', status: 404, ms: 3 });
    m.recordRequest({ method: 'POST', route: '/api/students', status: 500, ms: 7 });
    const s = m.snapshot();
    assert.equal(s.requests.total, 4);
    assert.equal(s.requests.averageMs, 10);
    assert.equal(s.requests.errors, 2);
    assert.equal(s.requests.serverErrors, 1);
    assert.deepEqual(s.requests.byStatus, { '2xx': 2, '3xx': 0, '4xx': 1, '5xx': 1 });
    assert.deepEqual(s.requests.byRoute['GET /api/students'], { count: 2, avgMs: 15, errors: 0 });
  });

  it('учитывает операции MongoDB и добавляет дополнительные секции', () => {
    const m = new Metrics();
    m.recordDbOp('find', 2);
    m.recordDbOp('find', 4);
    const s = m.snapshot({ cache: { size: 1 } });
    assert.deepEqual(s.mongodb.find, { count: 2, avgMs: 3 });
    assert.deepEqual(s.cache, { size: 1 });
  });

  it('при отсутствии запросов среднее время равно 0 (без деления на ноль)', () => {
    assert.equal(new Metrics().snapshot().requests.averageMs, 0);
  });

  it('uptime считается от момента создания', () => {
    let t = 0;
    const m = new Metrics({ now: () => t });
    t = 5400;
    assert.equal(m.snapshot().uptimeSeconds, 5);
  });
});
