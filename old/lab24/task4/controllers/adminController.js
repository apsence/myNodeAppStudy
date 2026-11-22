'use strict';

const { NotFoundError } = require('../utils/errors');

class AdminController {
  constructor({ userService, User }) {
    this.userService = userService;
    this.User = User;
    this.listUsers = this.listUsers.bind(this);
    this.setRole = this.setRole.bind(this);
  }

  /** GET /api/admin/users — полный список с пагинацией и фильтрами (только admin). */
  async listUsers(ctx) {
    ctx.body = await this.userService.list(ctx.state.validated.query);
  }

  /** PUT /api/admin/users/:id/role — назначение роли (только admin). */
  async setRole(ctx) {
    const user = await this.User.setRole(ctx.params.id, ctx.state.validated.body.role);
    if (!user) throw new NotFoundError();
    ctx.body = { data: user };
  }
}

module.exports = { AdminController };
