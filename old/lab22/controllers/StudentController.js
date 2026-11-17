'use strict';

/** Тонкий слой: берёт параметры из ctx, использует ctx.db, формирует HTTP-ответ. */
class StudentController {
  constructor({ service }) {
    this.service = service;
    for (const m of ['list', 'getById', 'create', 'update', 'remove', 'stats', 'batch']) this[m] = this[m].bind(this);
  }

  _send(ctx, { value, cacheHit }) {
    ctx.set('X-Cache', cacheHit ? 'HIT' : 'MISS');
    ctx.body = value;
  }

  async list(ctx) { this._send(ctx, await this.service.list(ctx.db, ctx.query)); }
  async getById(ctx) { this._send(ctx, await this.service.getById(ctx.db, ctx.params.id)); }
  async stats(ctx) { this._send(ctx, await this.service.stats(ctx.db)); }

  async create(ctx) {
    const student = await this.service.create(ctx.db, ctx.request.body);
    ctx.status = 201;
    ctx.set('Location', `/api/students/${student.id}`);
    ctx.body = student;
  }

  async update(ctx) { ctx.body = await this.service.update(ctx.db, ctx.params.id, ctx.request.body); }
  async remove(ctx) { ctx.body = await this.service.remove(ctx.db, ctx.params.id); }

  async batch(ctx) {
    ctx.status = 201;
    ctx.body = await this.service.batchCreate(ctx.db, ctx.request.body);
  }
}

module.exports = { StudentController };
