'use strict';

/** errorMiddleware: централизованная обработка ошибок. Формат: { error, status, details? }. */
function errorMiddleware({ logger }) {
  return async function errorHandler(ctx, next) {
    try {
      await next();
      if (ctx.status === 404 && ctx.body === undefined) {
        ctx.status = 404;
        ctx.body = { error: 'Not found', status: 404 };
      }
    } catch (err) {
      let status = 500;
      let body = { error: 'Internal server error' };
      if (err && typeof err.status === 'number' && err.expose && err.name !== 'HttpError') {
        status = err.status; // наши AppError
        body = { error: err.message, ...(err.details ? { details: err.details } : {}), ...(err.extra || {}) };
      } else if (err && err.code === 11000) {
        status = 409;
        body = { error: 'Email already exists' };
      } else if (err && err.status >= 400 && err.status < 500) {
        status = err.status; // bodyParser: плохой JSON (400), слишком большое тело (413)
        body = { error: err.expose ? err.message : 'Bad request' };
      } else {
        logger.error(`${ctx.method} ${ctx.path}: ${(err && err.stack) || err}`);
      }
      ctx.status = status;
      ctx.body = { ...body, status };
    }
  };
}

module.exports = { errorMiddleware };
