#!/usr/bin/env node
'use strict';

const { Command } = require('commander');
const pkg = require('../package.json');
const logger = require('../utils/logger');

const program = new Command();

program
  .name('my-cli')
  .description('CLI-приложение для лабораторной работы №17 (группа ББМО-01-23)')
  .version(pkg.version, '-V, --version', 'output the version number')
  .option('-v, --verbose', 'подробный вывод');

// Регистрация подкоманд — каждая подкоманда живёт в своём файле в commands/.
require('../commands/greet')(program);
require('../commands/info')(program);
require('../commands/generate')(program);
require('../commands/convert')(program);
require('../commands/init')(program);
require('../commands/build')(program);
require('../commands/test')(program);
require('../commands/deploy')(program);
require('../commands/process')(program);

// Обработка неизвестной подкоманды (Задание 1).
program.on('command:*', (operands) => {
  logger.error(`неизвестная команда "${operands[0]}"`);
  logger.plain('Для справки используйте: my-cli --help');
  process.exitCode = 1;
});

/**
 * Единая точка обработки фатальных ошибок.
 * В development выводит полный стектрейс, в production — краткое сообщение
 * без внутренних деталей (см. AppError.friendlyLines).
 */
function handleFatalError(err) {
  const isDev = process.env.NODE_ENV === 'development';

  if (isDev) {
    logger.error(err.message);
    if (err.stack) process.stderr.write(`${err.stack}\n`);
  } else {
    const lines = err.friendlyLines || [err.message];
    lines.forEach((line, i) => {
      if (i === 0) {
        logger.error(line);
      } else {
        logger.plain(line);
      }
    });
  }
  process.exitCode = 1;
}

process.on('uncaughtException', handleFatalError);
process.on('unhandledRejection', (reason) => {
  handleFatalError(reason instanceof Error ? reason : new Error(String(reason)));
});

// Вызов без аргументов — печатаем справку (жизненный цикл: инициализация → помощь → выход).
if (process.argv.length <= 2) {
  program.outputHelp();
  process.exit(0);
}

program.parseAsync(process.argv).catch(handleFatalError);
