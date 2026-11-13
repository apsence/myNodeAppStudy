'use strict';

/** WebSocket-клиент: печатает уведомления об изменениях коллекции students. Выход — Ctrl+C. */
require('dotenv').config({ path: require('node:path').join(__dirname, '..', '.env') });
const WebSocket = require('ws');

const url = process.argv[2] || `ws://localhost:${process.env.WS_PORT || 3001}`;
const ws = new WebSocket(url);

ws.on('open', () => console.log('[WS] Подключен'));
ws.on('message', (raw) => {
  const msg = JSON.parse(raw);
  if (msg.type === 'hello') return;
  const shown =
    msg.type === 'update' ? { _id: msg.id, ...msg.updatedFields }
    : msg.type === 'delete' ? { _id: msg.id }
    : { name: msg.document && msg.document.name };
  console.log(`[WS] ${msg.type}: ${JSON.stringify(shown)}`);
});
ws.on('close', () => { console.log('[WS] Соединение закрыто'); process.exit(0); });
ws.on('error', (err) => { console.error(`[WS] Ошибка: ${err.message}`); process.exit(1); });
process.on('SIGINT', () => ws.close());
