'use strict';
const path = require('path');

const ROOT = path.join(__dirname, '..');

module.exports = {
  GROUP: 'ББМО-01-23',
  HTTP_PORT: Number(process.env.HTTP_PORT) || 3000,
  HTTPS_PORT: Number(process.env.HTTPS_PORT) || 3443,
  ROOT,
  PUBLIC_DIR: path.join(ROOT, 'public'),
  DATA_DIR: path.join(ROOT, 'data'),
  CERT_DIR: path.join(ROOT, 'certs'),
  ACCESS_LOG: path.join(ROOT, 'access.log'),
  CACHE_TTL_MS: 60 * 1000,
  MAX_BODY: 1024 * 1024,
  STREAM_FILE: path.join(ROOT, 'data', 'big-file.bin'),
  STREAM_SIZE_MB: Number(process.env.STREAM_SIZE_MB) || 20,
};
