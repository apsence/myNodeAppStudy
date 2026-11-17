'use strict';

/**
 * Задание 5: REST API на Koa.js + MySQL (транзакции, кэш, миграции, метрики).
 * Запуск: npm start
 */

const Koa = require('koa');
const bodyParser = require('koa-bodyparser');

const cfg = require('./config');
const { createPool, createSingleConnection } = require('./config/database');
const { createLogger } = require('./lib/logger');
const { createDb, ManagedPool } = require('./lib/db');
const { Migrator } = require('./lib/migrator');
const { TTLCache } = require('./lib/cache');
const { Metrics } = require('./lib/metrics');
const { connectionHint } = require('./lib/errors');
const { StudentService } = require('./services/StudentService');
const { GroupService } = require('./services/GroupService');
const { StudentController } = require('./controllers/StudentController');
const { GroupController } = require('./controllers/GroupController');
const { SystemController } = require('./controllers/SystemController');
const { errorHandler } = require('./middleware/errorHandler');
const { requestLogger } = require('./middleware/requestLogger');
const { dbMiddleware } = require('./middleware/db');
const { createRouter } = require('./routes');
const path = require('node:path');

async function main() {
  const logger = createLogger();
  const metrics = new Metrics();
  const cache = new TTLCache({ ttlMs: cfg.cacheTtlMs });

  // 1. Миграции (отдельное соединение, не из пула)
  try {
    const conn = await createSingleConnection();
    try {
      const migrator = new Migrator({ conn, dir: path.join(cfg.rootDir, 'migrations'), logger });
      const applied = await migrator.up();
      const [[{ n }]] = await conn.query(
        "SELECT COUNT(*) AS n FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name IN ('students', 'groups')"
      );
      if (Number(n) !== 2) {
        logger.error('Таблицы students/groups отсутствуют, хотя миграции отмечены применёнными (их могли удалить задания 2–4).');
        logger.error('Выполните: npm run migrate:rollback && npm run migrate (повторите rollback, пока список миграций не станет пустым)');
        process.exitCode = 1;
        return;
      }
      logger.info(`Миграции применены: ${applied.length}`);
    } finally {
      await conn.end();
    }
  } catch (err) {
    logger.error(`Не удалось подключиться к MySQL или применить миграции: ${err.code || ''} ${err.message}`);
    const hint = connectionHint(err);
    if (hint) logger.error(hint);
    process.exitCode = 1;
    return;
  }

  // 2. Пул соединений (с авто-пересозданием при критических ошибках)
  const managed = new ManagedPool({ factory: () => createPool(), logger });
  const db = createDb(managed, { logger, metrics });
  logger.info(`Пул MySQL создан (лимит: ${cfg.db.connectionLimit})`);

  // 3. Приложение
  const studentService = new StudentService({ cache, logger });
  const groupService = new GroupService({ cache, logger });
  const router = createRouter({
    studentController: new StudentController({ service: studentService }),
    groupController: new GroupController({ service: groupService }),
    systemController: new SystemController({ cache, metrics }),
  });

  const app = new Koa();
  app.use(requestLogger({ logger, metrics }));
  app.use(errorHandler({ logger }));
  app.use(dbMiddleware(db)); // ctx.db — на раннем этапе, до парсинга тела и роутов
  app.use(bodyParser({
    enableTypes: ['json'],
    jsonLimit: cfg.bodyLimit, // ограничение размера тела запроса
    onerror: (err, ctx) => ctx.throw(err.status || 400, err.status === 413 ? 'Тело запроса слишком большое' : 'Некорректный JSON в теле запроса'),
  }));
  app.use(router.routes());
  app.use(router.allowedMethods());
  app.on('error', (err) => logger.error(`Koa: ${err.message}`));

  const server = await new Promise((resolve) => {
    const s = app.listen(cfg.httpPort, () => resolve(s));
  });
  logger.info(`Koa-сервер запущен на порту ${cfg.httpPort}`);
  logger.info(`Группа: ${cfg.GROUP}`);

  let closing = false;
  const shutdown = async (signal) => {
    if (closing) return;
    closing = true;
    logger.info(`${signal}: останавливаем сервер...`);
    await new Promise((resolve) => server.close(resolve));
    await managed.end().catch(() => {});
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
