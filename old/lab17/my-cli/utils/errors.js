'use strict';

/**
 * Ошибка приложения с «дружелюбным» текстом для пользователя.
 * friendlyLines используется в production-режиме вместо стектрейса,
 * message/stack — в development-режиме (см. bin/my-cli.js).
 */
class AppError extends Error {
  constructor(message, { friendlyLines } = {}) {
    super(message);
    this.name = 'AppError';
    this.friendlyLines = friendlyLines || [message];
    Error.captureStackTrace && Error.captureStackTrace(this, AppError);
  }
}

module.exports = { AppError };
