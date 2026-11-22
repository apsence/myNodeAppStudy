'use strict';

const { UnauthorizedError, ForbiddenError } = require('../utils/errors');
const { canDeleteUser, canModifyUser } = require('../utils/policies');

/** authMiddleware: проверка JWT из заголовка Authorization: Bearer <token>; кладёт payload в ctx.user. */
function authMiddleware({ tokens }) {
  return async function authenticate(ctx, next) {
    const header = ctx.get('Authorization');
    if (!header) throw new UnauthorizedError('Unauthorized');
    const match = /^Bearer\s+(\S+)$/i.exec(header);
    if (!match) throw new UnauthorizedError('Invalid token');
    ctx.user = tokens.verifyAccess(match[1]); // 401: неверный токен / истёк срок (с подсказкой обновить)
    ctx.state.user = ctx.user;
    await next();
  };
}

/** requireRole('admin') — иначе 403. */
const requireRole = (...roles) => async (ctx, next) => {
  if (!ctx.user || !roles.includes(ctx.user.role)) throw new ForbiddenError(`Forbidden: ${roles.join(' or ')} role required`);
  await next();
};

/** Владелец ресурса (:id) или администратор/модератор — в зависимости от политики. */
const requireOwnerOr = (kind) => async (ctx, next) => {
  const allowed = kind === 'delete' ? canDeleteUser(ctx.user, ctx.params.id) : canModifyUser(ctx.user, ctx.params.id);
  if (!allowed) {
    throw new ForbiddenError(kind === 'delete' ? 'Forbidden: admin role or ownership required' : 'Forbidden: owner, admin or moderator role required');
  }
  await next();
};

module.exports = { authMiddleware, requireRole, requireOwnerOr };
