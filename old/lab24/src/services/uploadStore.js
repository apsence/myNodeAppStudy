'use strict';

const path = require('node:path');
const fsp = require('node:fs/promises');
const { detectImageType } = require('../utils/image');

// имена файлов генерирует только сервер: 24 hex-символа + расширение
const SAFE_NAME = /^[a-f0-9]{24}\.(png|jpg|webp)$/;

/** Хранилище загруженных файлов (аватары): проверка содержимого и безопасное удаление. */
function createUploadStore({ dir, fs = fsp }) {
  return {
    dir,
    isSafeName: (name) => typeof name === 'string' && SAFE_NAME.test(name),

    /** Содержимое файла действительно png/jpeg/webp (по сигнатуре, а не по расширению). */
    async verify(filename) {
      if (!SAFE_NAME.test(filename)) return false;
      const handle = await fs.open(path.join(dir, filename), 'r');
      try {
        const buf = Buffer.alloc(12);
        await handle.read(buf, 0, 12, 0);
        return detectImageType(buf) !== null;
      } finally {
        await handle.close();
      }
    },

    async remove(filename) {
      if (!filename || !SAFE_NAME.test(filename)) return;
      await fs.unlink(path.join(dir, filename)).catch(() => {});
    },
  };
}

module.exports = { createUploadStore, SAFE_NAME };
