'use strict';

/**
 * WebSocket-уведомления об изменениях пользователей: подключение ws(s)://host/ws?token=<access JWT>.
 * Клиент без валидного токена закрывается с кодом 4401. В событиях нет персональных данных — только тип и id.
 * Токен в query-строке попадает в логи прокси: для production используйте wss:// и короткоживущие токены.
 */
function attachWebSocket({ server, tokens, bus, logger, path = '/ws', WebSocketServer = null }) {
  const Server = WebSocketServer || require('ws').WebSocketServer;
  const wss = new Server({ server, path });
  const OPEN = 1;

  wss.on('connection', (socket, req) => {
    let user;
    try {
      const url = new URL(req.url, 'http://localhost');
      user = tokens.verifyAccess(url.searchParams.get('token'));
    } catch {
      socket.close(4401, 'Unauthorized');
      return;
    }
    socket.user = user;
    logger.info(`[WS] подключён ${user.email} (клиентов: ${wss.clients.size})`);
    socket.send(JSON.stringify({ type: 'hello', user: user.email }));
    socket.on('close', () => logger.info(`[WS] отключён ${user.email}`));
  });

  const onUserEvent = (event) => {
    const message = JSON.stringify(event);
    for (const client of wss.clients) if (client.readyState === OPEN && client.user) client.send(message);
  };
  bus.on('user', onUserEvent);

  return {
    wss,
    clientCount: () => wss.clients.size,
    close: () =>
      new Promise((resolve) => {
        bus.off('user', onUserEvent);
        for (const client of wss.clients) client.terminate();
        wss.close(() => resolve());
      }),
  };
}

module.exports = { attachWebSocket };
