'use strict';

const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { run, file, lib } = require('./helpers');

const { StudentGenerator } = lib('generator');
const {
  CSV_HEADER, validateStudent, enrichStudent, passesFilter, toCsvLine,
} = lib('transforms');

const good = { id: 1, name: 'Иван Иванов', group: 'ББМО-01-23', course: 2, grade: 4.5 };
const num = (text, re) => Number(text.match(re)[1]);

describe('Задание 5: модули конвейера (unit)', () => {
  it('validateStudent: корректная запись проходит', () => {
    assert.equal(validateStudent(good), null);
  });

  it('validateStudent: находит пустое имя, плохую оценку, курс и группу', () => {
    assert.equal(validateStudent({ ...good, name: '' }), 'отсутствует name');
    assert.equal(validateStudent({ ...good, grade: 'n/a' }), 'некорректный grade');
    assert.equal(validateStudent({ ...good, grade: 7.5 }), 'некорректный grade');
    assert.equal(validateStudent({ ...good, course: 0 }), 'некорректный course');
    assert.equal(validateStudent({ ...good, group: 'ХХХХ-00-00' }), 'некорректная group');
    assert.equal(validateStudent(null), 'пустая запись');
  });

  it('passesFilter: граница — оценка строго больше 3', () => {
    assert.equal(passesFilter({ grade: 3 }), false);
    assert.equal(passesFilter({ grade: 3.1 }), true);
    assert.equal(passesFilter({ grade: 2 }), false);
    assert.equal(passesFilter({ grade: 5 }), true);
  });

  it('enrichStudent: добавляет averageGrade в диапазоне 2–5, результат детерминирован', () => {
    const a = enrichStudent(good);
    const b = enrichStudent(good);
    assert.equal(a.averageGrade, b.averageGrade);
    assert.ok(a.averageGrade >= 2 && a.averageGrade <= 5);
    assert.equal(enrichStudent({ ...good, course: 1 }).averageGrade, good.grade); // нет прошлых курсов
    assert.equal(good.averageGrade, undefined, 'исходный объект не должен мутировать');
  });

  it('toCsvLine: порядок колонок и экранирование запятых/кавычек', () => {
    assert.equal(CSV_HEADER, 'id,name,group,course,grade,averageGrade');
    assert.equal(toCsvLine({ ...good, averageGrade: 4.3 }), '1,Иван Иванов,ББМО-01-23,2,4.5,4.3\n');
    assert.equal(toCsvLine({ ...good, name: 'Иванов, "Иван"', averageGrade: 4 }),
      '1,"Иванов, ""Иван""",ББМО-01-23,2,4.5,4\n');
  });

  it('StudentGenerator: выдаёт заданное число объектов и детерминирован (seed из номера группы)', async () => {
    const collect = async () => {
      const stats = { generated: 0 };
      const gen = new StudentGenerator({ total: 250, batchSize: 100, delayMs: 0, highWaterMark: 200, stats, monitor: null });
      const items = [];
      for await (const s of gen) items.push(s);
      return { items, stats };
    };
    const first = await collect();
    const second = await collect();
    assert.equal(first.items.length, 250);
    assert.equal(first.stats.generated, 250);
    assert.deepEqual(first.items, second.items);
    assert.deepEqual(first.items.map((s) => s.id), Array.from({ length: 250 }, (_, i) => i + 1));
    assert.ok(first.items.every((s) => s.group === 'ББМО-01-23'));
  });
});

describe('Задание 5: полный запуск конвейера (интеграционный)', () => {
  let out;
  let csvLines;
  let errLines;

  before(async () => {
    const res = await run('stream-pipeline.js', { timeoutMs: 90000 });
    assert.equal(res.code, 0, res.stderr);
    out = res.stdout;
    csvLines = fs.readFileSync(file('students.csv'), 'utf8').split('\n').filter(Boolean);
    errLines = fs.readFileSync(file('errors.log'), 'utf8').split('\n').filter(Boolean);
  });

  it('генерирует 10000 студентов и показывает прогресс-бар до 100%', () => {
    assert.match(out, /Всего сгенерировано: 10000/);
    assert.match(out, /\[PROGRESS\] █{20} 100% \| 10000\/10000/);
  });

  it('счётчики согласованы: валидные + ошибки = 10000, записано = оставлено фильтром', () => {
    const validated = num(out, /Прошло валидацию: (\d+)/);
    const errors = num(out, /Ошибок: (\d+)/);
    const kept = num(out, /Оставлено фильтром[^:]*: (\d+)/);
    const rejected = num(out, /Отброшено фильтром: (\d+)/);
    assert.equal(validated + errors, 10000);
    assert.equal(num(out, /Обогащено: (\d+)/), validated);
    assert.equal(kept + rejected, validated);
    assert.equal(num(out, /Записано в CSV: (\d+)/), kept);
    assert.ok(errors > 0, 'в данных должны быть битые записи');
  });

  it('students.csv: заголовок, число строк и условие оценка > 3', () => {
    assert.equal(csvLines[0], CSV_HEADER);
    assert.equal(csvLines.length - 1, num(out, /Записано в CSV: (\d+)/));
    const rows = csvLines.slice(1).map((l) => l.split(','));
    assert.ok(rows.every((r) => r.length === 6));
    assert.ok(rows.every((r) => Number(r[4]) > 3));
    assert.ok(rows.every((r) => r[2] === 'ББМО-01-23'));
    assert.equal(new Set(rows.map((r) => r[0])).size, rows.length, 'id должны быть уникальными');
  });

  it('errors.log: по строке на каждую ошибку валидации, в нужном формате', () => {
    assert.equal(errLines.length, num(out, /Ошибок: (\d+)/));
    assert.match(errLines[0], /^\[\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\] \[ББМО-01-23\] Ошибка валидации: id=\d+, .+/);
  });

  it('backpressure: есть события переполнения Writable и drain', () => {
    assert.match(out, /\[BACKPRESSURE\] Writable переполнен на \d+-й записи/);
    assert.match(out, /\[BACKPRESSURE\] Пауза 50 мс/);
    assert.match(out, /\[DRAIN\]/);
  });

  it('таймаут: конвейер отменяется, потоки и файл закрыты, временный файл удалён', () => {
    assert.match(out, /Таймаут! Обработка отменена/);
    assert.match(out, /Все потоки корректно закрыты/);
    assert.match(out, /Ресурсы освобождены/);
    assert.equal(fs.existsSync(file('students-timeout.csv')), false);
  });

  it('async iterator даёт тот же результат, что и pipeline()', () => {
    assert.match(out, /\[ASYNC\]\s+Обработано: \d+ записей/);
    assert.match(out, /Результаты обоих подходов идентичны/);
  });
});
