'use strict';

const ora = require('ora');
const logger = require('../utils/logger');
const testService = require('c:/Users/SashaGritskevich/OneDrive/Рабочий стол/Новая папка/services/testService');

module.exports = (program) => {
  program
    .command('test')
    .description('запуск тестов')
    .action(async () => {
      const spinner = ora('Запуск тестов...').start();
      const result = await testService.run();
      spinner.succeed(`Пройдено: ${result.passed}/${result.total} тестов`);
      logger.data(`Покрытие: ${result.coverage}%`);
    });
};
