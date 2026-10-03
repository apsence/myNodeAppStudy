// Лабораторная работа № 20 — Задание 2: чтение и установка HTTP-заголовков
const http = require('http');

const GROUP = 'ББМО-01-23';
const PORT = Number(process.env.PORT) || 3000;

// Node запрещает символы вне Latin-1 в значениях заголовков, поэтому кириллицу
// передаём как "сырые" UTF-8 байты (так делают и браузеры/curl при отображении).
const encodeHeader = (s) => Buffer.from(String(s), 'utf8').toString('latin1');
const decodeHeader = (s) => Buffer.from(String(s), 'latin1').toString('utf8');

// Общие заголовки для всех ответов
function applyCommonHeaders(res) {
  res.setHeader('X-Powered-By', 'Node.js');
  res.setHeader('X-Group', encodeHeader(GROUP));
  res.setHeader('Cache-Control', 'no-cache');
}

function sendJson(res, status, data) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(data, null, 2));
}

function sendHtml(res, status, html) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.end(html);
}

function handle(req, res) {
  applyCommonHeaders(res);

  const [pathname, queryString = ''] = req.url.split('?');
  const isRead = req.method === 'GET' || req.method === 'HEAD'; // curl -I шлёт HEAD

  if (!isRead) {
    res.setHeader('Allow', 'GET, HEAD');
    return sendJson(res, 405, { error: 'Method Not Allowed' });
  }

  // ---------- GET /headers — все заголовки запроса ----------
  if (pathname === '/headers') {
    // request.headers: все ключи автоматически в нижнем регистре
    const headers = {};
    for (const [name, value] of Object.entries(req.headers)) {
      headers[name] = Array.isArray(value) ? value.map(decodeHeader) : decodeHeader(value);
    }
    return sendJson(res, 200, {
      headers,
      special: {
        'user-agent': req.headers['user-agent'] || null,
        accept: req.headers['accept'] || null,
        host: req.headers['host'] || null,
        'content-type': req.headers['content-type'] || null,
      },
      method: req.method,
      url: req.url,
      httpVersion: req.httpVersion,
    });
  }

  // ---------- GET /headers/set — установка/проверка/удаление заголовков ответа ----------
  if (pathname === '/headers/set') {
    res.setHeader('Content-Type', 'text/html; charset=utf-8'); // setHeader — установить
    res.setHeader('X-Custom-Header', 'lab20');
    res.setHeader('X-Temp', encodeHeader('временный заголовок')); // кириллицу — только через encodeHeader

    const tempBefore = res.hasHeader('X-Temp');            // hasHeader — существует ли
    const customValue = res.getHeader('X-Custom-Header');  // getHeader — прочитать значение
    res.removeHeader('X-Temp');                            // removeHeader — удалить до отправки
    const tempAfter = res.hasHeader('X-Temp');

    return sendHtml(
      res,
      200,
      `<!DOCTYPE html><html lang="ru"><head><meta charset="utf-8"><title>Headers</title></head><body>
<h1>Заголовки ответа установлены</h1>
<ul>
<li>getHeader("X-Custom-Header") = ${customValue}</li>
<li>hasHeader("X-Temp") до removeHeader: ${tempBefore}</li>
<li>hasHeader("X-Temp") после removeHeader: ${tempAfter}</li>
<li>getHeaderNames(): ${res.getHeaderNames().join(', ')}</li>
</ul>
</body></html>`
    );
  }

  // ---------- GET /headers/check — проверка наличия заголовков ----------
  if (pathname === '/headers/check') {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    const result = {
      hasContentType: res.hasHeader('Content-Type'),
      hasXGroup: res.hasHeader('X-Group'),
      hasUnknown: res.hasHeader('X-Unknown'),
    };
    // Дополнительно: /headers/check?name=x-powered-by (имена регистронезависимы)
    const name = new URLSearchParams(queryString).get('name');
    if (name) result[`has(${name})`] = res.hasHeader(name);
    return sendJson(res, 200, result);
  }

  sendJson(res, 404, { error: 'Not Found', path: pathname });
}

const server = http.createServer((req, res) => {
  try {
    handle(req, res);
  } catch (err) {
    console.error(err);
    if (!res.headersSent) sendJson(res, 500, { error: 'Internal Server Error' });
  }
});

server.listen(PORT, () => console.log(`Сервер заголовков запущен на порту ${PORT}`));
