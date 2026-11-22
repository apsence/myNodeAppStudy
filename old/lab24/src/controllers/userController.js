'use strict';

/**
 * HTTP-слой пользователей. JSDoc-блоки @openapi автоматически собираются swagger-jsdoc в спецификацию /api-docs.
 */
class UserController {
  constructor({ service }) {
    this.service = service;
    for (const m of ['list', 'search', 'stats', 'export', 'getOne', 'create', 'update', 'remove', 'import', 'avatar']) this[m] = this[m].bind(this);
  }

  /**
   * @openapi
   * /api/users:
   *   get:
   *     tags: [Users]
   *     summary: Список пользователей (пагинация, фильтры, сортировка, поиск)
   *     parameters:
   *       - { in: query, name: page, schema: { type: integer, minimum: 1, default: 1 } }
   *       - { in: query, name: limit, schema: { type: integer, minimum: 1, maximum: 100, default: 10 } }
   *       - { in: query, name: sort, schema: { type: string, example: -age }, description: "name, email, age, course, group_name, created_at; префикс - для убывания" }
   *       - { in: query, name: group_name, schema: { type: string, example: ББМО-01-23 } }
   *       - { in: query, name: course, schema: { type: integer, minimum: 1, maximum: 4 } }
   *       - { in: query, name: age_min, schema: { type: integer } }
   *       - { in: query, name: age_max, schema: { type: integer } }
   *       - { in: query, name: search, schema: { type: string }, description: Полнотекстовый поиск по имени и email }
   *     responses:
   *       200:
   *         description: Страница пользователей
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 data: { type: array, items: { $ref: '#/components/schemas/User' } }
   *                 pagination: { $ref: '#/components/schemas/Pagination' }
   *       400: { $ref: '#/components/responses/ValidationError' }
   */
  async list(ctx) {
    ctx.body = await this.service.list(ctx.state.validated.query);
  }

  /**
   * @openapi
   * /api/users/search:
   *   get:
   *     tags: [Users]
   *     summary: Полнотекстовый поиск с ранжированием по релевантности
   *     parameters:
   *       - { in: query, name: q, required: true, schema: { type: string, example: Иван } }
   *       - { in: query, name: limit, schema: { type: integer, default: 20 } }
   *     responses:
   *       200: { description: "{ found, data: [{ ..., score }] }" }
   *       400: { $ref: '#/components/responses/ValidationError' }
   */
  async search(ctx) {
    ctx.body = await this.service.search(ctx.state.validated.query);
  }

  /**
   * @openapi
   * /api/users/stats:
   *   get:
   *     tags: [Users]
   *     summary: Статистика (агрегация MongoDB)
   *     responses:
   *       200: { description: "{ total, averageAge, byGroup, byCourse }" }
   */
  async stats(ctx) {
    ctx.body = await this.service.stats();
  }

  /**
   * @openapi
   * /api/users/export:
   *   get:
   *     tags: [Users]
   *     summary: Экспорт пользователей (CSV или JSON), только admin/moderator
   *     security: [{ bearerAuth: [] }]
   *     parameters:
   *       - { in: query, name: format, schema: { type: string, enum: [csv, json], default: csv } }
   *       - { in: query, name: group_name, schema: { type: string } }
   *       - { in: query, name: course, schema: { type: integer } }
   *     responses:
   *       200: { description: Потоковый файл }
   *       401: { $ref: '#/components/responses/Unauthorized' }
   *       403: { $ref: '#/components/responses/Forbidden' }
   */
  async export(ctx) {
    const { stream, format } = this.service.exportStream(ctx.state.validated.query);
    ctx.attachment(format === 'json' ? 'users.json' : 'users.csv');
    ctx.type = format === 'json' ? 'application/json; charset=utf-8' : 'text/csv; charset=utf-8';
    ctx.body = stream;
  }

