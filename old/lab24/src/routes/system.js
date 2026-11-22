'use strict';

const Router = require('@koa/router');

/** Служебные маршруты: health, ready, metrics, спецификация OpenAPI, раздача аватаров. */
function createSystemRouter(controller) {
  const router = new Router();
  router.get('/health', controller.health);
  router.get('/ready', controller.ready);
  router.get('/metrics', controller.metricsText);
  router.get('/api-docs.json', controller.openapi);
  router.get('/uploads/:file', controller.upload);
  return router;
}

module.exports = { createSystemRouter };
