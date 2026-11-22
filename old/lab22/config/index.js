'use strict';

const path = require('node:path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const constants = require('./constants');

const int = (value, fallback) => {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) ? n : fallback;
};

const config = {
  ...constants,
  db: {
    host: process.env.DB_HOST || 'localhost',
    port: int(process.env.DB_PORT, 3306),
    user: process.env.DB_USER || 'student',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || constants.DEFAULT_DB,
    connectionLimit: int(process.env.DB_POOL_LIMIT, 10),
  },
  httpPort: int(process.env.PORT, 3000),
  cacheTtlMs: int(process.env.CACHE_TTL_SECONDS, 60) * 1000,
  bodyLimit: process.env.BODY_LIMIT || '1mb',
  bigSize: int(process.env.BIG_SIZE, 100000),
  rootDir: path.join(__dirname, '..'),
};

const { describeEnv: describe } = require('../lib/envFile');
const describeEnv = (filePath = path.join(config.rootDir, '.env')) => describe(filePath);

module.exports = { ...config, describeEnv };
