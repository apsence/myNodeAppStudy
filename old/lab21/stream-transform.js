'use strict';

/**
 * Задание 4 (сложный уровень)
 * Transform-потоки, Object Mode, асинхронные итераторы.
 */

const { Readable, Writable, Transform } = require('node:stream');
const { pipeline } = require('node:stream/promises');
const { StringDecoder } = require('node:string_decoder');
const { inspect } = require('node:util');

const GROUP = 'ББМО-01-23';
const PREFIX = '[BBMO-01-23]';
const show = (obj) => inspect(obj, { breakLength: Infinity });

// ---------- Transform-потоки ----------

/** Строка → "[BBMO-01-23] СТРОКА В ВЕРХНЕМ РЕГИСТРЕ" */
class UpperCaseTransform extends Transform {
  constructor(options) {
    super({ objectMode: true, ...options }); // каждая строка — отдельное сообщение
  }
  _transform(line, encoding, callback) {
    callback(null, `${PREFIX} ${String(line).toUpperCase()}`);
  }
}

/** Байты/строки → отдельные строки (по символу \n). Нужен перед JsonParser. */
class LineSplitTransform extends Transform {
  constructor() {
    super({ readableObjectMode: true }); // на входе байты, на выходе — строки-сообщения
    this.decoder = new StringDecoder('utf8');
    this.rest = '';
  }
  _transform(chunk, encoding, callback) {
    const parts = (this.rest + this.decoder.write(chunk)).split('\n');
    this.rest = parts.pop(); // неполная строка ждёт следующего чанка
    for (const line of parts) this.push(line);
    callback();
  }
  _flush(callback) {
    const tail = this.rest + this.decoder.end();
    if (tail) this.push(tail);
    callback();
  }
}

/** Строка с JSON → объект. Работает в objectMode. */
class JsonParserTransform extends Transform {
  constructor() {
    super({ objectMode: true });
    this.parsed = 0;
    this.failed = 0;
  }
  _transform(line, encoding, callback) {
    const text = String(line).trim();
    if (!text) return callback();
    try {
      this.push(JSON.parse(text));
      this.parsed++;
    } catch (err) {
      this.failed++;
      console.log(`  [JSON] ⚠ пропущена некорректная строка: ${text}`);
    }
    callback();
  }
}

/** Пропускает только объекты/значения, для которых predicate вернул true. */
class FilterTransform extends Transform {
  constructor(predicate) {
    super({ objectMode: true });
    this.predicate = predicate;
    this.passed = 0;
    this.dropped = 0;
  }
  _transform(item, encoding, callback) {
    if (this.predicate(item)) {
      this.passed++;
      callback(null, item);
    } else {
      this.dropped++;
      callback(); // ничего не передаём дальше
    }
  }
}

/** «Прозрачный» поток для наблюдения: печатает первые N элементов, ничего не меняя. */
class TapTransform extends Transform {
  constructor(label, limit = 3) {
    super({ objectMode: true });
    this.label = label;
    this.limit = limit;
    this.seen = 0;
  }
  _transform(item, encoding, callback) {
    if (this.seen++ < this.limit) console.log(`  [${this.label}] ${show(item)}`);
    callback(null, item);
  }
}

/** Writable в objectMode: принимает объекты и вызывает handler. */
class ObjectSink extends Writable {
  constructor(handler) {
    super({ objectMode: true });
    this.handler = handler;
    this.count = 0;
  }
  _write(item, encoding, callback) {
    this.count++;
    this.handler(item);
    callback();
  }
}

/** Readable в objectMode: генерирует объекты, а не строки/Buffer. */
class StudentObjectReadable extends Readable {
  constructor(students) {
    super({ objectMode: true });
    this.students = students;
    this.i = 0;
  }
  _read() {
    this.push(this.i < this.students.length ? this.students[this.i++] : null);
  }
}

// ---------- демонстрации ----------

async function demoUpperCase() {
  console.log('=== Демонстрация Transform-потока (UpperCaseTransform) ===');
  const inputs = ['группа ббмо-01-23', 'студент иванов', 'лабораторная работа №21'];
  let i = 0;
  await pipeline(
    Readable.from(inputs),
    new UpperCaseTransform(),
    new ObjectSink((out) => {
      console.log(`Вход: "${inputs[i++]}"`);
      console.log(`Выход: "${out}"`);
    })
  );
}

