'use strict';

const ROLES = ['user', 'admin', 'moderator'];

const isOwner = (actor, targetId) => Boolean(actor) && String(actor.userId) === String(targetId);

/** Изменять пользователя может он сам, администратор или модератор. */
const canModifyUser = (actor, targetId) => isOwner(actor, targetId) || (Boolean(actor) && ['admin', 'moderator'].includes(actor.role));

/** Удалять пользователя может только администратор или он сам. */
const canDeleteUser = (actor, targetId) => isOwner(actor, targetId) || (Boolean(actor) && actor.role === 'admin');

module.exports = { ROLES, isOwner, canModifyUser, canDeleteUser };
