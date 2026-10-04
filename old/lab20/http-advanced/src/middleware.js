'use strict';
const { GROUP } = require('./config');
const { timestamp, encodeHeader } = require('./utils');

const protocolOf = (req) => (req.socket.encrypted ? 'https' : 'http');

// 1) Общие заголовки: X-Group во ВСЕХ ответах
function headers(req, res, next) {
  res.setHeader('X-Powered-By', 'Node.js');
  res.setHeader('X-Group', encodeHeader(GROUP));
  res.setHeader('Cache-Control', 'no-cache');
  next();
}

// 2) Access-лог: консоль + access.log
function createLogger(logStream) {
  return function logger(req, res, next) {
    res.on('finish', () => {
      const line = `[${timestamp()}] [${GROUP}] ${req.method} ${req.url} ${res.statusCode}`;
      console.log(line);
      logStream.write(line + '\n');
    });
    next();
  };
}

// 3) Счётчики запросов
function createMetricsCollector(metrics) {
  return function collector(req, res, next) {
    res.on('finish', () => metrics.record(req.method, res.statusCode, protocolOf(req)));
    next();
  };
}

// 4) Кэш GET /api/*: HIT отдаётся без обращения к обработчику, запись в /api/* сбрасывает кэш
function createCacheMiddleware(cache) {
  return function cacheMiddleware(req, res, next) {
    const pathname = req.url.split('?')[0];
    if (!pathname.startsWith('/api/')) return next();

    if (req.method !== 'GET') {
      // Инвалидация при изменении данных
      res.on('finish', () => {
        if (res.statusCode < 400 && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
          const removed = cache.invalidate('GET /api/');
          if (removed) console.log(`[CACHE] инвалидировано записей: ${removed}`);
        }
      });
      return next();
    }

    const key = `GET ${req.url}`;
    const entry = cache.get(key);
    if (entry) {
      cache.hit();
      res.statusCode = entry.status;
      res.setHeader('Content-Type', entry.type);
      res.setHeader('Cache-Control', `max-age=${cache.ttlMs / 1000}`);
      res.setHeader('Age', Math.floor((Date.now() - entry.storedAt) / 1000));
      res.setHeader('X-Cache', 'HIT');
      return res.end(entry.body);
    }

    cache.miss();
    res.setHeader('Cache-Control', `max-age=${cache.ttlMs / 1000}`);
    res.setHeader('X-Cache', 'MISS');

    // Перехватываем тело ответа, чтобы сохранить его в кэш
    const chunks = [];
    const originalWrite = res.write.bind(res);
    const originalEnd = res.end.bind(res);
    res.write = (chunk, ...rest) => {
      if (chunk) chunks.push(Buffer.from(chunk));
      return originalWrite(chunk, ...rest);
    };
    res.end = (chunk, ...rest) => {
      if (chunk && typeof chunk !== 'function') chunks.push(Buffer.from(chunk));
      if (res.statusCode === 200) {
        cache.set(key, {
          status: 200,
          type: res.getHeader('Content-Type') || 'application/octet-stream',
          body: Buffer.concat(chunks),
        });
      }
      return originalEnd(chunk, ...rest);
    };
    next();
  };
}

module.exports = { headers, createLogger, createMetricsCollector, createCacheMiddleware, protocolOf };
