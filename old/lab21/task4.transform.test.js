'use strict';

const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const { run, count } = require('./helpers');

/** Возвращает часть вывода между двумя заголовками. */
const section = (text, from, to) => {
  const a = text.indexOf(from);
  const b = to ? text.indexOf(to, a + 1) : text.length;
  return text.slice(a, b);
};

describe('Задание 4: Transform-потоки, Object Mode, async iterator', () => {
  let out;
  before(async () => {
    const res = await run('stream-transform.js');
    assert.equal(res.code, 0);
    assert.equal(res.stderr, '');
    out = res.stdout;
  });

  it('UpperCaseTransform: верхний регистр и префикс [BBMO-01-23]', () => {
    const s = section(out, '=== Демонстрация Transform-потока', '=== Демонстрация JsonParserTransform');
    assert.ok(s.includes('Вход: "группа ббмо-01-23"'));
    assert.ok(s.includes('Выход: "[BBMO-01-23] ГРУППА ББМО-01-23"'));
    assert.ok(s.includes('Выход: "[BBMO-01-23] СТУДЕНТ ИВАНОВ"'));
  });

  it('JsonParserTransform: строки превращаются в объекты, мусор пропускается', () => {
    const s = section(out, '=== Демонстрация JsonParserTransform', '=== Демонстрация Object Mode');
    assert.equal(count(s, '[PARSED]'), 3);
    assert.match(s, /typeof: object/);
    assert.match(s, /некорректная строка: это не JSON/);
    assert.match(s, /Распознано объектов: 3, ошибочных строк: 1/);
  });

  it('Object Mode: Readable отдаёт 3 объекта', () => {
    const s = section(out, 'Все объекты из Readable:', 'После фильтрации');
    assert.equal(count(s, '[OBJECT]'), 3);
    assert.ok(s.includes("{ id: 2, name: 'Мария', group: 'ББМО-02-23' }"));
  });

  it('FilterTransform: остаются только студенты ББМО-01-23', () => {
    const s = section(out, 'После фильтрации', '=== Демонстрация async iterator');
    assert.equal(count(s, '[OBJECT]'), 2);
    assert.ok(!s.includes('ББМО-02-23'));
    assert.match(s, /Прошло: 2, отброшено: 1/);
  });

  it('async iterator: for await получает 3 чанка по порядку и завершается', () => {
    const s = section(out, '=== Демонстрация async iterator', 'Сравнение: то же через pipe()');
    assert.ok(s.includes('[ASYNC] Получен чанк 1: "Данные 1"'));
    assert.ok(s.includes('[ASYNC] Получен чанк 3: "Данные 3"'));
    assert.ok(s.includes('[ASYNC] Поток завершён'));
  });

  it('async iterator: ошибка источника перехватывается обычным try/catch', () => {
    assert.match(out, /Перехвачено: сбой источника на третьем чанке/);
  });

  it('цепочка: 10 строк → 7 прошли фильтр, 3 отброшены, стадии преобразования видны', () => {
    const s = section(out, '=== Цепочка Transform');
    assert.match(s, /Обработано 10 строк, прошло фильтр 7, отброшено 3, записано 7/);
    assert.ok(s.includes("[1 читаем     ] 'студент 1 группа ббмо-01-23'"));
    assert.ok(s.includes("[2 UpperCase  ] '[BBMO-01-23] СТУДЕНТ 1 ГРУППА ББМО-01-23'"));
  });
});
