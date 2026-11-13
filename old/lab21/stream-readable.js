'use strict';

/**
 * Задание 1 (базовый уровень)
 * Простой Readable-поток, который отдаёт данные по частям,
 * и чтение из него в flowing-режиме (событие 'data').
 */

const { Readable } = require('node:stream');

const STUDENT_NAME = 'Грицкевич Александр';

const LINES = [
  'Группа: ББМО-01-23',
  `Студент: ${STUDENT_NAME}`,
  'Лабораторная работа: №21',
  'Тема: Потоки в Node.js',
];

class GroupInfoReadable extends Readable {
  constructor(lines, options) {
    // encoding: 'utf8' — чанки приходят в 'data' строками, а не Buffer
    super({ encoding: 'utf8', ...options });
    this.lines = lines;
    this.index = 0;
  }

  // Вызывается потоком каждый раз, когда ему нужны новые данные
  _read(size) {
    if (this.index >= this.lines.length) {
      this.push(null); // null — сигнал конца потока
      return;
    }
    const chunk = this.lines[this.index++];
    // Небольшая асинхронная пауза, чтобы было видно, что данные идут по частям
    setTimeout(() => this.push(chunk), 150);
  }
}

console.log('=== Демонстрация Readable-потока ===');

const readable = new GroupInfoReadable(LINES);

let chunkCount = 0;
let totalBytes = 0;

// Подписка на 'data' переключает поток в flowing-режим
readable.on('data', (chunk) => {
  chunkCount++;
  totalBytes += Buffer.byteLength(chunk, 'utf8');
  console.log(`[CHUNK ${chunkCount}] ${chunk}`);
});

readable.on('end', () => {
  console.log('[END] Поток завершён');
  console.log(`Всего получено чанков: ${chunkCount}`);
  console.log(`Общий размер данных: ${totalBytes} байт`);
});

readable.on('error', (err) => {
  console.error(`[ERROR] ${err.message}`);
});

readable.on('close', () => {
  console.log('[CLOSE] Ресурсы потока освобождены');
});
