'use strict';

const logger = require('../utils/logger');
const { group, student } = require('../utils/config');

module.exports = (program) => {
  program
    .command('info')
    .description('вывести информацию о группе')
    .action(() => {
      logger.data(`Группа: ${group}`);
      logger.data(`Студент: ${student}`);
      logger.data('Лабораторная работа: №17');
      logger.data(`Дата: ${new Date().toISOString().slice(0, 10)}`);
    });
};
