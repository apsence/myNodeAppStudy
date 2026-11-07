'use strict';

const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const { run, count } = require('./helpers');

describe('Задание 2: Writable-поток и backpressure', () => {
  let res;
  let small; // секция с highWaterMark: 16
  let large; // секция с highWaterMark: 1024
  let greedy; // запись без учёта backpressure

  before(async () => {
    res = await run('stream-writable.js');
    const iLarge = res.stdout.indexOf('Большой буфер');
    const iGreedy = res.stdout.indexOf('Игнорирование backpressure');
    small = res.stdout.slice(0, iLarge);
    large = res.stdout.slice(iLarge, iGreedy);
    greedy = res.stdout.slice(iGreedy);
  });

  it('завершается без ошибок', () => {
    assert.equal(res.code, 0);
    assert.equal(res.stderr, '');
  });

  it('метод _write выводит все 4 чанка с префиксом [WRITE]', () => {
    for (const text of ['Группа: ББМО-01-23', 'Лабораторная работа: №21', 'Тема: Потоки в Node.js']) {
      assert.ok(small.includes(`[WRITE] ${text}`), `нет строки [WRITE] ${text}`);
    }
    assert.equal(count(small, '[WRITE]'), 4);
  });

  it('при highWaterMark: 16 write() возвращает false (буфер переполнен)', () => {
    assert.ok(count(small, 'write() вернул: false') >= 1);
    assert.match(small, /буфер переполнен/);
  });

  it('после переполнения приходит событие drain, запись продолжается', () => {
    assert.ok(count(small, '[DRAIN]') >= 1);
    assert.equal(count(small, '[DRAIN]'), count(small, 'write() вернул: false'));
  });

  it('событие finish срабатывает один раз после записи всех чанков', () => {
    assert.equal(count(small, '[FINISH]'), 1);
    assert.match(small, /Всего записано: 4 чанка/);
    assert.ok(small.indexOf('[FINISH]') > small.lastIndexOf('[WRITE]'));
  });

  it('при большом буфере (1024) write() всегда true и drain не нужен', () => {
    assert.equal(count(large, 'write() вернул: true'), 4);
    assert.equal(count(large, 'write() вернул: false'), 0);
    assert.equal(count(large, '[DRAIN]'), 0);
    assert.equal(count(large, '[FINISH]'), 1);
  });

  it('без проверки write() буфер разрастается выше highWaterMark', () => {
    const m = greedy.match(/накопилось до (\d+) байт при лимите (\d+)/);
    assert.ok(m, 'нет строки про переполнение буфера');
    assert.ok(Number(m[1]) > Number(m[2]));
  });
});
