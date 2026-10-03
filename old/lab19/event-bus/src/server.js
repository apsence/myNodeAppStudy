'use strict';
// Интеграция с модулем http: каждый запрос -> событие "request"
const http = require('http');

function createServer(bus) {
  return http.createServer((req, res) => {
    const pathname = req.url.split('?')[0];

    bus.emit('request', { method: req.method, url: req.url });

    if (req.method === 'GET' && pathname === '/metrics') {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(bus.getMetrics(), null, 2));
      return;
    }

    if (req.method === 'GET' && pathname === '/') {
      res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end(`EventBus (группа ${bus.group})\nGET /metrics — метрики\n`);
      return;
    }

    res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: 'Not Found' }));
  });
}

module.exports = { createServer };
