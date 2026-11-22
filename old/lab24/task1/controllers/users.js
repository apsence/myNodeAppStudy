'use strict';

const users = require('../models/user');
const { ApiError } = require('../errors');

const notFound = () => new ApiError(404, 'User not found');

async function list(ctx) {
  ctx.body = { data: await users.list(ctx.db) };
}

async function getOne(ctx) {
  const user = await users.findById(ctx.db, ctx.params.id);
  if (!user) throw notFound();
  ctx.body = { data: user };
}

async function create(ctx) {
  const user = await users.create(ctx.db, ctx.request.body);
  ctx.status = 201;
  ctx.set('Location', `/api/users/${user._id}`);
  ctx.body = { data: user };
}

async function update(ctx) {
  const user = await users.update(ctx.db, ctx.params.id, ctx.request.body);
  if (!user) throw notFound();
  ctx.body = { data: user };
}

async function remove(ctx) {
  if (!(await users.remove(ctx.db, ctx.params.id))) throw notFound();
  ctx.body = { data: { deleted: ctx.params.id } };
}

module.exports = { list, getOne, create, update, remove };
