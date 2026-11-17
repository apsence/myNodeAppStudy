'use strict';

const mysql = require('mysql2/promise');
const cfg = require('./index');

function baseOptions(overrides = {}) {
  return {
    host: cfg.db.host,
    port: cfg.db.port,
    user: cfg.db.user,
    password: cfg.db.password,
    database: cfg.db.database,
    charset: 'UTF8MB4_UNICODE_CI',
    decimalNumbers: true, // DECIMAL → number, а не строка
    ...overrides,
  };
}

/** Одно TCP-соединение. Закрывается вручную: await conn.end(). */
const createSingleConnection = (overrides) => mysql.createConnection(baseOptions(overrides));

/** Пул соединений. Соединения создаются по требованию, до connectionLimit штук. */
const createPool = (overrides) =>
  mysql.createPool(
    baseOptions({
      waitForConnections: true,
      connectionLimit: cfg.db.connectionLimit,
      queueLimit: 0,
      enableKeepAlive: true,
      ...overrides,
    })
  );

module.exports = { createSingleConnection, createPool, mysql };
