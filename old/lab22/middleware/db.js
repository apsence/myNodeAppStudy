'use strict';

/**
 * Внедряет обёртку над пулом в ctx.db на раннем этапе обработки запроса.
 * Соединения отдельно не выдаются: db.query берёт соединение из пула и возвращает его сам,
 * а db.transaction освобождает соединение в finally — утечек соединений нет.
 */
function dbMiddleware(db) {
  return async function dbMiddlewareFn(ctx, next) {
    ctx.db = db;
    await next();
  };
}

module.exports = { dbMiddleware };
