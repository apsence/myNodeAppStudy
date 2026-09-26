'use strict';

const logger = require('../utils/logger');
const { group } = require('../utils/config');

module.exports = (program) => {
  program
    .command('greet <name>')
    .description('поприветствовать пользователя')
    .action((name) => {
      logger.data(`Привет, ${name}! Добро пожаловать в CLI-приложение группы ${group}.`);
    });
};
