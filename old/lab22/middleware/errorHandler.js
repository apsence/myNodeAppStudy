'use strict';

const { AppError } = require('../lib/appErrors');
const { mapMysqlError } = require('../lib/errors');

/** Любая ошибка → { status, body }. Чистая функция, поэтому легко тестируется. */
function toHttpError(err) {
  if (err instanceof AppError) {
    return { status: err.status, body: { error: err.message, details: err.details } };
  }
  const mapped = mapMysqlError(err);
  if (mapped) {
    const body = { error: mapped.error, code: mapped.code };
    if (err.transaction) body.transaction = err.transaction; // 'rolled back'
    if (err.batchIndex !== undefined && err.batchIndex >= 0) body.failedIndex = err.batchIndex;
    return { status: mapped.status, body };
  }
  const status = err && (err.status || err.statusCode);
  if (status && status >= 400 && status < 600 && status !== 500) {
    return { status, body: { error: status === 503 || err.expose ? err.message : 'Некорректный запрос' } };
  }
  return { status: 500, body: { error: 'Внутренняя ошибка сервера' } };
}

function errorHandler({ logger }) {
  return async function errorMiddleware(ctx, next) {
    try {
      await next();
      if (ctx.status === 404 && ctx.body === undefined) {
        ctx.status = 404;
        ctx.body = { error: 'Маршрут не найден' };
      }
    } catch (err) {
      const { status, body } = toHttpError(err);
      if (status >= 500) logger.error(`${ctx.method} ${ctx.path}: ${(err && err.stack) || err}`);
      ctx.status = status;
      ctx.body = body;
    }
  };
}

module.exports = { errorHandler, toHttpError };
