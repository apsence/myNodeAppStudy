'use strict';

const Koa = require('koa');
const bodyParser = require('koa-bodyparser');

const { UserController } = require('./controllers/userController');
const { AuthController } = require('./controllers/authController');
const { AdminController } = require('./controllers/adminController');
const { SystemController } = require('./controllers/systemController');
const { createUserRouter } = require('./routes/users');
const { createAuthRouter } = require('./routes/auth');
const { createAdminRouter } = require('./routes/admin');
const { createSystemRouter } = require('./routes/system');
const { errorMiddleware } = require('./middleware/error');
const { requestLogger } = require('./middleware/requestLogger');
const { xGroup } = require('./middleware/headers');
const { helmetMiddleware, corsMiddleware, rateLimitMiddleware, sanitizeMiddleware } = require('./middleware/security');
const { createUpload } = require('./middleware/upload');

/**
 * Фабрика приложения: все зависимости передаются снаружи, поэтому в интеграционных тестах
 * можно подставить поддельные сервисы (supertest + createApp).
 *
 * Порядок middleware важен:
 *  1) X-Group, лог запросов, метрики, обработчик ошибок — оборачивают ВСЁ;
 *  2) Swagger UI и служебные маршруты (/health, /ready, /metrics, /uploads) — до helmet и rate limit
 *     (иначе CSP сломает Swagger UI, а лимит заблокирует мониторинг);
 *  3) helmet → CORS → rate limit → разбор тела → санитайзер → API.
 */
function createApp({ config, logger, services, tokens, metrics, isDbUp, uploads, spec, upload = null, swaggerUi = null }) {
  const upl = upload || createUpload({ dir: uploads.dir });

  const userController = new UserController({ service: services.userService });
  const authController = new AuthController({ service: services.authService });
  const adminController = new AdminController({ userService: services.userService });
  const systemController = new SystemController({ isDbUp, metrics, spec, uploads });

  const app = new Koa();
  app.proxy = config.trustProxy;

  app.use(xGroup);
  app.use(requestLogger({ logger }));
  app.use(metrics.middleware());
  app.use(errorMiddleware({ logger }));

  const { koaSwagger } = swaggerUi || require('koa2-swagger-ui');
  app.use(koaSwagger({ routePrefix: '/api-docs', swaggerOptions: { spec } }));
  const system = createSystemRouter(systemController);
  app.use(system.routes());
  app.use(system.allowedMethods());

  app.use(helmetMiddleware());
  app.use(corsMiddleware({ origins: config.corsOrigins }));
  app.use(rateLimitMiddleware(config.rateLimit));
  app.use(bodyParser({ enableTypes: ['json'], jsonLimit: '1mb' })); // 1 МБ — под импорт до 1000 записей
  app.use(sanitizeMiddleware());

  for (const router of [
    createAuthRouter(authController),
    createUserRouter(userController, { tokens, upload: upl }),
    createAdminRouter(adminController, { tokens }),
  ]) {
    app.use(router.routes());
    app.use(router.allowedMethods());
  }
  return app;
}

module.exports = { createApp };
