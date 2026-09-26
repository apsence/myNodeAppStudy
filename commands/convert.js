'use strict';

const fs = require('fs');
const logger = require('../utils/logger');

module.exports = (program) => {
  program
    .command('convert')
    .description('конвертировать файл')
    .requiredOption('-i, --input <path>', 'исходный файл')
    .option('-o, --output <path>', 'путь результата')
    .action((opts) => {
      if (!fs.existsSync(opts.input)) {
        logger.error(`файл "${opts.input}" не найден`);
        process.exitCode = 1;
        return;
      }
      const output = opts.output || `${opts.input}.out`;
      fs.copyFileSync(opts.input, output);
      logger.data(`Файл сконвертирован: ${output}`);
    });
};
