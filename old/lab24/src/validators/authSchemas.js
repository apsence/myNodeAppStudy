'use strict';

const Joi = require('joi');
const { fields } = require('./userSchemas');
const { ROLES } = require('../models/validation');

/** Регистрация: name, email, password обязательны (group_name по умолчанию ББМО-01-23). Поля role здесь нет — роль user назначается сервером. */
const registerSchema = Joi.object({
  name: fields.name.required(),
  email: fields.email.required(),
  password: fields.password.required(),
  group_name: fields.group_name,
  age: fields.age,
  course: fields.course,
});

/** Вход: только строки (объект вида { "$ne": null } отклоняется как string.base). */
const loginSchema = Joi.object({
  email: Joi.string().trim().lowercase().email({ tlds: { allow: false } }).required(),
  password: Joi.string().min(1).max(72).required(),
});

const refreshSchema = Joi.object({ refreshToken: Joi.string().min(20).max(2000).required() });

const roleSchema = Joi.object({ role: Joi.string().valid(...ROLES).required() });

module.exports = { registerSchema, loginSchema, refreshSchema, roleSchema };
