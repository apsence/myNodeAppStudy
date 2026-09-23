const Koa = require('koa');
const Router = require('@koa/router');
const bodyParser = require('koa-bodyparser');

const app = new Koa();
const router = new Router();

// Вспомогательная функция форматирования даты
function formatDate(date) {
  const pad = (n) => String(n).padStart(2, '0');
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hours = pad(date.getHours());
  const mins = pad(date.getMinutes());
  const secs = pad(date.getSeconds());
  return `${year}-${month}-${day} ${hours}:${mins}:${secs}`;
}

app.use(async (ctx, next) => {
  try {
    await next();
  } catch (err) {
    const status = err.status || err.statusCode || 500;
    ctx.status = status;
    ctx.body = {
      error: err.message || 'Внутренняя ошибка сервера',
      status: status
    };
  }
});

app.use(async (ctx, next) => {
  const start = Date.now();
  const startTimeFormatted = formatDate(new Date(start));
  
  await next();
  
  const duration = Date.now() - start;
  console.log(`[${startTimeFormatted}] ${ctx.method} ${ctx.url} - ${duration}ms`);
});

app.use(bodyParser());

const authMiddleware = async (ctx, next) => {
  const authHeader = ctx.headers['authorization'];
  if (!authHeader) {
    ctx.throw(401, 'Заголовок Authorization отсутствует');
  }
  await next();
};

let users = [
  { id: 1, name: 'Иванов Иван', group: 'ББМО-01-23' },
  { id: 2, name: 'Петров Петр', group: 'ББМО-01-23' }
];
let nextUserId = 3;

router.get('/', async (ctx) => {
  const now = formatDate(new Date());
  
  ctx.type = 'text/html';
  ctx.body = `
    <!DOCTYPE html>
    <html lang="ru">
    <head>
      <meta charset="UTF-8">
      <title>Лабораторная работа №15</title>
      <style>
        body { font-family: Arial, sans-serif; margin: 40px; background-color: #f4f4f9; color: #333; }
        .card { background: white; padding: 25px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); max-width: 500px; }
        h1 { color: #2c3e50; }
        p { line-height: 1.6; }
      </style>
    </head>
    <body>
      <div class="card">
        <h1>Лабораторная работа №15</h1>
        <p><strong>Группа:</strong> ББМО-01-23</p>
        <p><strong>Текущие дата и время:</strong> ${now}</p>
        <p>Приветствуем вас на учебном сервере Koa.js!</p>
      </div>
    </body>
    </html>
  `;
});


// GET 
router.get('/api/users', async (ctx) => {
  ctx.body = users;
});

// POST 
router.post('/api/users', async (ctx) => {
  const { name, group } = ctx.request.body || {};

  if (!name || !group || typeof name !== 'string' || typeof group !== 'string') {
    ctx.throw(400, 'Невалидные данные: поля name и group обязательны и должны быть строками');
  }

  const newUser = {
    id: nextUserId++,
    name: name.trim(),
    group: group.trim()
  };

  users.push(newUser);
  ctx.status = 201;
  ctx.body = newUser;
});

// PUT
router.put('/api/users/:id', async (ctx) => {
  const userId = parseInt(ctx.params.id, 10);
  const user = users.find(u => u.id === userId);

  if (!user) {
    ctx.throw(404, 'Пользователь не найден');
  }

  const { name, group } = ctx.request.body || {};

  if (!name || !group || typeof name !== 'string' || typeof group !== 'string') {
    ctx.throw(400, 'Невалидные данные: поля name и group обязательны');
  }

  user.name = name.trim();
  user.group = group.trim();

  ctx.body = user;
});

// DELETE
router.delete('/api/users/:id', async (ctx) => {
  const userId = parseInt(ctx.params.id, 10);
  const index = users.findIndex(u => u.id === userId);

  if (index === -1) {
    ctx.throw(404, 'Пользователь не найден');
  }

  users.splice(index, 1);
  ctx.body = { message: 'Пользователь успешно удален' };
});


// Защищенный маршрут (требует авторизации)
router.get('/protected', authMiddleware, async (ctx) => {
  ctx.body = { message: 'Доступ разрешен: вы успешно авторизовались!' };
});

// Маршрут с выборочным выбросом ошибки
router.get('/error', async (ctx) => {
  throw new Error('Тестовая ошибка сервера');
});

// Регистрация маршрутов в приложении
app.use(router.routes());
app.use(router.allowedMethods());

// Запуск сервера
const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Сервер запущен и доступен по адресу: http://localhost:${PORT}`);
});