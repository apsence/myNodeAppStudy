// Лабораторная работа № 20 — Задание 3: чтение тела запроса (POST)
const http = require('http');

const GROUP = 'ББМО-01-23';
const PORT = Number(process.env.PORT) || 3000;
const MAX_BODY = 1024 * 1024; // 1 МБ

const pad = (n) => String(n).padStart(2, '0');
function timestamp(d = new Date()) {
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
    `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  );
}

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// Тело запроса — Readable Stream: собираем chunks вручную
function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const declared = Number(req.headers['content-length']);
    if (declared > limit) {
      // Размер известен заранее — отвечаем сразу, остаток тела просто вычитываем и выбрасываем
      req.bodySize = declared;
      req.resume();
      return reject(new HttpError(413, 'Payload Too Large'));
    }

    const chunks = [];
    let size = 0;
    let settled = false;

    req.on('data', (chunk) => {
      if (settled) return; // после отказа продолжаем лишь выбрасывать данные
      size += chunk.length;
      req.bodySize = size;
      if (size > limit) {
        // Защита от переполнения: освобождаем память и отказываем
        settled = true;
        chunks.length = 0;
        return reject(new HttpError(413, 'Payload Too Large'));
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (settled) return;
      settled = true;
      req.bodySize = size;
      resolve(Buffer.concat(chunks));
    });
    req.on('error', (err) => {
      if (settled) return;
      settled = true;
      reject(err);
    });
  });
}

const contentTypeOf = (req) => (req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();

function parseForm(text) {
  const out = {};
  for (const [key, value] of new URLSearchParams(text)) {
    if (Object.prototype.hasOwnProperty.call(out, key)) out[key] = [].concat(out[key], value);
    else out[key] = value;
  }
  return out;
}

function send(res, status, body, type) {
  res.statusCode = status;
  res.setHeader('Content-Type', type);
  res.end(body);
}

// ---------- POST /echo ----------
async function handleEcho(req, res) {
  const body = await readBody(req, MAX_BODY);
  const type = contentTypeOf(req);

  if (type === 'application/json') {
    let data;
    try {
      data = JSON.parse(body.toString('utf8'));
    } catch {
      throw new HttpError(400, 'Invalid JSON');
    }
    // Эхо-сервер для группы: добавляем поле group
    if (data && typeof data === 'object' && !Array.isArray(data)) data.group = GROUP;
    return send(res, 200, JSON.stringify(data, null, 2), 'application/json; charset=utf-8');
  }

  // text/plain, application/octet-stream и всё остальное — возвращаем как есть
  res.statusCode = 200;
  res.setHeader('Content-Type', req.headers['content-type'] || 'application/octet-stream');
  res.end(body);
}

// ---------- POST /form ----------
async function handleForm(req, res) {
  if (contentTypeOf(req) !== 'application/x-www-form-urlencoded') {
    req.resume();
    throw new HttpError(415, 'Unsupported Media Type (нужен application/x-www-form-urlencoded)');
  }
  const body = await readBody(req, MAX_BODY);
  const data = parseForm(body.toString('utf8'));
  send(res, 200, JSON.stringify(data, null, 2), 'application/json; charset=utf-8');
}

const server = http.createServer(async (req, res) => {
  const pathname = req.url.split('?')[0];

  // Лог с размером тела
  res.on('finish', () => {
    const size = req.bodySize !== undefined ? ` | тело: ${req.bodySize} байт` : '';
    console.log(`[${timestamp()}] [${GROUP}] ${req.method} ${req.url} ${res.statusCode}${size}`);
  });

  try {
    if (pathname === '/echo' || pathname === '/form') {
      if (req.method !== 'POST') {
        res.setHeader('Allow', 'POST');
        req.resume();
        throw new HttpError(405, 'Method Not Allowed');
      }
      return await (pathname === '/echo' ? handleEcho(req, res) : handleForm(req, res));
    }
    if (pathname === '/' && req.method === 'GET') {
      return send(res, 200, `POST /echo — эхо тела\nPOST /form — разбор form-data\nЛимит тела: ${MAX_BODY} байт\n`, 'text/plain; charset=utf-8');
    }
    req.resume();
    throw new HttpError(404, 'Not Found');
  } catch (err) {
    const status = err.status || 500;
    if (!err.status) console.error(err);
    if (!res.headersSent) send(res, status, `${status} ${err.status ? err.message : 'Internal Server Error'}`, 'text/plain; charset=utf-8');
  }
});

server.listen(PORT, () => console.log(`Сервер (чтение тела) запущен на порту ${PORT}, лимит тела: 1 МБ`));
