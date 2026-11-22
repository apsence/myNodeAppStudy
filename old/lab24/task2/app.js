'use strict';

/**
 * Задание 2: архитектура MVC — модели (БД), сервисы (бизнес-логика), контроллеры (HTTP).
 * Запуск: npm run task2
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
  await db.collection('users').createIndex({ email: 1 }, { unique: true, name: 'email_unique' });
  logger.info('MongoDB подключена');

  const port = Number(process.env.PORT) || 3000;
  const server = createApp({ db, logger }).listen(port, () => {
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
