'use strict';
// EventBus: EventEmitter с приоритетами, wildcard-подпиской, once и метриками
const EventEmitter = require('events');

const DEFAULT_GROUP = 'ББМО-01-23';

class EventBus extends EventEmitter {
  constructor({ group = DEFAULT_GROUP, logger = console } = {}) {
    super();
    this.group = group;
    this.logger = logger;

    this._handlers = new Map(); // event -> [{ listener, priority, once, order }]
    this._anyHandlers = [];     // wildcard-слушатели
    this._seq = 0;              // порядок добавления (для равных приоритетов)

    this._metrics = {
      total: 0,
      counts: new Map(),     // event -> количество emit
      errors: new Map(),     // event -> количество ошибок в слушателях
      lastCalled: new Map(), // event -> Date последнего вызова
    };

    // Слушатель error с высоким приоритетом: логирует все ошибки с группой
    this.on('error', (err, source) => this._defaultErrorHandler(err, source), 1000);
  }

  // ---------- Подписка ----------
  _add(event, listener, priority, once) {
    if (typeof listener !== 'function') {
      throw new TypeError('listener должен быть функцией');
    }
    const entry = { listener, priority: Number(priority) || 0, once, order: ++this._seq };
    const list = this._handlers.get(event) || [];
    list.push(entry);
    // По убыванию приоритета; при равенстве — в порядке добавления
    list.sort((a, b) => b.priority - a.priority || a.order - b.order);
    this._handlers.set(event, list);
    return this;
  }

  on(event, listener, priority = 0) {
    return this._add(event, listener, priority, false);
  }

  addListener(event, listener, priority = 0) {
    return this.on(event, listener, priority);
  }

  once(event, listener, priority = 0) {
    return this._add(event, listener, priority, true);
  }

  // Wildcard: слушатель получает (имя события, ...аргументы) при ЛЮБОМ событии
  onAny(listener) {
    if (typeof listener !== 'function') {
      throw new TypeError('listener должен быть функцией');
    }
    this._anyHandlers.push(listener);
    return this;
  }

  offAny(listener) {
    const i = this._anyHandlers.indexOf(listener);
    if (i !== -1) this._anyHandlers.splice(i, 1);
    return this;
  }

  // ---------- Отписка ----------
  _removeEntry(event, entry) {
    const list = this._handlers.get(event);
    if (!list) return;
    const i = list.indexOf(entry);
    if (i !== -1) list.splice(i, 1);
    if (list.length === 0) this._handlers.delete(event);
  }

  off(event, listener) {
    const list = this._handlers.get(event);
    if (!list) return this;
    const entry = list.find((e) => e.listener === listener);
    if (entry) this._removeEntry(event, entry);
    return this;
  }

  removeListener(event, listener) {
    return this.off(event, listener);
  }

  removeAllListeners(event) {
    if (event === undefined) {
      this._handlers.clear();
      this._anyHandlers = [];
    } else {
      this._handlers.delete(event);
    }
    return this;
  }

  // ---------- Информация о подписках ----------
  listenerCount(event) {
    return (this._handlers.get(event) || []).length;
  }

  listeners(event) {
    return (this._handlers.get(event) || []).map((e) => e.listener);
  }

  eventNames() {
    return [...this._handlers.keys()];
  }

  // ---------- Генерация событий ----------
  emit(event, ...args) {
    const specific = this._handlers.get(event) || [];

    // Как и в Node.js: error без слушателей — исключение
    if (event === 'error' && specific.length === 0) {
      throw args[0] instanceof Error ? args[0] : new Error(String(args[0]));
    }

    const hadListeners = specific.length > 0 || this._anyHandlers.length > 0;

    this._recordMetric(event);

    // 1) wildcard-слушатели (мониторинг/логирование)
    for (const fn of [...this._anyHandlers]) {
      this._invoke(fn, event, [event, ...args]);
    }
    // 2) обычные слушатели с учётом приоритетов
    this._dispatch(event, args);

    return hadListeners;
  }

  _dispatch(event, args) {
    const list = this._handlers.get(event);
    if (!list) return;
    for (const entry of [...list]) {
      // once-кэш: удаляем ДО вызова — гарантия ровно одного срабатывания
      if (entry.once) this._removeEntry(event, entry);
      this._invoke(entry.listener, event, args);
    }
  }

  // Безопасный вызов слушателя: try/catch + перехват async-ошибок
  _invoke(fn, event, args) {
    try {
      const result = fn.apply(this, args);
      if (result && typeof result.then === 'function') {
        result.then(undefined, (err) => this._handleListenerError(err, event));
      }
    } catch (err) {
      this._handleListenerError(err, event);
    }
  }

  _handleListenerError(err, event) {
    this._bump(this._metrics.errors, event);

    const hasErrorHandler = (this._handlers.get('error') || []).length > 0;
    if (event === 'error' || !hasErrorHandler) {
      // Ошибка в самом обработчике ошибок — не зацикливаемся
      this.logger.error(`[ERROR] [${this.group}] Необработанная ошибка в "${event}": ${err.message}`);
      return;
    }
    this._dispatch('error', [err, event]);
  }

  _defaultErrorHandler(err, source) {
    const message = err instanceof Error ? err.message : String(err);
    const where = source ? ` в слушателе "${source}"` : '';
    this.logger.error(`[ERROR] [${this.group}] Ошибка${where}: ${message}`);
  }

  // ---------- Метрики ----------
  _bump(map, key) {
    map.set(key, (map.get(key) || 0) + 1);
  }

  _recordMetric(event) {
    this._metrics.total++;
    this._bump(this._metrics.counts, event);
    this._metrics.lastCalled.set(event, new Date());
  }

  getMetrics() {
    const listeners = {};
    for (const [name, list] of this._handlers) {
      if (list.length > 0) listeners[name] = list.length;
    }
    const lastCalled = {};
    for (const [name, date] of this._metrics.lastCalled) lastCalled[name] = date.toISOString();

    return {
      group: this.group,
      events: Object.fromEntries(this._metrics.counts),
      errors: Object.fromEntries(this._metrics.errors),
      lastCalled,
      total: this._metrics.total,
      listeners,
      anyListeners: this._anyHandlers.length,
    };
  }
}

module.exports = EventBus;
