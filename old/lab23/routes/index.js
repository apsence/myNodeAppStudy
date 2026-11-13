'use strict';

const Router = require('@koa/router');

function createRouter({ studentController, metricsController, database }) {
  const router = new Router();

  router.get('/health', (ctx) => {
    ctx.body = { status: database.isConnected ? 'ok' : 'degraded', mongodb: database.isConnected };
  });
  router.get('/api/metrics', metricsController.get);

  const students = new Router({ prefix: '/api/students' });
  // Статические маршруты ДО /:id, иначе "stats" будет принят за id
  students.get('/stats', studentController.stats);
  students.get('/search', studentController.search);
  students.post('/batch', studentController.batch);
  students.get('/', studentController.list);
  students.post('/', studentController.create);
  students.get('/:id', studentController.getById);
  students.put('/:id', studentController.update);
  students.delete('/:id', studentController.remove);

  router.use(students.routes(), students.allowedMethods());
  return router;
}

module.exports = { createRouter };
