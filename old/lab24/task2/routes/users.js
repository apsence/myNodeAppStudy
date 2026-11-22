'use strict';

const Router = require('@koa/router');
const { validationMiddleware } = require('../middleware/validation');
const { createUserSchema, updateUserSchema } = require('../validators/userSchemas');

function createUserRouter(controller) {
  const router = new Router({ prefix: '/api/users' });
  router.get('/', controller.list);
  router.get('/:id', controller.getOne);
  router.post('/', validationMiddleware(createUserSchema), controller.create);
  router.put('/:id', validationMiddleware(updateUserSchema), controller.update);
  router.delete('/:id', controller.remove);
  return router;
}

module.exports = { createUserRouter };
