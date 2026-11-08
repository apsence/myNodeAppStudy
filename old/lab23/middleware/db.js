'use strict';

/** Не пускает запросы к API, пока нет соединения с БД; кладёт db в ctx.state. */
function dbMiddleware(database) {
  return async function dbMiddlewareFn(ctx, next) {
    if (!database.isConnected) ctx.throw(503, 'База данных недоступна');
    ctx.state.db = database.db;
    await next();
  };
}

module.exports = { dbMiddleware };
