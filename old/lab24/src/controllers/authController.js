'use strict';

class AuthController {
  constructor({ service }) {
    this.service = service;
    for (const m of ['register', 'login', 'refresh', 'logout']) this[m] = this[m].bind(this);
  }

  /**
   * @openapi
   * /api/auth/register:
   *   post:
   *     tags: [Auth]
   *     summary: Регистрация (роль user назначается сервером)
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema: { $ref: '#/components/schemas/RegisterInput' }
   *     responses:
   *       201: { description: "{ data: { userId, email }, accessToken, refreshToken, expiresIn }" }
   *       400: { $ref: '#/components/responses/ValidationError' }
   *       409: { description: Email already exists }
   */
  async register(ctx) {
    ctx.status = 201;
    ctx.body = await this.service.register(ctx.state.validated.body, ctx.ip);
  }

  /**
   * @openapi
   * /api/auth/login:
   *   post:
   *     tags: [Auth]
   *     summary: Вход, возвращает access (15 мин) и refresh (7 дней) токены
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema: { type: object, required: [email, password], properties: { email: { type: string }, password: { type: string } } }
   *     responses:
   *       200: { description: "{ accessToken, refreshToken, expiresIn }" }
   *       401: { description: Invalid credentials }
   */
  async login(ctx) {
    ctx.body = await this.service.login(ctx.state.validated.body, ctx.ip);
  }

  /**
   * @openapi
   * /api/auth/refresh:
   *   post:
   *     tags: [Auth]
   *     summary: Обновление токенов (refresh-токен одноразовый — ротация)
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema: { type: object, required: [refreshToken], properties: { refreshToken: { type: string } } }
   *     responses:
   *       200: { description: Новая пара токенов }
   *       401: { $ref: '#/components/responses/Unauthorized' }
   */
  async refresh(ctx) {
    ctx.body = await this.service.refresh(ctx.state.validated.body.refreshToken, ctx.ip);
  }

  /**
   * @openapi
   * /api/auth/logout:
   *   post:
   *     tags: [Auth]
   *     summary: Выход (refresh-токен отзывается)
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema: { type: object, required: [refreshToken], properties: { refreshToken: { type: string } } }
   *     responses:
   *       200: { description: "{ data: { loggedOut: true } }" }
   */
  async logout(ctx) {
    ctx.body = { data: await this.service.logout(ctx.state.validated.body.refreshToken, ctx.ip) };
  }
}

module.exports = { AuthController };
