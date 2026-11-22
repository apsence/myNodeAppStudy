'use strict';

const { NotFoundError, ConflictError } = require('../utils/errors');

/**
 * Слой сервисов: бизнес-логика. Зависимости передаются в конструктор (DI) — сервис легко тестировать
 * с поддельными User/mailer/hasher, без MongoDB.
 */
class UserService {
  constructor({ User, mailer, hasher, logger }) {
    this.User = User;
    this.mailer = mailer;
    this.hasher = hasher;
    this.log = logger.service;
  }

  async list(options) {
    this.log('Список пользователей');
    return this.User.findAll(options);
  }

  async getById(id) {
    const user = await this.User.findById(id);
    if (!user) throw new NotFoundError();
    return user;
  }

  /** Проверка уникальности email: в update исключаем самого пользователя. */
  async assertEmailFree(email, exceptId = null) {
    this.log('Проверка уникальности email');
    const existing = await this.User.findByEmail(email);
    if (existing && existing._id !== exceptId) {
      this.log('Email уже существует');
      throw new ConflictError();
    }
  }

  async create(input) {
    const { password, ...data } = input;
    this.log(`Создание пользователя: ${data.email}`);
    await this.assertEmailFree(data.email);
    if (password) data.password_hash = await this.hasher.hash(password); // пароль в открытом виде не хранится
    const user = await this.User.create(data);
    await this.mailer.sendWelcome(user);
    this.log(`Email отправлен: ${user.email}`);
    return user;
  }

  async update(id, input) {
    const { password, ...data } = input;
    this.log(`Обновление пользователя: ${id}`);
    if (data.email) await this.assertEmailFree(data.email, id);
    if (password) data.password_hash = await this.hasher.hash(password);
    const user = await this.User.update(id, data);
    if (!user) throw new NotFoundError();
    return user;
  }

  async delete(id) {
    this.log(`Удаление пользователя: ${id}`);
    if (!(await this.User.delete(id))) throw new NotFoundError();
    return { deleted: id };
  }
}

module.exports = { UserService };
