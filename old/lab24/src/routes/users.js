'use strict';

const Router = require('@koa/router');
const { validationMiddleware } = require('../middleware/validation');
const { authMiddleware, requireRole, requireOwnerOr } = require('../middleware/auth');
const { createUserSchema, updateUserSchema } = require('../validators/userSchemas');
const { listQuerySchema, searchQuerySchema, exportQuerySchema } = require('../validators/querySchemas');

/**
 * Публичные: GET /api/users, /search, /stats, /:id.
 * Защищённые: POST (любой вошедший), PUT (владелец/admin/moderator), DELETE (владелец/admin),
 * GET /export (admin/moderator), POST /import (admin), POST /:id/avatar (владелец/admin/moderator).
 */
function createUserRouter(controller, { tokens, upload }) {
  const router = new Router({ prefix: '/api/users' });
  const auth = authMiddleware({ tokens });

  router.get('/stats', controller.stats);
  router.get('/export', auth, requireRole('admin', 'moderator'), validationMiddleware(exportQuerySchema, 'query'), controller.export);
  router.get('/search', validationMiddleware(searchQuerySchema, 'query'), controller.search);
  router.post('/import', auth, requireRole('admin'), controller.import);
  router.get('/', validationMiddleware(listQuerySchema, 'query'), controller.list);
  router.get('/:id', controller.getOne);
  router.post('/', auth, validationMiddleware(createUserSchema), controller.create);
  router.put('/:id', auth, requireOwnerOr('modify'), validationMiddleware(updateUserSchema), controller.update);
  router.delete('/:id', auth, requireOwnerOr('delete'), controller.remove);
  router.post('/:id/avatar', auth, requireOwnerOr('modify'), upload.single('avatar'), controller.avatar);
  return router;
}

module.exports = { createUserRouter };
