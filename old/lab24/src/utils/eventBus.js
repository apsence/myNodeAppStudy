'use strict';

const EventEmitter = require('node:events');

/** Шина событий домена: сервисы публикуют 'user' { type, userId, at }, WebSocket и метрики подписываются. */
function createEventBus() {
  const bus = new EventEmitter();
  bus.setMaxListeners(50);
  bus.publishUser = (type, userId) => bus.emit('user', { type, userId: String(userId), at: new Date().toISOString() });
  return bus;
}

module.exports = { createEventBus };
