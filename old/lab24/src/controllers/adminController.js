'use strict';

class AdminController {
  constructor({ userService }) {
    this.userService = userService;
    for (const m of ['listUsers', 'setRole', 'restore']) this[m] = this[m].bind(this);
  }

  /**
   * @openapi
   * /api/admin/users:
   *   get:
   *     tags: [Admin]
   *     summary: Список пользователей (только admin); deleted=only — удалённые
   *     security: [{ bearerAuth: [] }]
   *     parameters:
   *       - { in: query, name: deleted, schema: { type: string, enum: [only] } }
   *     responses:
   *       200: { description: Страница пользователей }
   *       401: { $ref: '#/components/responses/Unauthorized' }
   *       403: { $ref: '#/components/responses/Forbidden' }
   */
  async listUsers(ctx) {
    ctx.body = await this.userService.list(ctx.state.validated.query);
  }

  /**
   * @openapi
   * /api/admin/users/{id}/role:
   *   put:
   *     tags: [Admin]
   *     summary: Назначение роли (user, admin, moderator)
   *     security: [{ bearerAuth: [] }]
   *     parameters:
   *       - { in: path, name: id, required: true, schema: { type: string } }
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema: { type: object, required: [role], properties: { role: { type: string, enum: [user, admin, moderator] } } }
   *     responses:
   *       200: { description: Роль изменена }
   *       403: { $ref: '#/components/responses/Forbidden' }
   */
  async setRole(ctx) {
    ctx.body = { data: await this.userService.setRole(ctx.params.id, ctx.state.validated.body.role) };
  }

  /**
   * @openapi
   * /api/admin/users/{id}/restore:
   *   post:
   *     tags: [Admin]
   *     summary: Восстановление удалённого пользователя (soft delete)
   *     security: [{ bearerAuth: [] }]
   *     parameters:
   *       - { in: path, name: id, required: true, schema: { type: string } }
   *     responses:
   *       200: { description: Восстановлен }
   *       404: { $ref: '#/components/responses/NotFound' }
   */
  async restore(ctx) {
    ctx.body = { data: await this.userService.restore(ctx.params.id) };
  }
}

module.exports = { AdminController };
