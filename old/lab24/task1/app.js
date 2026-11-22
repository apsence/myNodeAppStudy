'use strict';

/**
 * Задание 1: простой REST API на Koa.js + MongoDB.
 * Запуск: npm run task1
 */
const path = require('node:path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const Koa = require('koa');
const bodyParser = require('koa-bodyparser');
const { xGroup, errorHandler, injectDb, GROUP } = require('./middleware');
const usersRouter = require('./routes/users');
const database = require('./db');

function createApp(db) {
  const app = new Koa();
  app.use(xGroup);
  app.use(errorHandler());
  app.use(bodyParser({ enableTypes: ['json', 'form'], jsonLimit: '100kb' }));
  app.use(injectDb(db));
  app.use(usersRouter.routes());
  app.use(usersRouter.allowedMethods());
  return app;
}

async function main() {
  const port = Number(process.env.PORT) || 3000;
  const db = await database.connect({
    uri: process.env.MONGODB_URI || 'mongodb://localhost:27017/bbmo_01_23',
    dbName: process.env.DB_NAME || 'bbmo_01_23',
  });
  console.log('[INFO] MongoDB подключена');
  const server = createApp(db).listen(port, () => {
    console.log(`[INFO] Koa-сервер на порту ${port}`);
    console.log(`[INFO] Группа: ${GROUP}`);
  });
  const stop = async () => {
    server.close();
    await database.close();
    process.exit(0);
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}

if (require.main === module) {
  main().catch((err) => {
    console.error(`[ERROR] ${err.message}`);
    process.exitCode = 1;
  });
}

module.exports = { createApp };
