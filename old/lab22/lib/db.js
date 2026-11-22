'use strict';

const { performance } = require('node:perf_hooks');
const { isCriticalError, classifyError } = require('./errors');

const compact = (sql) => String(sql).replace(/\s+/g, ' ').trim();
const short = (text, max) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

/**
 * Обёртка над пулом mysql2/promise: логирование всех SQL-запросов, метрики
 * и транзакции с обязательным release() в finally.
 * DAO и сервисы работают только с этим интерфейсом: db.query(sql, params) и db.transaction(fn).
 */
function createDb(pool, { logger = null, metrics = null } = {}) {
  async function run(target, sql, params) {
    const t0 = performance.now();
    let failed = false;
    try {
      return await target.query(sql, params);
    } catch (err) {
      failed = true;
      throw err;
    } finally {
      const ms = performance.now() - t0;
      if (metrics) metrics.recordQuery(ms, failed);
      if (logger) {
        // значения параметров показываем сокращённо и только как справку; в SQL они не подставляются
        const p = params && params.length ? ` ${short(JSON.stringify(params), 80)}` : '';
        logger.op(`${short(compact(sql), 160)}${p} (${ms.toFixed(1)}ms)${failed ? ' ✖ ОШИБКА' : ''}`);
      }
    }
  }

  return {
    pool,
    query: (sql, params) => run(pool, sql, params),

    /** Транзакция: BEGIN → fn(tx) → COMMIT, при ошибке ROLLBACK; соединение всегда возвращается в пул. */
    async transaction(fn) {
      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();
        if (logger) logger.op('BEGIN TRANSACTION');
        const result = await fn({ query: (sql, params) => run(conn, sql, params) });
        await conn.commit();
        if (logger) logger.op('COMMIT');
        return result;
      } catch (err) {
        try {
          await conn.rollback();
          if (logger) logger.op('ROLLBACK');
        } catch { /* соединение уже потеряно — откат выполнит сервер */ }
        throw err;
      } finally {
        conn.release();
      }
    },

    /** Состояние пула для /api/metrics (внутренние поля mysql2 — поэтому с защитой). */
    poolInfo() {
      let inner = pool && pool.pool; // у ManagedPool это PromisePool, у PromisePool — внутренний пул
      if (inner && inner.pool) inner = inner.pool;
      const size = (q) => (q && (q.length ?? q.size)) ?? null;
      return inner
        ? { limit: inner.config && inner.config.connectionLimit, open: size(inner._allConnections), idle: size(inner._freeConnections), waiting: size(inner._connectionQueue) }
        : null;
    },
  };
}

/**
 * Пул с авто-восстановлением: слушает событие 'error' пула и при критических ошибках
 * (потеря соединения, закрытый пул) создаёт новый пул и повторяет операцию один раз.
 */
class ManagedPool {
  constructor({ factory, logger = null }) {
    this.factory = factory;
    this.logger = logger;
    this.recreations = 0;
    this.errors = [];
    this._pool = null;
    this._create();
  }

  get pool() { return this._pool; }

  _log(msg) { if (this.logger) this.logger.info(msg); }

  _create() {
    this._pool = this.factory();
    const pool = this._pool;
    if (typeof pool.on === 'function') {
      pool.on('error', (err) => {
        const { code } = classifyError(err);
        this.errors.push(code);
        this._log(`[POOL ERROR] ${code}`);
        if (isCriticalError(err)) this.recreate(pool);
      });
    }
  }

  /** Пересоздаёт пул. failedPool защищает от повторного пересоздания при одновременных сбоях. */
  async recreate(failedPool = this._pool) {
    if (failedPool !== this._pool) return;
    this._log('[POOL] Пересоздание пула...');
    this.recreations++;
    this._create();
    try { await failedPool.end(); } catch { /* старый пул мог быть уже закрыт */ }
    this._log('[POOL] ✔ Новый пул создан');
  }

  async _withRecovery(fn) {
    const used = this._pool;
    try {
      return await fn(used);
    } catch (err) {
      if (!isCriticalError(err)) throw err;
      this.errors.push(classifyError(err).code);
      this._log(`[POOL ERROR] ${classifyError(err).code}`);
      await this.recreate(used);
      return fn(this._pool); // одна повторная попытка на новом пуле
    }
  }

  query(sql, params) { return this._withRecovery((p) => p.query(sql, params)); }
  getConnection() { return this._withRecovery((p) => p.getConnection()); }
  end() { return this._pool.end(); }
}

module.exports = { createDb, ManagedPool };
