'use strict';

const Router = require('@koa/router');
const { validationMiddleware } = require('../middleware/validation');
const { authMiddleware, requireRole } = require('../middleware/auth');
const { listQuerySchema } = require('../validators/querySchemas');
const { roleSchema } = require('../validators/authSchemas');

function createAdminRouter(controller, { tokens }) {
  const router = new Router({ prefix: '/api/admin' });
  router.use(authMiddleware({ tokens }), requireRole('admin'));
  router.get('/users', validationMiddleware(listQuerySchema, 'query'), controller.listUsers);
  router.put('/users/:id/role', validationMiddleware(roleSchema), controller.setRole);
  return router;
}

module.exports = { createAdminRouter };
