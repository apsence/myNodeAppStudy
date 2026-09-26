'use strict';

const fs = require('fs');
const inquirer = require('inquirer');
const logger = require('../utils/logger');
const projectService = require('c:/Users/SashaGritskevich/OneDrive/Рабочий стол/Новая папка/services/projectService');

const TYPE_CHOICES = [
  { name: 'Web-приложение', value: 'web' },
  { name: 'CLI-утилита', value: 'cli' },
  { name: 'Библиотека', value: 'lib' },
  { name: 'Микросервис', value: 'microservice' },
];

function readStdinSync() {
  try {
    return fs.readFileSync(0, 'utf8');
  } catch (e) {
    return '';
  }
}

module.exports = (program) => {
  program
    .command('init')
    .description('инициализация проекта')
    .option('-n, --name <name>', 'название проекта')
    .option('-t, --type <type>', 'тип проекта (web|cli|lib|microservice)')
    .option('--typescript', 'подключить TypeScript', false)
    .option('--eslint', 'подключить ESLint', false)
    .option('--prettier', 'подключить Prettier', false)
    .option('--jest', 'подключить Jest', false)
    .option('--git', 'инициализировать Git-репозиторий', false)
    .option('--no-interactive', 'отключить интерактивный режим (для CI/CD)')
    .action(async (opts) => {
      const stdinIsPiped = !process.stdin.isTTY;
      // Флаг --no-interactive ИЛИ данные через stdin автоматически отключают диалог.
      const interactive = opts.interactive !== false && !stdinIsPiped;

      let answers;

      if (interactive) {
        answers = await inquirer.prompt([
          {
            type: 'input',
            name: 'name',
            message: 'Введите название проекта:',
            when: () => !opts.name,
          },
          {
            type: 'list',
            name: 'type',
            message: 'Выберите тип проекта:',
            choices: TYPE_CHOICES,
            when: () => !opts.type,
          },
          {
            type: 'checkbox',
            name: 'features',
            message: 'Выберите дополнительные опции:',
            choices: [
              { name: 'TypeScript', value: 'typescript', checked: !!opts.typescript },
              { name: 'ESLint', value: 'eslint', checked: !!opts.eslint },
              { name: 'Prettier', value: 'prettier', checked: !!opts.prettier },
              { name: 'Jest', value: 'jest', checked: !!opts.jest },
            ],
          },
          {
            type: 'confirm',
            name: 'git',
            message: 'Использовать Git?',
            default: true,
          },
          {
            type: 'password',
            name: 'token',
            message: 'Введите токен доступа:',
            mask: '*',
          },
        ]);

        answers.name = opts.name || answers.name;
        answers.type = opts.type || answers.type;
      } else {
        // Неинтерактивный режим: все данные должны прийти через флаги
        // или (в качестве имени проекта) через stdin.
        let name = opts.name;
        if (!name && stdinIsPiped) {
          name = readStdinSync().trim() || undefined;
        }

        if (!name && !opts.type) {
          logger.error('в неинтерактивном режиме необходимо указать --name и --type');
          process.exitCode = 1;
          return;
        }
        if (!opts.type) {
          logger.error('недостаточно данных. Укажите --type');
          process.exitCode = 1;
          return;
        }
        if (!name) {
          logger.error('в неинтерактивном режиме необходимо указать --name и --type');
          process.exitCode = 1;
          return;
        }

        const features = [];
        if (opts.typescript) features.push('typescript');
        if (opts.eslint) features.push('eslint');
        if (opts.prettier) features.push('prettier');
        if (opts.jest) features.push('jest');

        answers = { name, type: opts.type, features, git: !!opts.git };
      }

      const result = projectService.init(answers);
      logger.data(`✓ Проект "${result.name}" успешно инициализирован!`);
      logger.data(`Тип: ${projectService.typeLabel(result.type)}`);
      logger.data(
        `Опции: ${
          (result.features || []).map(projectService.featureLabel).join(', ') || 'нет'
        }`
      );
      logger.data(`Git: ${result.git ? 'да' : 'нет'}`);
    });
};
