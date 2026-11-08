'use strict';

const { AppError } = require('../utils/errors');

/** Переводит любую ошибку в { status, body }. Чистая функция — удобно тестировать. */
function toHttpError(err) {
  if (err instanceof AppError) {
    return { status: err.status, body: { error: err.message, details: err.details } };
  }
  if (err && err.code === 11000) {
    return {
      status: 409,
      body: {
        error: 'Запись с таким уникальным значением уже существует',
        details: err.keyValue,
        ...(err.transaction ? { transaction: 'rolled back' } : {}),
      },
    };
  }
  if (err && err.code === 121) {
    return { status: 400, body: { error: 'Документ не прошёл валидацию коллекции MongoDB', details: err.errInfo && err.errInfo.details } };
  }
  if (err && (err.name === 'MongoServerSelectionError' || err.name === 'MongoNetworkError')) {
    return { status: 503, body: { error: 'База данных недоступна' } };
  }
  const status = err && (err.status || err.statusCode);
  if (status && status >= 400 && status < 600 && status !== 500) {
    const fallback = status >= 500 ? 'Сервис временно недоступен' : 'Некорректный запрос';
    return { status, body: { error: status === 503 || err.expose ? err.message : fallback } };
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
      if (status >= 500) logger.error(`${ctx.method} ${ctx.path}: ${err && err.stack ? err.stack : err}`);
      ctx.status = status;
      ctx.body = body;
    }
  };
}

module.exports = { errorHandler, toHttpError };
