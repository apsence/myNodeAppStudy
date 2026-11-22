'use strict';

/**
 * Задание 4: аутентификация (JWT + refresh), роли, bcrypt, Helmet, CORS, rate limiting.
 * Запуск: npm run task4
 */
const path = require('node:path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const Koa = require('koa');
const bodyParser = require('koa-bodyparser');
const { MongoClient } = require('mongodb');

const { loadConfig } = require('./config');
const { User } = require('./models/user');
const { RefreshToken } = require('./models/refreshToken');
const { UserService } = require('./services/userService');
const { AuthService } = require('./services/authService');
const { UserController } = require('./controllers/userController');
const { AuthController } = require('./controllers/authController');
const { AdminController } = require('./controllers/adminController');
const { createUserRouter } = require('./routes/users');
const { createAuthRouter } = require('./routes/auth');
const { createAdminRouter } = require('./routes/admin');
const { dbMiddleware } = require('./middleware/db');
const { errorMiddleware } = require('./middleware/error');
const { loggerMiddleware } = require('./middleware/logger');
const { helmetMiddleware, corsMiddleware, rateLimitMiddleware, sanitizeMiddleware } = require('./middleware/security');
const { xGroup, GROUP } = require('./middleware/headers');
const { createLogger } = require('./utils/logger');
const { createMailer } = require('./utils/mailer');
const { createHasher } = require('./utils/password');
const { createTokenService } = require('./utils/tokens');

function createApp({ db, config, logger = createLogger(), mailer = createMailer(), hasher = createHasher({ rounds: config.bcryptRounds }) }) {
  User.init(db, { log: logger.model });
  RefreshToken.init(db);
  const tokens = createTokenService({ config });

  const userService = new UserService({ User, mailer, hasher, logger });
  const authService = new AuthService({ User, RefreshToken, tokens, hasher, logger, config });
  const userRouter = createUserRouter(new UserController({ service: userService }), { tokens });
  const authRouter = createAuthRouter(new AuthController({ service: authService }));
  const adminRouter = createAdminRouter(new AdminController({ userService, User }), { tokens });

  const app = new Koa();
  app.proxy = config.trustProxy;
  app.use(xGroup);
  app.use(loggerMiddleware({ logger }));
  app.use(errorMiddleware({ logger }));
  app.use(helmetMiddleware());
  app.use(corsMiddleware({ origins: config.corsOrigins }));
  app.use(rateLimitMiddleware(config.rateLimit));
  app.use(bodyParser({ enableTypes: ['json'], jsonLimit: '100kb' }));
  app.use(sanitizeMiddleware());
  app.use(dbMiddleware(db));
  for (const r of [authRouter, userRouter, adminRouter]) {
    app.use(r.routes());
    app.use(r.allowedMethods());
  }
  return app;
}

async function main() {
  const logger = createLogger();
  const config = loadConfig();
  const client = new MongoClient(config.mongoUri, { serverSelectionTimeoutMS: 5000 });
  await client.connect();
  const db = client.db(config.dbName);
  logger.info('MongoDB подключена');

  const app = createApp({ db, config, logger });
  await User.ensureIndexes();
  await RefreshToken.ensureIndexes();
  logger.info('Индексы созданы');

  const server = app.listen(config.port, () => {
    logger.info(`Koa-сервер на порту ${config.port}`);
    logger.info(`Группа: ${GROUP}`);
    logger.info(`Rate limit: ${config.rateLimit.limit} запросов за ${config.rateLimit.windowMs / 1000} с на IP`);
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
