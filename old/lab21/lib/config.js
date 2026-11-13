'use strict';

const GROUP = 'ББМО-01-23';

module.exports = {
  GROUP,
  TOTAL: 10000,        // сколько студентов генерируем
  BATCH_SIZE: 100,     // порция генерации
  MIN_GRADE_EXCLUSIVE: 3, // фильтр: оценка > 3
  TIMEOUT_MS: 10000,   // отмена по таймауту
  // highWaterMark каждого потока (для objectMode — число объектов, иначе — байты)
  HWM: {
    generator: 200,
    validate: 64,
    enrich: 64,
    filter: 64,
    format: 64,
    formatOut: 4096,
    writer: 1024,
  },
  // Имитация медленного диска: каждые N записей пауза M мс
  WRITER_SLOW_EVERY: 1000,
  WRITER_SLOW_MS: 50,
  // Задержка генератора на порцию, чтобы прогресс-бар был виден
  GENERATOR_DELAY_MS: 20,
};
