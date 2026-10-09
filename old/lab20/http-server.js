// Лабораторная работа № 20 — Задание 1: простой HTTP-сервер на чистом модуле http
const http = require('http');

const GROUP = 'ББМО-01-23';
const STUDENT = process.env.STUDENT_NAME || '[Ваше ФИО]'; // впишите ФИО или задайте STUDENT_NAME
const PORT = Number(process.env.PORT) || 3000;

const pad = (n) => String(n).padStart(2, '0');
function timestamp(d = new Date()) {
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
    `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  );
}

// Экранирование пользовательских данных в HTML (защита от XSS)
const escapeHtml = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function page(title, bodyHtml) {
  return `<!DOCTYPE html>
<html lang="ru">
<head><meta charset="utf-8"><title>${escapeHtml(title)}</title></head>
<body>
${bodyHtml}
</body>
</html>`;
}

function sendHtml(res, status, html, extraHeaders = {}) {
  res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8', ...extraHeaders });
  res.end(html);
}

const server = http.createServer((req, res) => {
  // Логирование: метод, URL, статус, время — после отправки ответа
  res.on('finish', () => {
    console.log(`[${timestamp()}] ${req.method} ${req.url} ${res.statusCode}`);
  });

  const pathname = req.url.split('?')[0];
  const isRead = req.method === 'GET' || req.method === 'HEAD';

  if (pathname === '/' || pathname === '/about') {
    if (!isRead) {
      return sendHtml(res, 405, page('405', '<h1>405 Method Not Allowed</h1>'), { Allow: 'GET, HEAD' });
    }
    if (pathname === '/') {
      return sendHtml(
        res,
        200,
        page(
          'Лабораторная работа №20',
          `<h1>=== Лабораторная работа №20 ===</h1>
<p>Группа: ${GROUP}</p>
<p>Метод: ${escapeHtml(req.method)}</p>
<p>URL: ${escapeHtml(req.url)}</p>`
        )
      );
    }
    return sendHtml(
      res,
      200,
      page('О студенте', `<h1>=== О студенте ===</h1>\n<p>Группа: ${GROUP}</p>\n<p>Студент: ${escapeHtml(STUDENT)}</p>`)
    );
  }

  // Неизвестный путь -> 404 с HTML-страницей
  sendHtml(
    res,
    404,
    page('404 Not Found', `<h1>=== 404 Not Found ===</h1>\n<p>Путь ${escapeHtml(pathname)} не найден</p>`)
  );
});

server.listen(PORT, () => {
  console.log(`Сервер запущен на порту ${PORT}`);
});
