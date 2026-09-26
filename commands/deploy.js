'use strict';

const ora = require('ora');
const inquirer = require('inquirer');
const logger = require('../utils/logger');
const deployService = require('c:/Users/SashaGritskevich/OneDrive/Рабочий стол/Новая папка/services/deployService');

module.exports = (program) => {
  program
    .command('deploy')
    .description('развёртывание проекта')
    .option('-e, --env <environment>', 'окружение развёртывания', 'production')
    .option('-f, --force', 'пропустить подтверждение', false)
    .action(async (opts) => {
      if (!opts.force) {
        logger.warn(`Вы собираетесь развернуть проект в ${opts.env}!`);
        const { confirmed } = await inquirer.prompt([
          { type: 'confirm', name: 'confirmed', message: 'Продолжить?', default: false },
        ]);
        if (!confirmed) {
          logger.warn('Развёртывание отменено');
          return;
        }
      }

      const spinner = ora('Развёртывание...').start();
      const result = await deployService.deploy(opts.env);
      spinner.succeed('Развёрнуто успешно');
      logger.data(`URL: ${result.url}`);
    });
};
