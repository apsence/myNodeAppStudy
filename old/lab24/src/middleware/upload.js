'use strict';

const { randomBytes } = require('node:crypto');
const { ValidationError } = require('../utils/errors');
const { EXT } = require('../utils/image');

/** multer для аватаров: png/jpeg/webp, до 2 МБ, один файл; имя файла генерирует сервер. */
function createUpload({ dir, maxBytes = 2 * 1024 * 1024, multer = null }) {
  const lib = multer || require('@koa/multer');
  const storage = lib.diskStorage({
    destination: (req, file, cb) => cb(null, dir),
    filename: (req, file, cb) => cb(null, `${randomBytes(12).toString('hex')}${EXT[file.mimetype] || ''}`),
  });
  return lib({
    storage,
    limits: { fileSize: maxBytes, files: 1 },
    fileFilter: (req, file, cb) =>
      EXT[file.mimetype] ? cb(null, true) : cb(new ValidationError([{ field: 'avatar', message: 'допустимые типы: image/png, image/jpeg, image/webp' }])),
  });
}

module.exports = { createUpload };
