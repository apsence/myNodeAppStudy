'use strict';

class AppError extends Error {
  constructor(status, message, details, extra) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.details = details;
    this.extra = extra; // дополнительные поля тела ответа (например, hint)
    this.expose = true;
  }
}
class ValidationError extends AppError {
  constructor(details, message = 'Validation failed') { super(400, message, details); this.name = 'ValidationError'; }
}
class NotFoundError extends AppError {
  constructor(message = 'User not found') { super(404, message); this.name = 'NotFoundError'; }
}
class ConflictError extends AppError {
  constructor(message = 'Email already exists') { super(409, message); this.name = 'ConflictError'; }
}
class UnauthorizedError extends AppError {
  constructor(message = 'Unauthorized', extra) { super(401, message, undefined, extra); this.name = 'UnauthorizedError'; }
}
class ForbiddenError extends AppError {
  constructor(message = 'Forbidden') { super(403, message); this.name = 'ForbiddenError'; }
}
class TooManyRequestsError extends AppError {
  constructor(message = 'Too many requests', extra) { super(429, message, undefined, extra); this.name = 'TooManyRequestsError'; }
}

module.exports = { AppError, ValidationError, NotFoundError, ConflictError, UnauthorizedError, ForbiddenError, TooManyRequestsError };
