'use strict';

const fs = require('node:fs');
const { Writable } = require('node:stream');

/**
 * Приёмник: пишет CSV-строки в файл.
 * - сам соблюдает backpressure файлового потока (ждёт его 'drain');
 * - имитирует медленный диск (пауза каждые slowEvery записей);
 * - при destroy() закрывает файл и очищает таймеры.
 */
class CsvFileWriter extends Writable {
  constructor({ filePath, header, stats, monitor, highWaterMark, slowEvery, slowMs }) {
    super({ highWaterMark, decodeStrings: false });
    this.stats = stats;
    this.monitor = monitor;
    this.slowEvery = slowEvery;
    this.slowMs = slowMs;
    this.timer = null;
    this.file = fs.createWriteStream(filePath, { encoding: 'utf8' });
    this.file.on('error', (err) => this.destroy(err));
    this.file.write(header + '\n');
  }

  _write(line, encoding, callback) {
    // writableNeedDrain === true: предыдущий write() уже вернул false → мы были перегружены
    if (this.writableNeedDrain && this.monitor) {
      this.monitor.backpressure(
        'writable',
        `Writable переполнен на ${this.stats.written + 1}-й записи (буфер ${this.writableLength}/${this.writableHighWaterMark} байт)`
      );
    }
    const fileOk = this.file.write(line);
    this.stats.written++;

    const next = () => (fileOk ? callback() : this.file.once('drain', () => callback()));

    if (this.slowEvery && this.stats.written % this.slowEvery === 0) {
      if (this.monitor) this.monitor.backpressure('pause', `Пауза ${this.slowMs} мс (медленный диск, запись №${this.stats.written})`);
      this.timer = setTimeout(next, this.slowMs);
    } else {
      next();
    }
  }

  _final(callback) {
    this.file.end(callback); // 'finish' наступит только после сброса данных на диск
  }

  _destroy(err, callback) {
    clearTimeout(this.timer);
    this.file.destroy();
    callback(err);
  }
}

module.exports = { CsvFileWriter };
