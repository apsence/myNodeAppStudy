'use strict';

/**
 * Слой контроллеров (HTTP): берёт проверенные Joi данные из ctx.state.validated,
 * вызывает сервис, выставляет ctx.status и ctx.body. Бизнес-логики и обращений к БД здесь нет.
 */
class UserController {
  constructor({ service }) {
    this.service = service;
    for (const m of ['list', 'search', 'stats', 'export', 'getOne', 'create', 'update', 'remove']) this[m] = this[m].bind(this);
  }

  async list(ctx) {
    ctx.body = await this.service.list(ctx.state.validated.query); // { data, pagination }
  }

  async search(ctx) {
    ctx.body = await this.service.search(ctx.state.validated.query); // { found, data: [{ ..., score }] }
  }

  async stats(ctx) {
    ctx.body = await this.service.stats();
  }

  async export(ctx) {
    ctx.attachment('users.csv'); // Content-Disposition + Content-Type: text/csv
    ctx.type = 'text/csv; charset=utf-8';
    ctx.body = this.service.exportCsv(ctx.state.validated.query);
  }

  async getOne(ctx) {
    ctx.body = { data: await this.service.getById(ctx.params.id) };
  }

  async create(ctx) {
    const user = await this.service.create(ctx.state.validated.body);
    ctx.status = 201;
    ctx.set('Location', `/api/users/${user._id}`);
    ctx.body = { data: user };
  }

  async update(ctx) {
    ctx.body = { data: await this.service.update(ctx.params.id, ctx.state.validated.body) };
  }

  async remove(ctx) {
    ctx.body = { data: await this.service.delete(ctx.params.id) };
  }
}

module.exports = { UserController };
