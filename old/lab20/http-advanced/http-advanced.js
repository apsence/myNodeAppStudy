'use strict';
// Лабораторная работа № 20 — Задание 5: полноценный HTTP/HTTPS-сервер на чистых http/https
const http = require('http');
const https = require('https');
const fs = require('fs');

const { GROUP, HTTP_PORT, HTTPS_PORT, ACCESS_LOG, CACHE_TTL_MS } = require('./src/config');
const { timestamp, sendJson, sendText } = require('./src/utils');
const { compose } = require('./src/pipeline');
const { createMetrics } = require('./src/metrics');
const { createCache } = require('./src/cache');
const { ensureCertificate } = require('./src/certs');
const { ensureStreamFile } = require('./src/stream');
const { createRouter } = require('./src/routes');
const mw = require('./src/middleware');

const logStream = fs.createWriteStream(ACCESS_LOG, { flags: 'a' });
const metrics = createMetrics();
const cache = createCache(CACHE_TTL_MS);

// ---------- Цепочка middleware ----------
const pipeline = compose([
  mw.headers,
  mw.createLogger(logStream),
  mw.createMetricsCollector(metrics),
  mw.createCacheMiddleware(cache),
  createRouter({ metrics, cache }),
]);

// Глобальный обработчик ошибок middleware
function errorHandler(err, req, res) {
  console.error(`[ERROR] ${req.method} ${req.url}: ${err.message}`);
  if (res.headersSent) return res.destroy();
  res.removeHeader('X-Cache');
  res.setHeader('Cache-Control', 'no-store');
  sendJson(res, 500, { error: 'Internal Server Error', message: err.message });
}

function handler(req, res) {
  pipeline(req, res, (err) => {
    if (err) return errorHandler(err, req, res);
    if (!res.writableEnded) sendText(res, 404, '404 Not Found');
  });
}

// ---------- Серверы ----------
const { key, cert, generated } = ensureCertificate();
const generatedStream = ensureStreamFile();

const httpServer = http.createServer(handler);
const httpsServer = https.createServer({ key, cert }, handler);

// Некорректные запросы (до middleware): отвечаем 400 и закрываем соединение
function onClientError(err, socket) {
  metrics.recordClientError();
  const line = `[${timestamp()}] [${GROUP}] CLIENT_ERROR ${err.code || err.message} 400`;
  console.warn(`[WARN] clientError: ${err.code || err.message}`);
  logStream.write(line + '\n');

  if (socket.writable) {
    socket.end(
      'HTTP/1.1 400 Bad Request\r\n' +
        `X-Group: ${GROUP}\r\n` +
        'Content-Length: 0\r\n' +
        'Connection: close\r\n\r\n'
    );
  } else {
    socket.destroy();
  }
}

function onServerError(name, port) {
  return (err) => {
    if (err.code === 'EADDRINUSE') console.error(`[ERROR] ${name}: порт ${port} уже занят`);
    else console.error(`[ERROR] ${name}: ${err.message}`);
    process.exit(1);
  };
}

httpServer.on('error', onServerError('HTTP', HTTP_PORT));
httpsServer.on('error', onServerError('HTTPS', HTTPS_PORT));
httpServer.on('clientError', onClientError);
httpsServer.on('clientError', onClientError);
httpsServer.on('tlsClientError', (err) => console.warn(`[WARN] tlsClientError: ${err.message}`));

httpServer.listen(HTTP_PORT, () => console.log(`[INFO] HTTP-сервер запущен на порту ${HTTP_PORT}`));
httpsServer.listen(HTTPS_PORT, () => {
  console.log(`[INFO] HTTPS-сервер запущен на порту ${HTTPS_PORT}${generated ? ' (создан самоподписанный сертификат в certs/)' : ''}`);
  console.log(`[INFO] Группа: ${GROUP}`);
  if (generatedStream) console.log('[INFO] Создан тестовый файл data/big-file.bin для /stream');
});

// ---------- Корректное завершение ----------
let shuttingDown = false;
function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`\n[INFO] Получен ${signal}, останавливаю серверы...`);

  let pending = 2;
  const done = () => {
    if (--pending > 0) return;
    console.log(`[INFO] Обработано запросов: ${metrics.snapshot().total}`);
    logStream.end(() => {
      console.log('[INFO] Серверы остановлены корректно');
      process.exit(0);
    });
  };
  httpServer.close(done);
  httpsServer.close(done);
  if (httpServer.closeIdleConnections) {
    httpServer.closeIdleConnections();
    httpsServer.closeIdleConnections();
  }
  // Страховка: не ждём "зависшие" соединения дольше 5 секунд
  setTimeout(() => {
    console.error('[WARN] Принудительное завершение');
    process.exit(1);
  }, 5000).unref();
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
