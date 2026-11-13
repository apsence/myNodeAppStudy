'use strict';

const { Readable } = require('node:stream');
const { GROUP } = require('./config');

/** Детерминированный ГПСЧ (mulberry32): одинаковый seed → одинаковые данные. */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Строка → 32-битное число (для seed из номера группы). */
function hashString(str) {
  let h = 2166136261;
  for (const ch of str) {
    h ^= ch.codePointAt(0);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const SEED = hashString(GROUP);

const MALE = [['Иван', 'Иванов'], ['Пётр', 'Сидоров'], ['Алексей', 'Смирнов'], ['Дмитрий', 'Кузнецов'], ['Сергей', 'Попов'], ['Андрей', 'Волков']];
const FEMALE = [['Мария', 'Петрова'], ['Анна', 'Соколова'], ['Елена', 'Лебедева'], ['Ольга', 'Козлова'], ['Наталья', 'Новикова'], ['Ирина', 'Морозова']];
const CORRUPTION_RATE = 0.0013; // ≈ 13 битых записей на 10 000

/**
 * Readable в objectMode: генерирует студентов порциями по batchSize.
 * Заполненный буфер (push() === false) — это и есть backpressure со стороны потребителя.
 */
class StudentGenerator extends Readable {
  constructor({ total, batchSize, delayMs = 0, highWaterMark, stats, monitor }) {
    super({ objectMode: true, highWaterMark });
    this.total = total;
    this.batchSize = batchSize;
    this.delayMs = delayMs;
    this.stats = stats;
    this.monitor = monitor;
    this.sent = 0;
    this.rnd = mulberry32(SEED);
    this.timer = null;
  }

  _read() {
    if (this.timer) return; // порция уже готовится
    this.timer = setTimeout(() => {
      this.timer = null;
      this.emitBatch();
    }, this.delayMs);
  }

  emitBatch() {
    const n = Math.min(this.batchSize, this.total - this.sent);
    let ok = true;
    for (let i = 0; i < n; i++) {
      this.sent++;
      this.stats.generated++;
      ok = this.push(this.makeStudent(this.sent));
    }
    if (!ok && this.monitor) {
      this.monitor.backpressure('readable', `Readable: буфер заполнен после ${this.sent}-й записи (push() вернул false), генератор ждёт`);
    }
    if (this.sent >= this.total) this.push(null);
  }

  makeStudent(id) {
    const r = this.rnd;
    const [first, last] = r() < 0.5 ? MALE[Math.floor(r() * MALE.length)] : FEMALE[Math.floor(r() * FEMALE.length)];
    const student = {
      id,
      name: `${first} ${last}`,
      group: GROUP,
      course: 1 + Math.floor(r() * 4),
      grade: Math.round((2 + r() * 3) * 10) / 10, // 2.0 … 5.0
    };
    if (r() < CORRUPTION_RATE) {
      // Намеренно портим запись, чтобы ValidateTransform было что отлавливать
      const kind = Math.floor(r() * 3);
      if (kind === 0) student.name = '';
      else if (kind === 1) student.grade = 'n/a';
      else student.grade = 7.5;
    }
    return student;
  }

  _destroy(err, callback) {
    clearTimeout(this.timer); // освобождаем таймер при отмене
    this.timer = null;
    callback(err);
  }
}

module.exports = { StudentGenerator, mulberry32, SEED };
