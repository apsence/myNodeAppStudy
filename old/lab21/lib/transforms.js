'use strict';

const { Transform } = require('node:stream');
const { GROUP, MIN_GRADE_EXCLUSIVE } = require('./config');
const { mulberry32, SEED } = require('./generator');

const CSV_HEADER = 'id,name,group,course,grade,averageGrade';

// ---------- чистые функции (используются и в pipeline, и в async iterator) ----------

/** Возвращает текст причины ошибки или null, если запись корректна. */
function validateStudent(s) {
  if (!s || typeof s !== 'object') return 'пустая запись';
  if (!Number.isInteger(s.id)) return 'некорректный id';
  if (typeof s.name !== 'string' || !s.name.trim()) return 'отсутствует name';
  if (s.group !== GROUP) return 'некорректная group';
  if (!Number.isInteger(s.course) || s.course < 1 || s.course > 6) return 'некорректный course';
  if (typeof s.grade !== 'number' || Number.isNaN(s.grade) || s.grade < 2 || s.grade > 5) return 'некорректный grade';
  return null;
}

/**
 * Добавляет averageGrade — среднее текущей оценки и оценок за прошлые курсы.
 * Прошлые оценки детерминированно «восстанавливаются» из id (в данных их нет).
 */
function enrichStudent(s) {
  const rnd = mulberry32((SEED ^ Math.imul(s.id, 2654435761)) >>> 0);
  const grades = [s.grade];
  for (let i = 1; i < s.course; i++) {
    grades.push(Math.min(5, Math.max(2, s.grade + (rnd() - 0.5))));
  }
  const avg = grades.reduce((a, b) => a + b, 0) / grades.length;
  return { ...s, averageGrade: Math.round(avg * 10) / 10 };
}

const passesFilter = (s) => s.grade > MIN_GRADE_EXCLUSIVE;

const csvEscape = (v) => {
  const str = String(v);
  return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
};

function toCsvLine(s) {
  return [s.id, s.name, s.group, s.course, s.grade, s.averageGrade].map(csvEscape).join(',') + '\n';
}

// ---------- Transform-потоки ----------

class ValidateTransform extends Transform {
  constructor({ stats, logger, highWaterMark }) {
    super({ objectMode: true, highWaterMark });
    this.stats = stats;
    this.logger = logger;
  }
  _transform(student, enc, cb) {
    this.stats.processed++;
    const reason = validateStudent(student);
    if (reason) {
      this.stats.errors++;
      this.logger.validation(student && student.id, reason);
      return cb(); // битую запись отбрасываем, поток продолжает работать
    }
    this.stats.validated++;
    cb(null, student);
  }
}

class EnrichTransform extends Transform {
  constructor({ stats, highWaterMark }) {
    super({ objectMode: true, highWaterMark });
    this.stats = stats;
  }
  _transform(student, enc, cb) {
    this.stats.enriched++;
    cb(null, enrichStudent(student));
  }
}

class FilterTransform extends Transform {
  constructor({ stats, highWaterMark, predicate = passesFilter }) {
    super({ objectMode: true, highWaterMark });
    this.stats = stats;
    this.predicate = predicate;
  }
  _transform(student, enc, cb) {
    if (this.predicate(student)) {
      this.stats.filtered++;
      cb(null, student);
    } else {
      this.stats.rejected++;
      cb();
    }
  }
}

/** Объект (вход, objectMode) → строка CSV (выход, обычный режим). */
class FormatTransform extends Transform {
  constructor({ highWaterMark, readableHighWaterMark }) {
    super({ writableObjectMode: true, writableHighWaterMark: highWaterMark, readableHighWaterMark });
  }
  _transform(student, enc, cb) {
    cb(null, toCsvLine(student));
  }
}

module.exports = {
  CSV_HEADER,
  validateStudent,
  enrichStudent,
  passesFilter,
  toCsvLine,
  ValidateTransform,
  EnrichTransform,
  FilterTransform,
  FormatTransform,
};
