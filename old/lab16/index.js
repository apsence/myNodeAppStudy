const express = require('express');
const compression = require('compression');

const app = express();
const PORT = 3000;

// ==========================================
// Парсинг JSON
// ==========================================
app.use(express.json());

// ==========================================
// Middleware сжатия (Compression)
// ==========================================
app.use(compression());

// ==========================================
// Middleware логирования (Logger)
// ==========================================
app.use((req, res, next) => {
  const start = Date.now();

  const formatDate = (d) => {
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  };

  res.on('finish', () => {
    const duration = Date.now() - start;
    const timestamp = formatDate(new Date());
    console.log(`[${timestamp}] ${req.method} ${req.originalUrl} ${res.statusCode} - ${duration}ms`);
  });

  next();
});

// ==========================================
// Middleware ограничения скорости (Rate Limiter)
// 100 запросов в минуту с одного IP
// ==========================================
const rateLimitMap = new Map();
const WINDOW_MS = 60 * 1000; // 1 минута
const MAX_REQUESTS = 100;

app.use((req, res, next) => {
  const ip = req.ip || req.socket.remoteAddress || '127.0.0.1';
  const now = Date.now();

  let record = rateLimitMap.get(ip);

  if (!record || now > record.resetTime) {
    record = {
      count: 1,
      resetTime: now + WINDOW_MS,
    };
  } else {
    record.count++;
  }

  rateLimitMap.set(ip, record);

  const remaining = Math.max(0, MAX_REQUESTS - record.count);
  const resetInSeconds = Math.ceil((record.resetTime - now) / 1000);

  // Заголовки ответа
  res.setHeader('X-RateLimit-Limit', MAX_REQUESTS);
  res.setHeader('X-RateLimit-Remaining', remaining);
  res.setHeader('X-RateLimit-Reset', resetInSeconds);

  if (record.count > MAX_REQUESTS) {
    return res.status(429).json({
      error: 'Слишком много запросов. Попробуйте позже.',
      status: 429
    });
  }

  next();
});

// ==========================================
// HTML-страницы
// ==========================================

// Главная страница /
app.get('/', (req, res) => {
  const now = new Date().toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' });
  const html = `
    <!DOCTYPE html>
    <html lang="ru">
    <head>
      <meta charset="UTF-8">
      <title>Лабораторная работа №16</title>
      <style>
        body { font-family: system-ui, -apple-system, sans-serif; margin: 40px; background: #f8fafc; color: #1e293b; }
        .card { background: #fff; border: 1px solid #e2e8f0; padding: 30px; border-radius: 12px; max-width: 650px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1); }
        h1 { color: #0f172a; margin-top: 0; }
        ul { line-height: 1.8; }
        a { color: #2563eb; text-decoration: none; }
        a:hover { text-decoration: underline; }
      </style>
    </head>
    <body>
      <div class="card">
        <h1>Лабораторная работа №16</h1>
        <p><strong>Группа:</strong> ББМО-01-23</p>
        <p><strong>Текущая дата и время:</strong> ${now}</p>
        <p>Добро пожаловать на сервер лабораторной работы!</p>
        <h3>Доступные маршруты:</h3>
        <ul>
          <li><a href="/">/</a> — Главная страница</li>
          <li><a href="/about">/about</a> — О разработчике</li>
          <li><a href="/contacts">/contacts</a> — Контактная информация</li>
          <li><a href="/api/books">/api/books</a> — REST API всех книг</li>
          <li><a href="/api/books/search?author=Толстой">/api/books/search?author=Толстой</a> — Поиск по автору</li>
          <li><a href="/error">/error</a> — Тест синхронной ошибки</li>
          <li><a href="/async-error">/async-error</a> — Тест асинхронной ошибки</li>
        </ul>
      </div>
    </body>
    </html>
  `;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(html);
});

// Страница /about
app.get('/about', (req, res) => {
  const html = `
    <!DOCTYPE html>
    <html lang="ru">
    <head>
      <meta charset="UTF-8">
      <title>О разработчике</title>
      <style>
        body { font-family: system-ui, -apple-system, sans-serif; margin: 40px; background: #f8fafc; color: #1e293b; }
        .card { background: #fff; border: 1px solid #e2e8f0; padding: 30px; border-radius: 12px; max-width: 600px; }
        a { color: #2563eb; text-decoration: none; }
      </style>
    </head>
    <body>
      <div class="card">
        <h1>Информация о разработчике</h1>
        <p><strong>Студент группы:</strong> ББМО-01-23</p>
        <p><strong>Проект:</strong> Веб-сервер на Express.js с поддержкой REST API и кастомных Middleware.</p>
        <a href="/">← На главную</a>
      </div>
    </body>
    </html>
  `;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(html);
});