  /**
   * @openapi
   * /api/users/{id}:
   *   get:
   *     tags: [Users]
   *     summary: Пользователь по id
   *     parameters:
   *       - { in: path, name: id, required: true, schema: { type: string } }
   *     responses:
   *       200: { description: Пользователь, content: { application/json: { schema: { type: object, properties: { data: { $ref: '#/components/schemas/User' } } } } } }
   *       404: { $ref: '#/components/responses/NotFound' }
   */
  async getOne(ctx) {
    ctx.body = { data: await this.service.getById(ctx.params.id) };
  }

  /**
   * @openapi
   * /api/users:
   *   post:
   *     tags: [Users]
   *     summary: Создание пользователя
   *     security: [{ bearerAuth: [] }]
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema: { $ref: '#/components/schemas/UserInput' }
   *     responses:
   *       201: { description: Создан }
   *       400: { $ref: '#/components/responses/ValidationError' }
   *       401: { $ref: '#/components/responses/Unauthorized' }
   *       409: { description: Email already exists }
   */
  async create(ctx) {
    const user = await this.service.create(ctx.state.validated.body);
    ctx.status = 201;
    ctx.set('Location', `/api/users/${user._id}`);
    ctx.body = { data: user };
  }

  /**
   * @openapi
   * /api/users/{id}:
   *   put:
   *     tags: [Users]
   *     summary: Обновление (владелец, admin или moderator)
   *     security: [{ bearerAuth: [] }]
   *     parameters:
   *       - { in: path, name: id, required: true, schema: { type: string } }
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema: { $ref: '#/components/schemas/UserInput' }
   *     responses:
   *       200: { description: Обновлён }
   *       401: { $ref: '#/components/responses/Unauthorized' }
   *       403: { $ref: '#/components/responses/Forbidden' }
   *       404: { $ref: '#/components/responses/NotFound' }
   */
  async update(ctx) {
    ctx.body = { data: await this.service.update(ctx.params.id, ctx.state.validated.body) };
  }

  /**
   * @openapi
   * /api/users/{id}:
   *   delete:
   *     tags: [Users]
   *     summary: Мягкое удаление (владелец или admin)
   *     security: [{ bearerAuth: [] }]
   *     parameters:
   *       - { in: path, name: id, required: true, schema: { type: string } }
   *     responses:
   *       200: { description: Удалён (deleted_at) }
   *       401: { $ref: '#/components/responses/Unauthorized' }
   *       403: { $ref: '#/components/responses/Forbidden' }
   *       404: { $ref: '#/components/responses/NotFound' }
   */
  async remove(ctx) {
    ctx.body = { data: await this.service.delete(ctx.params.id) };
  }

  /**
   * @openapi
   * /api/users/import:
   *   post:
   *     tags: [Users]
   *     summary: Импорт пользователей (JSON-массив до 1000), только admin
   *     security: [{ bearerAuth: [] }]
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema: { type: array, items: { $ref: '#/components/schemas/UserInput' } }
   *     responses:
   *       200: { description: "{ received, inserted, skipped: [{ index, reason }] }" }
   *       403: { $ref: '#/components/responses/Forbidden' }
   */
  async import(ctx) {
    ctx.body = { data: await this.service.importUsers(ctx.request.body) };
  }

  /**
   * @openapi
   * /api/users/{id}/avatar:
   *   post:
   *     tags: [Users]
   *     summary: Загрузка аватара (png/jpeg/webp, до 2 МБ)
   *     security: [{ bearerAuth: [] }]
   *     parameters:
   *       - { in: path, name: id, required: true, schema: { type: string } }
   *     requestBody:
   *       required: true
   *       content:
   *         multipart/form-data:
   *           schema: { type: object, properties: { avatar: { type: string, format: binary } } }
   *     responses:
   *       200: { description: Аватар сохранён }
   *       400: { $ref: '#/components/responses/ValidationError' }
   */
  async avatar(ctx) {
    if (!ctx.file) {
      const { ValidationError } = require('../utils/errors');
      throw new ValidationError([{ field: 'avatar', message: 'обязательное поле (multipart/form-data)' }]);
    }
    const user = await this.service.setAvatar(ctx.params.id, ctx.file.filename);
    ctx.body = { data: { ...user, avatarUrl: `/uploads/${user.avatar}` } };
  }
}

module.exports = { UserController };
