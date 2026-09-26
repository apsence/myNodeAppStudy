'use strict';

const cliProgress = require('cli-progress');
const logger = require('../utils/logger');
const fileProcessService = require('c:/Users/SashaGritskevich/OneDrive/Рабочий стол/Новая папка/services/fileProcessService');

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

module.exports = (program) => {
  program
    .command('process')
    .description('обработать список файлов (демонстрация цветов/прогресс-бара/потоков)')
    .requiredOption('-F, --files <files...>', 'список файлов для обработки')
    .action(async (opts) => {
      const files = opts.files;
      const isTTY = process.stdout.isTTY;
      const ok = [];
      const missing = [];

      // Прогресс-бар имеет смысл только в интерактивном терминале
      // и при обработке нескольких файлов.
      let bar = null;
      if (isTTY && files.length > 1) {
        bar = new cliProgress.SingleBar(
          {
            format: '[{bar}] {percentage}% | {value}/{total} | ETA: {eta_formatted}',
            hideCursor: true,
          },
          cliProgress.Presets.shades_classic
        );
        bar.start(files.length, 0);
      }

      for (const file of files) {
        await wait(120); // имитация работы
        const exists = fileProcessService.checkFile(file);
        if (exists) {
          ok.push(file);
          if (!bar) logger.success(`Файл ${file} обработан`);
        } else {
          missing.push(file);
          logger.error(`Файл ${file} не найден`);
        }
        if (bar) bar.increment();
      }
      if (bar) bar.stop();

      if (missing.length > 0) {
        logger.warn(`Пропущено ${missing.length} файл(ов)`);
      }

      const summary = fileProcessService.buildSummary(ok, missing);

      // "Silence is Golden": при полном успехе с единственным файлом
      // в stdout ничего не выводится — только код возврата 0.
      // При нескольких файлах или наличии данных — итог уходит в stdout
      // (можно перенаправить в файл: my-cli process --files a.txt > result.json).
      const shouldStaySilent = missing.length === 0 && files.length === 1;
      if (!shouldStaySilent) {
        logger.data(JSON.stringify(summary));
      }

      if (missing.length > 0) {
        process.exitCode = 1;
      }
    });
};
