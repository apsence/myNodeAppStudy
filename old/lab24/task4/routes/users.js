'use strict';

const Router = require('@koa/router');
const { validationMiddleware } = require('../middleware/validation');
const { authMiddleware, requireRole, requireOwnerOr } = require('../middleware/auth');
const { createUserSchema, updateUserSchema } = require('../validators/userSchemas');
const { listQuerySchema, searchQuerySchema, exportQuerySchema } = require('../validators/querySchemas');

/**
 * Публичные: GET /api/users, /search, /stats, /:id.
 * Защищённые: POST (любой вошедший), PUT (владелец/админ/модератор), DELETE (владелец/админ),
 * GET /export (админ/модератор — в выгрузке есть email).
 */
function createUserRouter(controller, { tokens }) {
  const router = new Router({ prefix: '/api/users' });
  const auth = authMiddleware({ tokens });

  router.get('/stats', controller.stats);
  router.get('/export', auth, requireRole('admin', 'moderator'), validationMiddleware(exportQuerySchema, 'query'), controller.export);
  router.get('/search', validationMiddleware(searchQuerySchema, 'query'), controller.search);
  router.get('/', validationMiddleware(listQuerySchema, 'query'), controller.list);
  router.get('/:id', controller.getOne);
  router.post('/', auth, validationMiddleware(createUserSchema), controller.create);
  router.put('/:id', auth, requireOwnerOr('modify'), validationMiddleware(updateUserSchema), controller.update);
  router.delete('/:id', auth, requireOwnerOr('delete'), controller.remove);
  return router;
}

module.exports = { createUserRouter };
