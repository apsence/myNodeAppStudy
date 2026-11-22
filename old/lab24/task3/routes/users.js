'use strict';

const Router = require('@koa/router');
const { validationMiddleware } = require('../middleware/validation');
const { createUserSchema, updateUserSchema } = require('../validators/userSchemas');
const { listQuerySchema, searchQuerySchema, exportQuerySchema } = require('../validators/querySchemas');

function createUserRouter(controller) {
  const router = new Router({ prefix: '/api/users' });
  // статические маршруты — ДО /:id, иначе "stats" будет принят за идентификатор
  router.get('/stats', controller.stats);
  router.get('/export', validationMiddleware(exportQuerySchema, 'query'), controller.export);
  router.get('/search', validationMiddleware(searchQuerySchema, 'query'), controller.search);
  router.get('/', validationMiddleware(listQuerySchema, 'query'), controller.list);
  router.get('/:id', controller.getOne);
  router.post('/', validationMiddleware(createUserSchema), controller.create);
  router.put('/:id', validationMiddleware(updateUserSchema), controller.update);
  router.delete('/:id', controller.remove);
  return router;
}

module.exports = { createUserRouter };
