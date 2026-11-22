'use strict';

const Joi = require('joi');
const { GROUP_RE } = require('../models/validation');

const fields = {
  name: Joi.string().trim().min(2).max(100),
  email: Joi.string().trim().lowercase().email({ tlds: { allow: false } }),
  group_name: Joi.string().trim().pattern(GROUP_RE),
  age: Joi.number().integer().min(16).max(100),
  course: Joi.number().integer().min(1).max(4),
  password: Joi.string().min(8).max(72), // 72 — предел bcrypt
};

/** Создание: name, email, group_name обязательны; age, course, password — по желанию. */
const createUserSchema = Joi.object({
  name: fields.name.required(),
  email: fields.email.required(),
  group_name: fields.group_name.required(),
  age: fields.age,
  course: fields.course,
  password: fields.password,
});

/** Обновление: любые из полей, но хотя бы одно. */
const updateUserSchema = Joi.object({
  name: fields.name,
  email: fields.email,
  group_name: fields.group_name,
  age: fields.age,
  course: fields.course,
  password: fields.password,
}).min(1);

module.exports = { fields, createUserSchema, updateUserSchema };
