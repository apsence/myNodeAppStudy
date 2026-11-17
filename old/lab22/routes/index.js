'use strict';

const Router = require('@koa/router');

function createRouter({ studentController: s, groupController: g, systemController: sys }) {
  const router = new Router();

  router.get('/health', sys.health);
  router.get('/api/cache/stats', sys.cacheStats);
  router.get('/api/metrics', sys.metricsInfo);

  const students = new Router({ prefix: '/api/students' });
  // Статические маршруты — ДО /:id, иначе "stats" будет принят за id
  students.get('/stats', s.stats);
  students.post('/batch', s.batch);
  students.get('/', s.list);
  students.post('/', s.create);
  students.get('/:id', s.getById);
  students.put('/:id', s.update);
  students.delete('/:id', s.remove);

  const groups = new Router({ prefix: '/api/groups' });
  groups.get('/', g.list);
  groups.post('/', g.create);
  groups.get('/:id/students', g.students);

  for (const r of [students, groups]) router.use(r.routes(), r.allowedMethods());
  return router;
}

module.exports = { createRouter };
