'use strict';

const send = require('koa-send');

class SystemController {
  constructor({ isDbUp, metrics, spec, uploads }) {
    this.isDbUp = isDbUp;
    this.metrics = metrics;
    this.spec = spec;
    this.uploads = uploads;
    for (const m of ['health', 'ready', 'metricsText', 'openapi', 'upload']) this[m] = this[m].bind(this);
  }

  /**
   * @openapi
   * /health:
   *   get:
   *     tags: [System]
   *     summary: Liveness — процесс жив
   *     responses:
   *       200: { description: "{ status: ok, uptime, db: connected }" }
   *       503: { description: db недоступна }
   */
  async health(ctx) {
    const up = await this.isDbUp();
    ctx.status = up ? 200 : 503;
    ctx.body = { status: up ? 'ok' : 'degraded', uptime: Math.round(process.uptime()), db: up ? 'connected' : 'disconnected' };
  }

  /**
   * @openapi
   * /ready:
   *   get:
   *     tags: [System]
   *     summary: Readiness — сервис готов принимать трафик (БД доступна)
   *     responses:
   *       200: { description: "{ ready: true }" }
   *       503: { description: "{ ready: false }" }
   */
  async ready(ctx) {
    const up = await this.isDbUp();
    ctx.status = up ? 200 : 503;
    ctx.body = { ready: up };
  }

  /**
   * @openapi
   * /metrics:
   *   get:
   *     tags: [System]
   *     summary: Метрики Prometheus (http_requests_total, http_request_duration_seconds, ...)
   *     responses:
   *       200: { description: Текстовый формат Prometheus, content: { text/plain: { schema: { type: string } } } }
   */
  async metricsText(ctx) {
    const { contentType, body } = await this.metrics.render();
    ctx.type = contentType;
    ctx.body = body;
  }

  async openapi(ctx) {
    ctx.body = this.spec;
  }

  /** Раздача загруженных аватаров: только имена, сгенерированные сервером (защита от path traversal). */
  async upload(ctx) {
    if (!this.uploads.isSafeName(ctx.params.file)) ctx.throw(404);
    ctx.set('X-Content-Type-Options', 'nosniff');
    await send(ctx, ctx.params.file, { root: require('node:path').resolve(this.uploads.dir), maxage: 3600 * 1000 });
  }
}

module.exports = { SystemController };
