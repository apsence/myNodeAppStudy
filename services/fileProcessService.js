'use strict';

const fs = require('fs');

/**
 * Проверяет существование файла на диске (изолированная от вывода логика).
 */
function checkFile(filePath) {
  return fs.existsSync(filePath);
}

/**
 * Формирует итоговую сводку по обработанным/отсутствующим файлам —
 * это и есть "результат работы программы", уходящий в stdout.
 */
function buildSummary(ok, missing) {
  return {
    processed: ok,
    missing,
    total: ok.length + missing.length,
  };
}

module.exports = { checkFile, buildSummary };
