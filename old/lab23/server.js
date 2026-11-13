'use strict';

/**
 * Задание 5: REST API на Koa.js + DAO для MongoDB.
 * Запуск: npm start   (нужен запущенный MongoDB; для транзакций и Change Streams — реплика-сет)
 */

const Koa = require('koa');
const bodyParser = require('koa-bodyparser');

const cfg = require('./config');
const { Database } = require('./config/database');
const { StudentDAO } = require('./dao/StudentDAO');
const { StudentService } = require('./services/StudentService');
const { StudentController } = require('./controllers/StudentController');
const { MetricsController } = require('./controllers/MetricsController');
const { errorHandler } = require('./middleware/errorHandler');
const { requestLogger } = require('./middleware/requestLogger');
const { dbMiddleware } = require('./middleware/db');
const { createRouter } = require('./routes');
const { StudentChangeStream } = require('./streams/studentChangeStream');
const { WsBroadcaster } = require('./streams/wsBroadcaster');
const { TTLCache } = require('./utils/cache');
const { Metrics } = require('./utils/metrics');
const { createLogger } = require('./utils/logger');
const { line } = require('./utils/common');

async function main() {
  const logger = createLogger();
  const metrics = new Metrics();
  const cache = new TTLCache({ ttlMs: cfg.cacheTtlMs });

  const database = new Database({ uri: cfg.mongoUri, dbName: cfg.dbName, logger });
  try {
    await database.connect();
  } catch (err) {
    logger.error(`Не удалось подключиться к MongoDB (${cfg.maskUri(cfg.mongoUri)}): ${err.message}`);
    process.exitCode = 1;
    return;
  }
  await database.ensureValidator();
  await database.ensureIndexes();

  const dao = new StudentDAO({ database, logger, metrics });
  const service = new StudentService({ dao, cache, logger });
  const wsBroadcaster = new WsBroadcaster({ port: cfg.wsPort, logger });
  const changeStream = new StudentChangeStream({ database, logger });

  changeStream.on('change', (event) => {
    service.onExternalChange(); // изменения вне API тоже сбрасывают кэш
    const shown = event.operation === 'update' ? { _id: event.id, ...event.updatedFields } : event.operation === 'delete' ? { _id: event.id } : event.document && { name: event.document.name };
    logger.info(`[CHANGE] ${event.operation}: ${line(shown)}`);
    wsBroadcaster.broadcast(event);
  });
  await changeStream.start();

  const studentController = new StudentController({ service });
  const metricsController = new MetricsController({ metrics, cache, database, wsBroadcaster });
  const router = createRouter({ studentController, metricsController, database });

  const app = new Koa();
  app.use(requestLogger({ logger, metrics }));
  app.use(errorHandler({ logger }));
  app.use(bodyParser({
    enableTypes: ['json'],
    jsonLimit: '5mb',
    onerror: (err, ctx) => ctx.throw(400, 'Некорректный JSON в теле запроса'),
  }));
  app.use(dbMiddleware(database));
  app.use(router.routes());
  app.use(router.allowedMethods());
  app.on('error', (err) => logger.error(`Koa: ${err.message}`));

  await wsBroadcaster.start();
  const server = await new Promise((resolve) => {
    const s = app.listen(cfg.httpPort, () => resolve(s));
  });
  logger.info(`Koa-сервер на порту ${cfg.httpPort}`);

  let shuttingDown = false;
  const shutdown = async (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info(`${signal}: останавливаем сервер...`);
    await new Promise((resolve) => server.close(resolve));
    await changeStream.stop();
    await wsBroadcaster.close();
    await database.close();
    logger.info('Остановлено');
    process.exit(0);
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
