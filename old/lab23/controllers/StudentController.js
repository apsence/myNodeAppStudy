'use strict';

/** Тонкий слой: достаёт параметры из ctx, вызывает сервис, формирует HTTP-ответ. */
class StudentController {
  constructor({ service }) {
    this.service = service;
    for (const m of ['list', 'getById', 'create', 'update', 'remove', 'stats', 'search', 'batch']) this[m] = this[m].bind(this);
  }

  _send(ctx, { value, cacheHit }) {
    ctx.set('X-Cache', cacheHit ? 'HIT' : 'MISS');
    ctx.body = value;
  }

  async list(ctx) { this._send(ctx, await this.service.list(ctx.query)); }
  async getById(ctx) { this._send(ctx, await this.service.getById(ctx.params.id)); }
  async stats(ctx) { this._send(ctx, await this.service.stats()); }
  async search(ctx) { this._send(ctx, await this.service.search(ctx.query.q, ctx.query.limit)); }

  async create(ctx) {
    const doc = await this.service.create(ctx.request.body);
    ctx.status = 201;
    ctx.set('Location', `/api/students/${doc._id}`);
    ctx.body = doc;
  }

  async update(ctx) { ctx.body = await this.service.update(ctx.params.id, ctx.request.body); }
  async remove(ctx) { ctx.body = await this.service.delete(ctx.params.id); }

  async batch(ctx) {
    ctx.status = 201;
    ctx.body = await this.service.batchCreate(ctx.request.body);
  }
}

module.exports = { StudentController };
