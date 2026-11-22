'use strict';

const { randomUUID } = require('node:crypto');
const { ConflictError, UnauthorizedError } = require('../utils/errors');

/**
 * Регистрация, вход, обновление токенов, выход.
 * Все попытки входа логируются ([AUTH]); ответ при ошибке одинаков для «нет такого email» и «неверный пароль».
 */
class AuthService {
  constructor({ User, RefreshToken, tokens, hasher, logger, config, now = Date.now }) {
    this.User = User;
    this.RefreshToken = RefreshToken;
    this.tokens = tokens;
    this.hasher = hasher;
    this.log = logger.auth;
    this.config = config;
    this.now = now;
    this.dummyHash = null;
  }

  async issueTokens(user) {
    const jti = randomUUID();
    const accessToken = this.tokens.signAccess(user);
    const refreshToken = this.tokens.signRefresh(user, jti);
    await this.RefreshToken.create({ jti, userId: user._id, expiresAt: new Date(this.now() + this.tokens.refreshTtl * 1000) });
    return { accessToken, refreshToken, expiresIn: this.tokens.accessTtl };
  }

  async register({ name, email, password, group_name, age, course }, ip = '-') {
    this.log(`REGISTER attempt email=${email} ip=${ip}`);
    if (await this.User.findByEmail(email)) {
      this.log(`REGISTER failed (email exists) email=${email} ip=${ip}`);
      throw new ConflictError();
    }
    const password_hash = await this.hasher.hash(password); // bcrypt, 10 раундов; пароль в открытом виде не сохраняется
    const user = await this.User.create({
      name, email, group_name: group_name || this.config.defaultGroup, password_hash, role: 'user',
      ...(age !== undefined ? { age } : {}), ...(course !== undefined ? { course } : {}),
    });
    this.log(`REGISTER success userId=${user._id} email=${user.email} ip=${ip}`);
    return { data: { userId: user._id, email: user.email }, ...(await this.issueTokens(user)) };
  }

  async login({ email, password }, ip = '-') {
    const user = await this.User.findByEmail(email, { withPassword: true });
    // Сравниваем хэш и для несуществующего пользователя — одинаковое время ответа, нет перебора email
    if (!user && !this.dummyHash) this.dummyHash = await this.hasher.hash(randomUUID());
    const matches = await this.hasher.compare(password, user && user.password_hash ? user.password_hash : this.dummyHash);
    if (!user || !user.password_hash || !matches) {
      this.log(`LOGIN FAILED email=${email} ip=${ip} reason=${user ? 'bad_password' : 'unknown_email'}`);
      throw new UnauthorizedError('Invalid credentials');
    }
    this.log(`LOGIN SUCCESS userId=${user._id} email=${user.email} role=${user.role} ip=${ip}`);
    return this.issueTokens(user);
  }

  /** Ротация: старый refresh-токен отзывается, выдаётся новая пара. */
  async refresh(refreshToken, ip = '-') {
    const payload = this.tokens.verifyRefresh(refreshToken);
    const stored = await this.RefreshToken.findActive(payload.jti);
    if (!stored) {
      this.log(`REFRESH rejected (revoked or unknown jti) ip=${ip}`);
      throw new UnauthorizedError('Invalid token');
    }
    const user = await this.User.findById(payload.userId);
    if (!user) throw new UnauthorizedError('Invalid token');
    await this.RefreshToken.revoke(payload.jti);
    this.log(`REFRESH success userId=${user._id} ip=${ip}`);
    return this.issueTokens(user);
  }

  async logout(refreshToken, ip = '-') {
    const payload = this.tokens.verifyRefresh(refreshToken);
    await this.RefreshToken.revoke(payload.jti);
    this.log(`LOGOUT userId=${payload.userId} ip=${ip}`);
    return { loggedOut: true };
  }
}

module.exports = { AuthService };
