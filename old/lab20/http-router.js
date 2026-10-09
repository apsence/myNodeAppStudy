// Лабораторная работа № 20 — Задание 4: маршрутизация по request.url и request.method
const http = require('http');

const GROUP = 'ББМО-01-23';
const PORT = Number(process.env.PORT) || 3000;
const MAX_BODY = 1024 * 1024;

const pad = (n) => String(n).padStart(2, '0');
function timestamp(d = new Date()) {
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
    `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  );
}

// ---------- "База данных" студентов ----------
const students = [
  { id: 1, name: 'Иван', group: 'ББМО-01-23' },
  { id: 2, name: 'Мария', group: 'ББМО-02-23' }, // другая группа — чтобы фильтр был заметен
];
let nextId = 3;

// ---------- Вспомогательные функции ----------
function sendJson(res, status, data) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(data));
}
function sendText(res, status, text) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.end(text);
}

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let failed = false;
    req.on('data', (chunk) => {
      if (failed) return;
      size += chunk.length;
      if (size > MAX_BODY) {
        failed = true;
        return reject(new HttpError(413, 'Payload Too Large'));
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (failed) return;
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'));
      } catch {
        reject(new HttpError(400, 'Invalid JSON'));
      }
    });
    req.on('error', reject);
  });
}

// ---------- Компиляция шаблона маршрута в RegExp ----------
// '/users/:userId/posts/:postId' -> /^\/users\/([^/]+)\/posts\/([^/]+)\/?$/ + ['userId','postId']
function compile(pattern) {
  const keys = [];
  const source = pattern
    .split('/')
    .map((segment) => {
      if (segment.startsWith(':')) {
        keys.push(segment.slice(1));
        return '([^/]+)';
      }
      return segment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    })
    .join('/');
  return { regex: new RegExp(`^${source}/?$`), keys };
}

// ---------- Обработчики ----------
const findStudent = (id) => students.find((s) => s.id === Number(id));

const routes = [
  {
    method: 'GET',
    pattern: '/',
    handler: ({ res }) =>
      sendJson(res, 200, {
        group: GROUP,
        routes: routes.map((r) => `${r.method} ${r.pattern}`),
      }),
  },
  // --- параметры пути ---
  { method: 'GET', pattern: '/users/:id', handler: ({ res, params }) => sendJson(res, 200, { id: params.id }) },
  {
    method: 'GET',
    pattern: '/users/:userId/posts/:postId',
    handler: ({ res, params }) => sendJson(res, 200, params),
  },
  // --- query-параметры со значениями по умолчанию ---
  {
    method: 'GET',
    pattern: '/search',
    handler: ({ res, query }) => {
      const q = query.q ?? '';
      const parsed = parseInt(query.limit ?? '10', 10);
      const limit = Number.isNaN(parsed) ? 10 : Math.min(Math.max(parsed, 1), 100);
      const results = students.filter((s) => s.name.toLowerCase().includes(q.toLowerCase())).slice(0, limit);
      sendJson(res, 200, { query: { q, limit }, count: results.length, results });
    },
  },
  // --- REST API студентов ---
  {
    method: 'GET',
    pattern: '/api/students',
    handler: ({ res, query }) => {
      let list = students;
      if (query.group) list = list.filter((s) => s.group === query.group);
      if (query.name) list = list.filter((s) => s.name.toLowerCase().includes(query.name.toLowerCase()));
      sendJson(res, 200, list);
    },
  },
  {
    method: 'GET',
    pattern: '/api/students/:id',
    handler: ({ res, params }) => {
      const student = findStudent(params.id);
      if (!student) return sendJson(res, 404, { error: 'Student not found', id: params.id });
      sendJson(res, 200, student);
    },
  },
  {
    method: 'POST',
    pattern: '/api/students',
    handler: async ({ req, res }) => {
      const data = await readJson(req);
      if (typeof data.name !== 'string' || !data.name.trim()) {
        return sendJson(res, 400, { error: 'Field "name" is required' });
      }
      const student = { id: nextId++, name: data.name.trim(), group: data.group || GROUP };
      students.push(student);
      sendJson(res, 201, student);
    },
  },
  {
    method: 'PUT',
    pattern: '/api/students/:id',
    handler: async ({ req, res, params }) => {
      const student = findStudent(params.id);
      if (!student) return sendJson(res, 404, { error: 'Student not found', id: params.id });
      const data = await readJson(req);
      if (data.name !== undefined) student.name = String(data.name);
      if (data.group !== undefined) student.group = String(data.group);
      sendJson(res, 200, student);
    },
  },
  {
    method: 'DELETE',
    pattern: '/api/students/:id',
    handler: ({ res, params }) => {
      const index = students.findIndex((s) => s.id === Number(params.id));
      if (index === -1) return sendJson(res, 404, { error: 'Student not found', id: params.id });
      const [removed] = students.splice(index, 1);
      sendJson(res, 200, { deleted: true, id: removed.id });
    },
  },
].map((route) => ({ ...route, ...compile(route.pattern) }));

// ---------- Диспетчер ----------
async function dispatch(req, res) {
  // Парсинг URL: путь и query раздельно, значения декодируются автоматически
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = url.pathname;
  const query = Object.fromEntries(url.searchParams);

  const method = req.method === 'HEAD' ? 'GET' : req.method;
  const allowed = new Set();

  for (const route of routes) {
    const match = route.regex.exec(pathname);
    if (!match) continue;
    allowed.add(route.method);
    if (route.method !== method) continue;

    let params;
    try {
      params = Object.fromEntries(route.keys.map((key, i) => [key, decodeURIComponent(match[i + 1])]));
    } catch {
      return sendText(res, 400, '400 Bad Request');
    }
    return route.handler({ req, res, params, query, url });
  }

  if (allowed.size > 0) {
    res.setHeader('Allow', [...allowed].join(', '));
    return sendText(res, 405, '405 Method Not Allowed');
  }
  sendText(res, 404, '404 Not Found');
}

const server = http.createServer(async (req, res) => {
  res.on('finish', () => {
    console.log(`[${timestamp()}] [${GROUP}] ${req.method} ${req.url} ${res.statusCode}`);
  });
  try {
    await dispatch(req, res);
  } catch (err) {
    const status = err.status || 500;
    if (!err.status) console.error(err);
    if (!res.headersSent) sendJson(res, status, { error: err.status ? err.message : 'Internal Server Error' });
  }
});

server.listen(PORT, () => console.log(`REST API запущен на порту ${PORT} (группа ${GROUP})`));
