'use strict';

/**
 * Точка входа (задание 5). Запуск: npm start  |  docker compose up
 */
const fs = require('node:fs');
const http = require('node:http');
const https = require('node:https');
const path = require('node:path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { MongoClient } = require('mongodb');

const { loadConfig } = require('./config');
const { createLogger } = require('./utils/logger');
const { createEventBus } = require('./utils/eventBus');
const { createMetrics } = require('./metrics');
const { buildServices } = require('./container');
const { buildSpec } = require('./docs/swagger');
const { createApp } = require('./app');
const { attachWebSocket } = require('./realtime/wsServer');

async function main() {
  const config = loadConfig();
  const logger = createLogger({ level: config.logLevel });

  const client = new MongoClient(config.mongoUri, { serverSelectionTimeoutMS: 5000 });
  await client.connect();
  const db = client.db(config.dbName);
  logger.info('MongoDB запущена', { db: config.dbName });

  fs.mkdirSync(config.uploadDir, { recursive: true });
  const bus = createEventBus();
  const metrics = createMetrics();
  bus.on('user', (e) => metrics.userEvents.inc({ type: e.type }));

  const { services, tokens, uploads, isDbUp, ensureIndexes } = buildServices({ db, config, logger, bus });
  await ensureIndexes();

  const app = createApp({ config, logger, services, tokens, metrics, isDbUp, uploads, spec: buildSpec() });

  // HTTPS в production: либо TLS_KEY/TLS_CERT здесь, либо (чаще) TLS на обратном прокси + TRUST_PROXY=true
  const server = config.tls
    ? https.createServer({ key: fs.readFileSync(config.tls.key), cert: fs.readFileSync(config.tls.cert) }, app.callback())
    : http.createServer(app.callback());
  const realtime = attachWebSocket({ server, tokens, bus, logger });

  await new Promise((resolve) => server.listen(config.port, resolve));
  const scheme = config.tls ? 'https' : 'http';
  logger.info(`Приложение запущено на порту ${config.port}`);
  logger.info(`Swagger: ${scheme}://localhost:${config.port}/api-docs`);
  logger.info(`Metrics: ${scheme}://localhost:${config.port}/metrics`);
  logger.info(`Health: ${scheme}://localhost:${config.port}/health`);
  logger.info(`WebSocket: ${scheme === 'https' ? 'wss' : 'ws'}://localhost:${config.port}/ws?token=<accessToken>`);
  if (config.isProduction && !config.tls && !config.trustProxy) {
    logger.warn('production без TLS и без TRUST_PROXY: используйте HTTPS (TLS_KEY/TLS_CERT или обратный прокси)');
  }

  let closing = false;
  const shutdown = async (signal) => {
    if (closing) return;
    closing = true;
    logger.info(`${signal}: остановка сервера`);
    await realtime.close();
    await new Promise((resolve) => server.close(resolve));
    await client.close();
    process.exit(0);
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((err) => {
  console.error(`[ERROR] ${err.message}`);
  process.exitCode = 1;
});
