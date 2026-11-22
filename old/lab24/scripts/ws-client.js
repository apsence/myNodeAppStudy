'use strict';

/**
 * WebSocket-клиент уведомлений (задание 5): сначала входит по HTTP, затем подключается к /ws с access-токеном.
 *   npm run ws-client -- --email=admin@bbmo.example --password=AdminPass123
 */
const WebSocket = require('ws');
const { arg, baseUrl } = require('./_env');

async function main() {
  const email = arg('email', process.env.WS_EMAIL);
  const password = arg('password', process.env.WS_PASSWORD);
  if (!email || !password) {
    console.error('Использование: npm run ws-client -- --email=... --password=...');
    process.exitCode = 1;
    return;
  }
  const res = await fetch(`${baseUrl}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
  const body = await res.json();
  if (!res.ok) throw new Error(`вход не удался: ${body.error}`);

  const wsUrl = `${baseUrl.replace(/^http/, 'ws')}/ws?token=${encodeURIComponent(body.accessToken)}`;
  const ws = new WebSocket(wsUrl);
  ws.on('open', () => console.log('[WS] Подключен'));
  ws.on('message', (raw) => {
    const m = JSON.parse(raw);
    if (m.type === 'hello') return console.log(`[WS] Авторизован как ${m.user}`);
    console.log(`[WS] ${m.type}: ${JSON.stringify({ userId: m.userId, at: m.at })}`);
  });
  ws.on('close', (code) => { console.log(`[WS] Соединение закрыто (${code})`); process.exit(0); });
  ws.on('error', (err) => { console.error(`[WS] Ошибка: ${err.message}`); process.exit(1); });
  process.on('SIGINT', () => ws.close());
}

main().catch((err) => {
  console.error(`✖ ${err.message}`);
  process.exitCode = 1;
});
