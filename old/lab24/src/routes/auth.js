'use strict';

const Router = require('@koa/router');
const { validationMiddleware } = require('../middleware/validation');
const { registerSchema, loginSchema, refreshSchema } = require('../validators/authSchemas');

/** Публичные маршруты /api/auth/*. */
function createAuthRouter(controller) {
  const router = new Router({ prefix: '/api/auth' });
  router.post('/register', validationMiddleware(registerSchema), controller.register);
  router.post('/login', validationMiddleware(loginSchema), controller.login);
  router.post('/refresh', validationMiddleware(refreshSchema), controller.refresh);
  router.post('/logout', validationMiddleware(refreshSchema), controller.logout);
  return router;
}

module.exports = { createAuthRouter };
