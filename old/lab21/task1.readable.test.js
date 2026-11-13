'use strict';

const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const { run } = require('./helpers');

describe('Задание 1: Readable-поток (flowing-режим)', () => {
  let res;
  before(async () => {
    res = await run('stream-readable.js');
  });

  it('завершается без ошибок', () => {
    assert.equal(res.code, 0);
    assert.equal(res.stderr, '');
  });

  it('выводит заголовок демонстрации', () => {
    assert.match(res.stdout, /=== Демонстрация Readable-потока ===/);
  });

  it('отдаёт ровно 4 чанка в правильном порядке', () => {
    const chunks = [...res.stdout.matchAll(/\[CHUNK (\d)\] (.+)/g)];
    assert.equal(chunks.length, 4);
    assert.deepEqual(chunks.map((m) => m[1]), ['1', '2', '3', '4']);
    assert.equal(chunks[0][2], 'Группа: ББМО-01-23');
    assert.match(chunks[1][2], /^Студент: .+/);
    assert.equal(chunks[2][2], 'Лабораторная работа: №21');
    assert.equal(chunks[3][2], 'Тема: Потоки в Node.js');
  });

  it('данные приходят по частям (с паузами), а не одним блоком', () => {
    // 4 чанка × 150 мс задержки в _read()
    assert.ok(res.ms >= 500, `ожидалось >= 500 мс, получено ${res.ms} мс`);
  });

  it('событие end срабатывает после всех чанков', () => {
    const lastChunk = res.stdout.indexOf('[CHUNK 4]');
    const end = res.stdout.indexOf('[END] Поток завершён');
    assert.ok(end > lastChunk && lastChunk !== -1);
  });

  it('счётчики чанков и байт корректны', () => {
    const lines = [...res.stdout.matchAll(/\[CHUNK \d\] (.+)/g)].map((m) => m[1]);
    const expectedBytes = lines.reduce((sum, l) => sum + Buffer.byteLength(l, 'utf8'), 0);
    assert.match(res.stdout, /Всего получено чанков: 4/);
    assert.match(res.stdout, new RegExp(`Общий размер данных: ${expectedBytes} байт`));
  });
});
