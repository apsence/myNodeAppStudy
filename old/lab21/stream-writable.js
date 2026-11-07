'use strict';

/**
 * Задание 2 (средний уровень)
 * Writable-поток, метод write() и обработка backpressure
 * (возвращаемое значение write(), событие 'drain').
 */

const { Writable } = require('node:stream');

const STUDENT_NAME = 'Грицкевич Александр'; // <-- замените на своё ФИО

const LINES = [
  'Группа: ББМО-01-23',
  `Студент: ${STUDENT_NAME}`,
  'Лабораторная работа: №21',
  'Тема: Потоки в Node.js',
];

class SlowConsoleWritable extends Writable {
  constructor(options) {
    super(options);
    this.processed = 0;
  }

  _write(chunk, encoding, callback) {
    const text = chunk.toString();
    console.log(`[WRITE] ${text}`);
    this.processed++;
    // Имитация медленного приёмника: callback вызываем с задержкой.
    // Пока callback не вызван, новые чанки копятся во внутреннем буфере.
    setTimeout(callback, 200);
  }
}

/** Записывает строки, соблюдая backpressure. Возвращает Promise на 'finish'. */
function writeAll(writable, lines) {
  return new Promise((resolve, reject) => {
    writable.on('drain', () => console.log('[DRAIN] Буфер освобождён, продолжаем запись'));
    writable.on('finish', () => {
      console.log('[FINISH] Все данные записаны');
      console.log(`Всего записано: ${writable.processed} чанка(ов)`);
      resolve();
    });
    writable.on('error', (err) => {
      console.error(`[ERROR] ${err.message}`);
      reject(err);
    });

    let i = 0;
    function writeNext() {
      while (i < lines.length) {
        const ok = writable.write(lines[i++]);
        console.log(
          `write() вернул: ${ok}${ok ? '' : ' ← буфер переполнен! (writableLength=' +
            `${writable.writableLength} >= highWaterMark=${writable.writableHighWaterMark})`}`
        );
        if (!ok) {
          // Останавливаем запись и ждём 'drain'
          writable.once('drain', writeNext);
          return;
        }
      }
      writable.end(); // данных больше нет
    }
    writeNext();
  });
}

async function main() {
  console.log('=== Демонстрация Writable-потока ===');
  console.log('--- Маленький буфер (highWaterMark: 16) ---');
  await writeAll(new SlowConsoleWritable({ highWaterMark: 16 }), LINES);

  console.log('\n--- Большой буфер (highWaterMark: 1024) — backpressure не возникает ---');
  await writeAll(new SlowConsoleWritable({ highWaterMark: 1024 }), LINES);

  console.log('\n--- Игнорирование backpressure (пишем всё сразу, возвращаемое значение не проверяем) ---');
  const greedy = new SlowConsoleWritable({ highWaterMark: 16 });
  let peak = 0;
  for (let n = 1; n <= 8; n++) {
    greedy.write(`Строка ${n}`);
    peak = Math.max(peak, greedy.writableLength);
  }
  console.log(`⚠ Во внутреннем буфере накопилось до ${peak} байт при лимите ${greedy.writableHighWaterMark}`);
  console.log('⚠ При большом объёме данных это приводит к росту потребления памяти');
  await new Promise((resolve) => greedy.end(resolve));
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
