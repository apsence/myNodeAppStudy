'use strict';

const GROUP = 'ББМО-01-23';
const GROUP_HEADER = 'BBMO-01-23'; // HTTP-заголовки должны содержать только ASCII/Latin-1.

/** Все ответы (включая ошибки) содержат заголовок X-Group. Ставится самым первым. */
async function xGroup(ctx, next) {
  ctx.set('X-Group', GROUP_HEADER);
  await next();
}

/** Централизованная обработка ошибок: 400 / 404 / 409 / 500; формат { error, status, details? }. */
function errorHandler({ log = console.error } = {}) {
  return async function errorMiddleware(ctx, next) {
    try {
      await next();
      if (ctx.status === 404 && ctx.body === undefined) {
        ctx.status = 404;
        ctx.body = { error: 'Not found', status: 404 };
      }
    } catch (err) {
      let status = 500;
      let body = { error: 'Internal server error' };
      if (err && err.name === 'ApiError') {
        status = err.status;
        body = { error: err.message, ...(err.details ? { details: err.details } : {}) };
      } else if (err && err.code === 11000) {
        status = 409;
        body = { error: 'Email already exists' };
      } else if (err && err.status >= 400 && err.status < 500) {
        status = err.status; // ошибки bodyParser: 400 (плохой JSON), 413 (слишком большое тело)
        body = { error: err.expose ? err.message : 'Bad request' };
      } else {
        log(`[ERROR] ${ctx.method} ${ctx.path}: ${(err && err.stack) || err}`);
      }
      ctx.status = status;
      ctx.body = { ...body, status };
    }
  };
}

/** Клиент MongoDB создаётся один раз при старте и передаётся в middleware → ctx.db. */
const injectDb = (db) => async (ctx, next) => {
  ctx.db = db;
  await next();
};

module.exports = { GROUP, GROUP_HEADER, xGroup, errorHandler, injectDb };
