'use strict';

const ora = require('ora');
const logger = require('../utils/logger');
const buildService = require('c:/Users/SashaGritskevich/OneDrive/Рабочий стол/Новая папка/services/buildService');

module.exports = (program) => {
  program
    .command('build')
    .description('сборка проекта')
    .option('-c, --config <path>', 'путь к файлу конфигурации', 'config.json')
    .action(async (opts) => {
      const spinner = ora('Сборка проекта...').start();
      try {
        const result = await buildService.build(opts);
        spinner.succeed(`Сборка завершена за ${result.durationLabel}`);
        logger.data(`Результат: ${result.output}`);
      } catch (err) {
        spinner.fail('Сборка не выполнена');
        // Ошибка намеренно не гасится здесь: она поднимается в вызывающий код
        // (bin/my-cli.js), где перехватывается process.on('uncaughtException')/
        // parseAsync().catch(), демонстрируя архитектуру задания №5.
        throw err;
      }
    });
};
