'use strict';

const fs = require('fs');
const { AppError } = require('../utils/errors');

/**
 * Имитация сборки проекта. Если файл конфигурации не найден —
 * выбрасывает AppError с "дружелюбными" строками для production-режима.
 * Ошибка НЕ перехватывается в команде build.js специально: она поднимается
 * до глобальных обработчиков process.on('uncaughtException'/'unhandledRejection')
 * в bin/my-cli.js, как того требует архитектура задания №5.
 */
function build({ config }) {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      const configPath = config || 'config.json';
      if (!fs.existsSync(configPath)) {
        reject(
          new AppError(`ENOENT: no such file or directory, open '${configPath}'`, {
            friendlyLines: [
              'файл конфигурации не найден',
              'Укажите путь через --config',
              `Подробности: ${configPath} отсутствует в корне проекта`,
            ],
          })
        );
        return;
      }
      resolve({ output: 'dist/my-app.js', durationLabel: '2.3s' });
    }, 400);
  });
}

module.exports = { build };
