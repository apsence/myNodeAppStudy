'use strict';

/**
 * Задание 5 (экспертный уровень)
 * Конвейер: StudentGenerator → Validate → Enrich → Filter → Format → CsvFileWriter
 * + backpressure (highWaterMark, drain), мониторинг, errors.log,
 * отмена по таймауту (AbortController) и сравнение с async iterator.
 */

const fs = require('node:fs');
const path = require('node:path');
const { once } = require('node:events');
const { pipeline } = require('node:stream/promises');

const cfg = require('./lib/config');
const { StudentGenerator } = require('./lib/generator');
const {
  CSV_HEADER,
  validateStudent,
  enrichStudent,
  passesFilter,
  toCsvLine,
  ValidateTransform,
  EnrichTransform,
  FilterTransform,
  FormatTransform,
} = require('./lib/transforms');
const { CsvFileWriter } = require('./lib/csv-writer');
const { ErrorLogger, Monitor } = require('./lib/monitor');

const file = (name) => path.join(__dirname, name);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fmtSize = (bytes) => (bytes >= 1048576 ? `${(bytes / 1048576).toFixed(2)} МБ` : `${(bytes / 1024).toFixed(1)} КБ`);
const rate = (n, ms) => (ms > 0 ? Math.round(n / (ms / 1000)) : 0);

const newStats = () => ({
  generated: 0, processed: 0, validated: 0, enriched: 0,
  filtered: 0, rejected: 0, written: 0, errors: 0, streamErrors: 0,
});

/**
 * Собирает и запускает конвейер.
 * Возвращает { status: 'ok' | 'timeout' | 'error', stats, streams, durationMs, ... }
 */
async function runPipeline({
  csvPath, errorLogPath = null, quiet = false,
  generatorDelayMs = cfg.GENERATOR_DELAY_MS, timeoutMs = cfg.TIMEOUT_MS,
}) {
  const stats = newStats();
  const logger = new ErrorLogger(errorLogPath);
  const monitor = new Monitor({ stats, total: cfg.TOTAL, quiet });

  const streams = {
    generator: new StudentGenerator({
      total: cfg.TOTAL, batchSize: cfg.BATCH_SIZE, delayMs: generatorDelayMs,
      highWaterMark: cfg.HWM.generator, stats, monitor,
    }),
    validate: new ValidateTransform({ stats, logger, highWaterMark: cfg.HWM.validate }),
    enrich: new EnrichTransform({ stats, highWaterMark: cfg.HWM.enrich }),
    filter: new FilterTransform({ stats, highWaterMark: cfg.HWM.filter }),
    format: new FormatTransform({ highWaterMark: cfg.HWM.format, readableHighWaterMark: cfg.HWM.formatOut }),
    writer: new CsvFileWriter({
      filePath: csvPath, header: CSV_HEADER, stats, monitor,
      highWaterMark: cfg.HWM.writer, slowEvery: cfg.WRITER_SLOW_EVERY, slowMs: cfg.WRITER_SLOW_MS,
    }),
  };

  // Слушатель 'error' на КАЖДОМ потоке + логирование в errors.log
  for (const [name, stream] of Object.entries(streams)) {
    stream.on('error', (err) => {
      stats.streamErrors++;
      logger.stream(name, err);
    });
  }
  streams.writer.on('drain', () => monitor.drain(stats.written));

  // Отмена по таймауту
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  const startedAt = Date.now();
  monitor.start();
  let status = 'ok';
  let error = null;
  try {
    await pipeline(Object.values(streams), { signal: controller.signal });
  } catch (err) {
    error = err;
    status = err.name === 'AbortError' || err.code === 'ABORT_ERR' ? 'timeout' : 'error';
  } finally {
    clearTimeout(timer);
    monitor.stop(status === 'ok');
  }
  const durationMs = Date.now() - startedAt;

  // Дожидаемся закрытия файлового дескриптора
  const fileStream = streams.writer.file;
  if (!fileStream.closed) await Promise.race([once(fileStream, 'close'), sleep(500)]);
  await logger.close();

  return { status, error, stats, streams, monitor, logger, durationMs };
}

/** Тот же конвейер через for await (императивный стиль). */
async function runAsyncIterator({ csvPath }) {
  const stats = newStats();
  const generator = new StudentGenerator({
    total: cfg.TOTAL, batchSize: cfg.BATCH_SIZE, delayMs: cfg.GENERATOR_DELAY_MS,
    highWaterMark: cfg.HWM.generator, stats, monitor: null,
  });
  const out = fs.createWriteStream(csvPath, { encoding: 'utf8' });
  out.write(CSV_HEADER + '\n');

  const startedAt = Date.now();
  for await (const student of generator) {
    stats.processed++;
    if (validateStudent(student)) { stats.errors++; continue; }
    const enriched = enrichStudent(student);
    if (!passesFilter(enriched)) continue;
    // Backpressure вручную: если буфер файла полон — ждём 'drain'
    if (!out.write(toCsvLine(enriched))) await once(out, 'drain');
    stats.written++;
    if (stats.written % cfg.WRITER_SLOW_EVERY === 0) await sleep(cfg.WRITER_SLOW_MS); // та же имитация диска
  }
  await new Promise((resolve) => out.end(resolve));
  return { stats, durationMs: Date.now() - startedAt };
}

