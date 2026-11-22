'use strict';

/** Любая ошибка → { status, body } (чистая функция — удобно тестировать). */
function toHttpError(err) {
  if (err && err.name === 'MulterError') {
    return err.code === 'LIMIT_FILE_SIZE'
      ? { status: 413, body: { error: 'File too large (max 2 MB)' } }
      : { status: 400, body: { error: 'Upload error', details: [{ field: err.field || 'avatar', message: err.message }] } };
  }
  if (err && typeof err.status === 'number' && err.expose && ['AppError', 'ValidationError', 'NotFoundError', 'ConflictError', 'UnauthorizedError', 'ForbiddenError', 'TooManyRequestsError'].includes(err.name)) {
    return { status: err.status, body: { error: err.message, ...(err.details ? { details: err.details } : {}), ...(err.extra || {}) } };
  }
  if (err && err.code === 11000) return { status: 409, body: { error: 'Email already exists' } };
  if (err && err.status >= 400 && err.status < 500) return { status: err.status, body: { error: err.expose ? err.message : 'Bad request' } };
  return { status: 500, body: { error: 'Internal server error' } };
}

/** errorMiddleware: централизованная обработка; формат { error, status, details? }; 5xx логируются с requestId. */
function errorMiddleware({ logger }) {
  return async function errorHandler(ctx, next) {
    try {
      await next();
      if (ctx.status === 404 && ctx.body === undefined) {
        ctx.status = 404;
        ctx.body = { error: 'Not found', status: 404 };
      }
    } catch (err) {
      const { status, body } = toHttpError(err);
      if (status >= 500) logger.error(`${ctx.method} ${ctx.path}: ${(err && err.stack) || err}`, { requestId: ctx.state.requestId });
      ctx.status = status;
      ctx.body = { ...body, status };
    }
  };
}

module.exports = { errorMiddleware, toHttpError };
