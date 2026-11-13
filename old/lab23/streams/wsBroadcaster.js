'use strict';

const WebSocket = require('ws');

/** WebSocket-сервер: рассылает события Change Stream всем подключённым клиентам. */
class WsBroadcaster {
  constructor({ port, logger }) {
    this.port = port;
    this.logger = logger;
    this.wss = null;
  }

  start() {
    return new Promise((resolve, reject) => {
      this.wss = new WebSocket.WebSocketServer({ port: this.port });
      this.wss.once('listening', () => {
        this.logger.info(`WebSocket на порту ${this.port}`);
        resolve();
      });
      this.wss.once('error', reject);
      this.wss.on('connection', (socket) => {
        this.logger.info(`[WS] клиент подключён (всего: ${this.wss.clients.size})`);
        socket.send(JSON.stringify({ type: 'hello', message: 'Подключено к уведомлениям students' }));
        socket.on('close', () => this.logger.info(`[WS] клиент отключён (всего: ${this.wss.clients.size})`));
      });
    });
  }

  broadcast(event) {
    if (!this.wss) return 0;
    const message = JSON.stringify({ type: event.operation, ...event });
    let sent = 0;
    for (const client of this.wss.clients) {
      if (client.readyState === WebSocket.OPEN) { client.send(message); sent++; }
    }
    return sent;
  }

  clientCount() { return this.wss ? this.wss.clients.size : 0; }

  close() {
    return new Promise((resolve) => {
      if (!this.wss) return resolve();
      for (const c of this.wss.clients) c.terminate();
      this.wss.close(() => resolve());
    });
  }
}

module.exports = { WsBroadcaster };
