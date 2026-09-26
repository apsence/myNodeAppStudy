'use strict';

const logger = require('../utils/logger');
const reportService = require('c:/Users/SashaGritskevich/OneDrive/Рабочий стол/Новая папка/services/reportService');

module.exports = (program) => {
  program
    .command('generate')
    .description('сгенерировать отчёт')
    .option('-t, --type <type>', 'тип отчёта (по умолчанию: "html")', 'html')
    .option('-o, --output <path>', 'путь для сохранения')
    .option('-f, --force', 'перезаписать существующий файл', false)
    .option('--dry-run', 'показать что будет сделано без выполнения', false)
    .action((opts, command) => {
      const globalOpts = command.parent.opts();
      const verbose = !!globalOpts.verbose;
      const output = opts.output || `./output.${opts.type}`;

      if (!reportService.ALLOWED_TYPES.includes(opts.type)) {
        logger.error(`недопустимый тип отчёта "${opts.type}".`);
        logger.plain(`Допустимые значения: ${reportService.ALLOWED_TYPES.join(', ')}`);
        process.exitCode = 1;
        return;
      }

      if (opts.dryRun) {
        logger.data(`[DRY-RUN] Будет сгенерирован отчёт типа: ${opts.type}`);
        logger.data(`[DRY-RUN] Файл будет сохранён в: ${output}`);
        logger.data('[DRY-RUN] Действия не выполнены (режим проверки)');
        return;
      }

      logger.verbose('Запуск генерации отчёта...', verbose);
      logger.verbose(`Тип отчёта: ${opts.type}`, verbose);
      logger.verbose(`Путь сохранения: ${output}`, verbose);

      try {
        reportService.generate({ type: opts.type, output, force: !!opts.force });
        logger.data(`Отчёт успешно сгенерирован: ${output}`);
      } catch (err) {
        logger.error(err.message);
        process.exitCode = 1;
      }
    });
};
