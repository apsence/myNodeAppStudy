'use strict';

const path = require('node:path');
const pkg = require('../../package.json');

/**
 * Спецификация OpenAPI 3: описание компонентов здесь, описание эндпоинтов — в JSDoc-блоках @openapi
 * контроллеров (swagger-jsdoc собирает их автоматически).
 */
const definition = {
  openapi: '3.0.3',
  info: {
    title: 'BBMO Users API',
    version: pkg.version,
    description: 'REST API пользователей (Koa.js + MongoDB). Группа ББМО-01-23. JWT: нажмите Authorize и вставьте access-токен.',
  },
  servers: [{ url: '/' }],
  components: {
    securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } },
    schemas: {
      User: {
        type: 'object',
        properties: {
          _id: { type: 'string', example: '65a5b1c2d3e4f5a6b7c8d9e0' },
          name: { type: 'string', example: 'Иван Иванов' },
          email: { type: 'string', example: 'ivan@example.com' },
          group_name: { type: 'string', example: 'ББМО-01-23' },
          age: { type: 'integer', example: 20 },
          course: { type: 'integer', example: 2 },
          role: { type: 'string', enum: ['user', 'admin', 'moderator'] },
          avatar: { type: 'string', nullable: true },
          created_at: { type: 'string', format: 'date-time' },
        },
      },
      UserInput: {
        type: 'object',
        required: ['name', 'email', 'group_name'],
        properties: {
          name: { type: 'string', minLength: 2, maxLength: 100 },
          email: { type: 'string', format: 'email' },
          group_name: { type: 'string', pattern: '^ББМО-\\d{2}-\\d{2}$', example: 'ББМО-01-23' },
          age: { type: 'integer', minimum: 16, maximum: 100 },
          course: { type: 'integer', minimum: 1, maximum: 4 },
          password: { type: 'string', minLength: 8, maxLength: 72 },
        },
      },
      RegisterInput: {
        type: 'object',
        required: ['name', 'email', 'password'],
        properties: {
          name: { type: 'string', example: 'Иван' },
          email: { type: 'string', example: 'ivan@example.com' },
          password: { type: 'string', minLength: 8, example: 'secret123' },
          group_name: { type: 'string', example: 'ББМО-01-23' },
        },
      },
      Pagination: {
        type: 'object',
        properties: { total: { type: 'integer' }, page: { type: 'integer' }, limit: { type: 'integer' }, pages: { type: 'integer' } },
      },
      Error: {
        type: 'object',
        properties: {
          error: { type: 'string' },
          status: { type: 'integer' },
          details: { type: 'array', items: { type: 'object', properties: { field: { type: 'string' }, message: { type: 'string' } } } },
        },
      },
    },
    responses: {
      ValidationError: { description: 'Validation failed', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
      Unauthorized: { description: 'Токен отсутствует, неверен или истёк', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
      Forbidden: { description: 'Недостаточно прав', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
      NotFound: { description: 'Не найдено', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
    },
  },
};

/** Собирает спецификацию из JSDoc контроллеров. */
function buildSpec({ swaggerJsdoc = null } = {}) {
  const lib = swaggerJsdoc || require('swagger-jsdoc');
  return lib({ definition, apis: [path.join(__dirname, '..', 'controllers', '*.js')] });
}

module.exports = { definition, buildSpec };
