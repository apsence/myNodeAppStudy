'use strict';

const GROUP = 'ББМО-01-23';
const GROUP_HEADER = 'BBMO-01-23'; // HTTP-заголовки должны содержать только ASCII/Latin-1.

/** Заголовок X-Group во всех ответах (ставится первым, поэтому есть и у ошибок). */
async function xGroup(ctx, next) {
  ctx.set('X-Group', GROUP_HEADER);
  await next();
}

module.exports = { GROUP, GROUP_HEADER, xGroup };