function printFileHead(title, p, n = 5) {
  console.log(title);
  const lines = fs.readFileSync(p, 'utf8').split('\n').filter(Boolean);
  for (const l of lines.slice(0, n)) console.log('  ' + l);
  if (lines.length > n) console.log(`  ... (всего строк: ${lines.length})`);
}

async function main() {
  const csvPath = file('students.csv');
  const errorLogPath = file('errors.log');

  console.log(`=== Конвейер обработки данных (группа ${cfg.GROUP}) ===`);
  console.log(`Источник: ${cfg.TOTAL} студентов (порциями по ${cfg.BATCH_SIZE})`);
  console.log(`Фильтр: оценка > ${cfg.MIN_GRADE_EXCLUSIVE}`);
  console.log(`Таймаут: ${cfg.TIMEOUT_MS / 1000} сек`);
  console.log(`highWaterMark: ${JSON.stringify(cfg.HWM)}\n`);

  // ---- 1. Основной запуск ----
  const main = await runPipeline({ csvPath, errorLogPath });
  if (main.status !== 'ok') {
    console.log(`\n✖ Конвейер завершился со статусом "${main.status}": ${main.error.message}`);
    process.exitCode = 1;
    return;
  }
  const s = main.stats;
  console.log('\n=== Результаты ===');
  console.log(`Всего сгенерировано: ${s.generated}`);
  console.log(`Прошло валидацию: ${s.validated}`);
  console.log(`Обогащено: ${s.enriched}`);
  console.log(`Оставлено фильтром (оценка > ${cfg.MIN_GRADE_EXCLUSIVE}): ${s.filtered}`);
  console.log(`Отброшено фильтром: ${s.rejected}`);
  console.log(`Записано в CSV: ${s.written}`);
  console.log(`Ошибок: ${s.errors}`);
  console.log(`Время выполнения: ${(main.durationMs / 1000).toFixed(2)} сек`);
  console.log(`Средняя скорость: ${rate(s.processed, main.durationMs)} записей/сек`);
  console.log(`Файл: students.csv (${fmtSize(fs.statSync(csvPath).size)})`);

  // ---- 2. Backpressure ----
  const bp = main.monitor.bp;
  console.log('\n=== Демонстрация backpressure ===');
  console.log(`Событий за весь запуск: Readable ждал потребителя ${bp.readable} раз, ` +
    `Writable переполнялся ${bp.writable} раз, пауз диска ${bp.pause}, drain ${bp.drain}`);
  console.log('(выше в логе показаны первые события каждого вида)');

  // ---- 3. Таймаут ----
  console.log('\n=== Отмена по таймауту ===');
  console.log('Запуск с таймаутом 1 сек (источник замедлен до 100 мс на порцию)...');
  const slowPath = file('students-timeout.csv');
  const t = await runPipeline({ csvPath: slowPath, quiet: true, generatorDelayMs: 100, timeoutMs: 1000 });
  if (t.status === 'timeout') {
    console.log(`✖ Таймаут! Обработка отменена через ${(t.durationMs / 1000).toFixed(2)} сек (${t.error.name})`);
    console.log(`  Успело обработаться записей: ${t.stats.processed} из ${cfg.TOTAL}`);
  } else {
    console.log(`Неожиданный статус: ${t.status}`);
  }
  const allDestroyed = Object.values(t.streams).every((st) => st.destroyed);
  console.log(allDestroyed ? '✔ Все потоки корректно закрыты' : '✖ Часть потоков осталась открытой!');
  console.log(t.streams.writer.file.closed ? '✔ Ресурсы освобождены (файловый дескриптор закрыт, таймеры очищены)' : '✖ Файл не закрыт!');
  fs.rmSync(slowPath, { force: true });

  // ---- 4. Async iterator ----
  console.log('\n=== Сравнение с async iterator ===');
  const asyncPath = file('students-async.csv');
  const a = await runAsyncIterator({ csvPath: asyncPath });
  console.log(`[ASYNC]    Обработано: ${a.stats.written} записей за ${(a.durationMs / 1000).toFixed(2)} сек, ` +
    `скорость: ${rate(a.stats.processed, a.durationMs)} записей/сек`);
  console.log(`[PIPELINE] Обработано: ${s.written} записей за ${(main.durationMs / 1000).toFixed(2)} сек, ` +
    `скорость: ${rate(s.processed, main.durationMs)} записей/сек`);
  const same = fs.readFileSync(asyncPath, 'utf8') === fs.readFileSync(csvPath, 'utf8');
  console.log(same ? '✔ Результаты обоих подходов идентичны' : '⚠ Результаты различаются');
  console.log('  pipeline(): декларативно, backpressure/ошибки/очистка — автоматически, потоки работают параллельно.');
  console.log('  for await: проще читать и отлаживать, но backpressure записи и очистку приходится делать вручную.');
  fs.rmSync(asyncPath, { force: true });

  // ---- 5. Содержимое файлов ----
  console.log('');
  printFileHead('Содержимое students.csv:', csvPath);
  console.log('');
  printFileHead('Содержимое errors.log:', errorLogPath);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
