'use strict';
const { GROUP, MAX_BODY } = require('./config');
const { HttpError, sendJson, sendText, readBody } = require('./utils');
const { serveStatic } = require('./static');
const { streamFile } = require('./stream');

function createRouter({ metrics, cache }) {
  const items = [{ id: 1, name: 'Первый элемент' }];
  let nextId = 2;

  return async function router(req, res) {
    const pathname = req.url.split('?')[0]; // "сырой" путь: new URL() схлопнул бы ../
    const isRead = req.method === 'GET' || req.method === 'HEAD';
    const methodNotAllowed = (allow) => {
      res.setHeader('Allow', allow);
      return sendText(res, 405, '405 Method Not Allowed');
    };

    try {
      // --- главная: сравнение HTTP и HTTPS ---
      if (pathname === '/') {
        if (!isRead) return methodNotAllowed('GET, HEAD');
        const secure = Boolean(req.socket.encrypted);
        const lines = [
          secure ? '=== HTTPS работает! ===' : '=== HTTP работает! ===',
          `Группа: ${GROUP}`,
          `Протокол: ${secure ? 'https' : 'http'}`,
          `Шифрование: ${secure ? `да (${req.socket.getProtocol()}, ${req.socket.getCipher().name})` : 'нет (данные передаются открытым текстом)'}`,
        ];
        return sendText(res, 200, lines.join('\n') + '\n');
      }

      // --- статика ---
      if (pathname.startsWith('/static/')) {
        if (!isRead) return methodNotAllowed('GET, HEAD');
        return await serveStatic(req, res, pathname.slice('/static/'.length));
      }

      // --- стриминг ---
      if (pathname === '/stream') {
        if (!isRead) return methodNotAllowed('GET, HEAD');
        return await streamFile(req, res);
      }

      // --- метрики ---
      if (pathname === '/metrics') {
        if (!isRead) return methodNotAllowed('GET, HEAD');
        return sendJson(res, 200, metrics.snapshot({ cache: cache.stats() }));
      }

      // --- данные (кэшируются middleware для GET) ---
      if (pathname === '/api/items') {
        if (req.method === 'GET') {
          return sendJson(res, 200, { items, generatedAt: new Date().toISOString() });
        }
        if (req.method === 'POST') {
          let data;
          try {
            data = JSON.parse((await readBody(req, MAX_BODY)).toString('utf8'));
          } catch (err) {
            if (err instanceof HttpError) throw err;
            throw new HttpError(400, 'Invalid JSON');
          }
          if (!data || typeof data.name !== 'string' || !data.name.trim()) {
            throw new HttpError(400, 'Field "name" is required');
          }
          const item = { id: nextId++, name: data.name.trim() };
          items.push(item);
          return sendJson(res, 201, item);
        }
        return methodNotAllowed('GET, POST');
      }

      // --- демонстрация обработки ошибок в middleware ---
      if (pathname === '/error') {
        throw new Error('Тестовая ошибка в middleware');
      }

      sendText(res, 404, `404 Not Found: ${pathname}`);
    } catch (err) {
      if (err instanceof HttpError) return sendText(res, err.status, `${err.status} ${err.message}`);
      throw err; // неожиданные ошибки уйдут в глобальный обработчик (500)
    }
  };
}

module.exports = { createRouter };
