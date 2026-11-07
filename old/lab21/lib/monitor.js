'use strict';

const fs = require('node:fs');
const { GROUP } = require('./config');

const pad = (n) => String(n).padStart(2, '0');
function timestamp(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/** Логирование ошибок в файл (если filePath не задан — только подсчёт). */
class ErrorLogger {
  constructor(filePath) {
    this.count = 0;
    this.out = filePath ? fs.createWriteStream(filePath, { flags: 'w', encoding: 'utf8' }) : null;
  }
  _line(text) {
    this.count++;
    if (this.out) this.out.write(`[${timestamp()}] [${GROUP}] ${text}\n`);
  }
  validation(id, reason) {
    this._line(`Ошибка валидации: id=${id}, ${reason}`);
  }
  stream(name, err) {
    this._line(`Ошибка потока ${name}: ${err.message}`);
  }
  close() {
    return new Promise((resolve) => (this.out ? this.out.end(resolve) : resolve()));
  }
}

/** Прогресс-бар, счётчики backpressure, скорость обработки. */
class Monitor {
  constructor({ stats, total, quiet = false, stepPercent = 10 }) {
    this.stats = stats;
    this.total = total;
    this.quiet = quiet;
    this.step = stepPercent;
    this.lastStep = 0;
    this.timer = null;
    this.startedAt = 0;
    this.bp = { readable: 0, writable: 0, pause: 0, drain: 0 };
    this.shown = { readable: 0, writable: 0, pause: 0, drain: 0 };
    this.maxShown = 3; // не засоряем консоль: печатаем первые 3 события каждого вида
  }

  elapsedSec() {
    return (Date.now() - this.startedAt) / 1000;
  }

  speed() {
    const t = this.elapsedSec();
    return t > 0 ? Math.round(this.stats.processed / t) : 0;
  }

  start() {
    this.startedAt = Date.now();
    this.timer = setInterval(() => this.tick(), 50);
  }

  tick(force = false) {
    const done = this.stats.processed;
    const pct = Math.min(100, Math.floor((done / this.total) * 100));
    const stepNow = Math.floor(pct / this.step) * this.step;
    if (!force && stepNow <= this.lastStep) return;
    this.lastStep = stepNow;
    if (this.quiet) return;
    const filled = Math.round((pct / 100) * 20);
    const bar = '█'.repeat(filled) + '░'.repeat(20 - filled);
    console.log(`[PROGRESS] ${bar} ${String(pct).padStart(3)}% | ${done}/${this.total} | ${this.speed()} записей/сек`);
  }

  stop(finalTick = true) {
    clearInterval(this.timer);
    if (finalTick) this.tick(true);
  }

  /** Фиксирует событие backpressure; печатает только первые maxShown событий каждого вида. */
  backpressure(kind, message) {
    this.bp[kind]++;
    if (this.quiet || this.shown[kind] >= this.maxShown) return;
    this.shown[kind]++;
    console.log(`[BACKPRESSURE] ${message}`);
  }

  drain(written) {
    this.bp.drain++;
    if (this.quiet || this.shown.drain >= this.maxShown) return;
    this.shown.drain++;
    console.log(`[DRAIN] Буфер Writable освобождён (записано ${written}), продолжаем запись`);
  }
}

module.exports = { ErrorLogger, Monitor, timestamp };
