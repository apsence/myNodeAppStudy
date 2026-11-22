'use strict';

/** dbMiddleware: внедряет подключение к БД в ctx.db. */
const dbMiddleware = (db) => async (ctx, next) => {
  ctx.db = db;
  await next();
};

module.exports = { dbMiddleware };
