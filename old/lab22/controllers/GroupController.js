'use strict';

class GroupController {
  constructor({ service }) {
    this.service = service;
    for (const m of ['list', 'create', 'students']) this[m] = this[m].bind(this);
  }

  _send(ctx, { value, cacheHit }) {
    ctx.set('X-Cache', cacheHit ? 'HIT' : 'MISS');
    ctx.body = value;
  }

  async list(ctx) { this._send(ctx, await this.service.list(ctx.db)); }
  async students(ctx) { this._send(ctx, await this.service.studentsOf(ctx.db, ctx.params.id, ctx.query)); }

  async create(ctx) {
    const group = await this.service.create(ctx.db, ctx.request.body);
    ctx.status = 201;
    ctx.set('Location', `/api/groups/${group.id}`);
    ctx.body = group;
  }
}

module.exports = { GroupController };
