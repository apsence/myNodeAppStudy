'use strict';

/**
 * Задание 3: пагинация, фильтрация, сортировка, поиск, статистика и экспорт CSV.
 * Запуск: npm run task3
 */
const path = require('node:path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const Koa = require('koa');
const bodyParser = require('koa-bodyparser');
const { MongoClient } = require('mongodb');

const { User } = require('./models/user');
const { UserService } = require('./services/userService');
const { UserController } = require('./controllers/userController');
const { createUserRouter } = require('./routes/users');
const { dbMiddleware } = require('./middleware/db');
const { errorMiddleware } = require('./middleware/error');
const { loggerMiddleware } = require('./middleware/logger');
const { xGroup, GROUP } = require('./middleware/headers');
const { createLogger } = require('./utils/logger');
const { createMailer } = require('./utils/mailer');
const { createHasher } = require('./utils/password');

/** Сборка приложения: зависимости можно подменять (в тестах — на поддельные). */
function createApp({ db, logger = createLogger(), mailer = createMailer(), hasher = createHasher() }) {
  User.init(db, { log: logger.model });
  const service = new UserService({ User, mailer, hasher, logger });
  const controller = new UserController({ service });
  const router = createUserRouter(controller);

  const app = new Koa();
  app.use(xGroup);
  app.use(loggerMiddleware({ logger }));
  app.use(errorMiddleware({ logger }));
  app.use(bodyParser({ enableTypes: ['json', 'form'], jsonLimit: '100kb' }));
  app.use(dbMiddleware(db));
  app.use(router.routes());
  app.use(router.allowedMethods());
  return app;
}

async function main() {
  const logger = createLogger();
  const client = new MongoClient(process.env.MONGODB_URI || 'mongodb://localhost:27017/bbmo_01_23', { serverSelectionTimeoutMS: 5000 });
  await client.connect();
  const db = client.db(process.env.DB_NAME || 'bbmo_01_23');
  logger.info('MongoDB подключена');

  const app = createApp({ db, logger });
  await User.ensureIndexes(); // уникальный email, текстовый индекс, индекс по группе и курсу
  logger.info('Индексы созданы: email_unique, users_text, group_course');

  const port = Number(process.env.PORT) || 3000;
  const server = app.listen(port, () => {
    logger.info(`Koa-сервер на порту ${port}`);
    logger.info(`Группа: ${GROUP}`);
  });
  const stop = async () => {
    server.close();
    await client.close();
    process.exit(0);
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}

if (require.main === module) {
  main().catch((err) => {
    console.error(`[ERROR] ${err.message}`);
    process.exitCode = 1;
  });
}

module.exports = { createApp };
