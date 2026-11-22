'use strict';

class AppError extends Error {
  constructor(status, message, details) {
    super(message);
    this.name = this.constructor.name;
    this.status = status;
    this.expose = true;
    this.details = details;
  }
}
class ValidationError extends AppError {
  constructor(details, message = 'Ошибка валидации') { super(400, message, details); }
}
class NotFoundError extends AppError {
  constructor(message = 'Не найдено') { super(404, message); }
}
class ConflictError extends AppError {
  constructor(message = 'Конфликт данных', details) { super(409, message, details); }
}

module.exports = { AppError, ValidationError, NotFoundError, ConflictError };
