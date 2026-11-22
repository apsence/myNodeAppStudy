'use strict';

class AuthController {
  constructor({ service }) {
    this.service = service;
    for (const m of ['register', 'login', 'refresh', 'logout']) this[m] = this[m].bind(this);
  }

  async register(ctx) {
    ctx.status = 201;
    ctx.body = await this.service.register(ctx.state.validated.body, ctx.ip);
  }

  async login(ctx) {
    ctx.body = await this.service.login(ctx.state.validated.body, ctx.ip);
  }

  async refresh(ctx) {
    ctx.body = await this.service.refresh(ctx.state.validated.body.refreshToken, ctx.ip);
  }

  async logout(ctx) {
    ctx.body = { data: await this.service.logout(ctx.state.validated.body.refreshToken, ctx.ip) };
  }
}

module.exports = { AuthController };