async function demoJsonParser() {
  console.log('\n=== Демонстрация JsonParserTransform ===');
  // Чанки специально «рвут» JSON посередине — LineSplitTransform собирает строки целиком
  const rawChunks = [
    '{"id":1,"name":"Иван","gro',
    'up":"ББМО-01-23"}\n{"id":2,"name":"Мария","group":"ББМО-02-23"}\n',
    'это не JSON\n{"id":3,"name":"Петр","group":"ББМО-01-23"}\n',
  ];
  const parser = new JsonParserTransform();
  await pipeline(
    Readable.from(rawChunks),
    new LineSplitTransform(),
    parser,
    new ObjectSink((obj) => console.log(`  [PARSED] ${show(obj)} (typeof: ${typeof obj})`))
  );
  console.log(`Распознано объектов: ${parser.parsed}, ошибочных строк: ${parser.failed}`);
}

async function demoObjectMode() {
  console.log('\n=== Демонстрация Object Mode и FilterTransform ===');
  const students = [
    { id: 1, name: 'Иван', group: 'ББМО-01-23' },
    { id: 2, name: 'Мария', group: 'ББМО-02-23' },
    { id: 3, name: 'Петр', group: 'ББМО-01-23' },
  ];
  console.log('Все объекты из Readable:');
  await pipeline(
    new StudentObjectReadable(students),
    new ObjectSink((s) => console.log(`[OBJECT] ${show(s)}`))
  );

  console.log(`После фильтрации (только ${GROUP}):`);
  const filter = new FilterTransform((s) => s.group === GROUP);
  await pipeline(
    new StudentObjectReadable(students),
    filter,
    new ObjectSink((s) => console.log(`[OBJECT] ${show(s)}`))
  );
  console.log(`Прошло: ${filter.passed}, отброшено: ${filter.dropped}`);
}

async function demoAsyncIterator() {
  console.log('\n=== Демонстрация async iterator ===');
  const data = ['Данные 1', 'Данные 2', 'Данные 3'];

  // 1) for await — императивный стиль
  let n = 0;
  for await (const chunk of Readable.from(data)) {
    console.log(`[ASYNC] Получен чанк ${++n}: "${chunk}"`);
  }
  console.log('[ASYNC] Поток завершён');

  // 2) то же самое через события/pipe — декларативный стиль
  console.log('Сравнение: то же через pipe() и события');
  await new Promise((resolve, reject) => {
    let k = 0;
    Readable.from(data)
      .on('error', reject)
      .pipe(new ObjectSink((chunk) => console.log(`[PIPE]  Получен чанк ${++k}: "${chunk}"`)))
      .on('error', reject)
      .on('finish', resolve);
  });

  // 3) Главное отличие — обработка ошибок
  console.log('Обработка ошибки в for await (обычный try/catch):');
  async function* failing() {
    yield 'Данные 1';
    yield 'Данные 2';
    throw new Error('сбой источника на третьем чанке');
  }
  try {
    for await (const chunk of Readable.from(failing())) console.log(`[ASYNC] "${chunk}"`);
  } catch (err) {
    console.log(`[ASYNC] ✖ Перехвачено: ${err.message}`);
  }
  console.log('  for await: естественный поток управления, break/return сами уничтожают поток,');
  console.log('  pipe(): компактен, но ошибки нужно слушать на каждом потоке отдельно.');
}

async function demoChain() {
  console.log('\n=== Цепочка Transform: readable → upperCase → filter → writable ===');
  const lines = [];
  for (let i = 1; i <= 10; i++) {
    const group = i <= 7 ? 'ббмо-01-23' : 'ббмо-02-23'; // 7 из 10 — наша группа
    lines.push(`студент ${i} группа ${group}`);
  }

  const upper = new UpperCaseTransform();
  const filter = new FilterTransform((line) => line.includes(GROUP));
  const written = [];

  console.log('Читаем → UpperCase → Filter → Записываем');
  await pipeline(
    Readable.from(lines),
    new TapTransform('1 читаем     '),
    upper,
    new TapTransform('2 UpperCase  '),
    filter,
    new TapTransform('3 Filter     '),
    new ObjectSink((line) => written.push(line))
  );
  console.log(
    `✔ Обработано ${lines.length} строк, прошло фильтр ${filter.passed}, отброшено ${filter.dropped}, записано ${written.length}`
  );
}

async function main() {
  await demoUpperCase();
  await demoJsonParser();
  await demoObjectMode();
  await demoAsyncIterator();
  await demoChain();
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