// Страница /contacts
app.get('/contacts', (req, res) => {
  const html = `
    <!DOCTYPE html>
    <html lang="ru">
    <head>
      <meta charset="UTF-8">
      <title>Контакты</title>
      <style>
        body { font-family: system-ui, -apple-system, sans-serif; margin: 40px; background: #f8fafc; color: #1e293b; }
        .card { background: #fff; border: 1px solid #e2e8f0; padding: 30px; border-radius: 12px; max-width: 600px; }
        a { color: #2563eb; text-decoration: none; }
      </style>
    </head>
    <body>
      <div class="card">
        <h1>Контактная информация</h1>
        <p><strong>Email:</strong> student@university.edu</p>
        <p><strong>Учебная группа:</strong> ББМО-01-23</p>
        <a href="/">← На главную</a>
      </div>
    </body>
    </html>
  `;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(html);
});

// ==========================================
// REST API Книг
// ==========================================

let books = [
  { id: 1, title: 'Война и мир', author: 'Толстой', year: 1869 },
  { id: 2, title: 'Преступление и наказание', author: 'Достоевский', year: 1866 },
  { id: 3, title: 'Анна Каренина', author: 'Толстой', year: 1877 }
];
let nextBookId = 4;

// GET /api/books/search — поиск книг по автору
app.get('/api/books/search', (req, res, next) => {
  const { author } = req.query;

  if (!author) {
    const error = new Error('Необходимо указать параметр запроса "author"');
    error.status = 400;
    return next(error);
  }

  const result = books.filter(b => b.author.toLowerCase().includes(author.toLowerCase()));
  res.json(result);
});

// GET /api/books — получение всех книг
app.get('/api/books', (req, res) => {
  res.json(books);
});

// GET /api/books/:id — получение конкретной книги по ID
app.get('/api/books/:id', (req, res, next) => {
  const id = parseInt(req.params.id, 10);
  const book = books.find(b => b.id === id);

  if (!book) {
    const error = new Error('Книга не найдена');
    error.status = 404;
    return next(error);
  }

  res.json(book);
});

// POST /api/books — добавление новой книги
app.post('/api/books', (req, res, next) => {
  const { title, author, year } = req.body;

  if (!title || !author || !year || typeof year !== 'number') {
    const error = new Error('Невалидные данные. Поля title (строка), author (строка) и year (число) обязательны');
    error.status = 400;
    return next(error);
  }

  const newBook = { id: nextBookId++, title, author, year };
  books.push(newBook);

  res.status(201).json(newBook);
});

// PUT /api/books/:id — обновление книги
app.put('/api/books/:id', (req, res, next) => {
  const id = parseInt(req.params.id, 10);
  const bookIndex = books.findIndex(b => b.id === id);

  if (bookIndex === -1) {
    const error = new Error('Книга не найдена');
    error.status = 404;
    return next(error);
  }

  const { title, author, year } = req.body;

  if (!title && !author && !year) {
    const error = new Error('Невалидные данные. Передайте хотя бы одно поле для обновления');
    error.status = 400;
    return next(error);
  }

  if (year && typeof year !== 'number') {
    const error = new Error('Невалидные данные. Поле year должно быть числом');
    error.status = 400;
    return next(error);
  }

  if (title) books[bookIndex].title = title;
  if (author) books[bookIndex].author = author;
  if (year) books[bookIndex].year = year;

  res.json(books[bookIndex]);
});

// DELETE /api/books/:id — удаление книги
app.delete('/api/books/:id', (req, res, next) => {
  const id = parseInt(req.params.id, 10);
  const bookIndex = books.findIndex(b => b.id === id);

  if (bookIndex === -1) {
    const error = new Error('Книга не найдена');
    error.status = 404;
    return next(error);
  }

  books.splice(bookIndex, 1);
  res.json({ message: 'Книга успешно удалена' });
});

// ==========================================
// Маршруты для тестирования ошибок
// ==========================================

// Синхронная ошибка
app.get('/error', (req, res, next) => {
  throw new Error('Тестовая синхронная ошибка');
});

// Асинхронная ошибка
app.get('/async-error', async (req, res, next) => {
  try {
    await new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Тестовая асинхронная ошибка')), 100);
    });
  } catch (err) {
    next(err);
  }
});

// Обработка несуществующих маршрутов (404)
app.use((req, res, next) => {
  const error = new Error('Маршрут не найден');
  error.status = 404;
  next(error);
});

// ==========================================
// Централизованная обработка ошибок
// ==========================================
app.use((err, req, res, next) => {
  const status = err.status || 500;
  const message = err.message || 'Внутренняя ошибка сервера';

  res.status(status).json({
    error: message,
    status: status
  });
});

app.listen(PORT, () => {
  console.log(`Сервер запущен на http://localhost:${PORT}`);
});