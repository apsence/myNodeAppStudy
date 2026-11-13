'use strict';

const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { run, file } = require('./helpers');

const reverseLine = (l) => [...l].reverse().join('');

describe('Задание 3: pipe() и pipeline()', () => {
  let res;
  before(async () => {
    res = await run('stream-pipe.js');
  });

  it('завершается без ошибок', () => {
    assert.equal(res.code, 0);
    assert.equal(res.stderr, '');
  });

  it('pipe(): output-pipe.txt побайтово совпадает с input.txt', () => {
    const a = fs.readFileSync(file('input.txt'));
    const b = fs.readFileSync(file('output-pipe.txt'));
    assert.ok(a.equals(b));
    assert.match(res.stdout, /output-pipe\.txt совпадает/);
  });

  it('pipeline(): output-pipeline.txt побайтово совпадает с input.txt', () => {
    const a = fs.readFileSync(file('input.txt'));
    const b = fs.readFileSync(file('output-pipeline.txt'));
    assert.ok(a.equals(b));
    assert.match(res.stdout, /output-pipeline\.txt совпадает/);
  });

  it('pipe() с ошибкой: ENOENT, а целевой поток остаётся открытым', () => {
    const section = res.stdout.split('=== Демонстрация pipeline() ===')[0].split('pipe() с ошибкой ===')[1];
    assert.match(section, /ENOENT/);
    assert.match(section, /ws\.destroyed\): false/);
    assert.match(section, /pipe\(\) не закрыл целевой поток/);
  });

  it('pipeline() с ошибкой: ENOENT, все потоки закрыты автоматически', () => {
    const section = res.stdout.split('pipeline() с ошибкой ===')[1].split('=== Цепочка потоков ===')[0];
    assert.match(section, /ENOENT/);
    assert.match(section, /rs\.destroyed\): true/);
    assert.match(section, /ws\.destroyed\): true/);
    assert.match(section, /Все потоки автоматически закрыты/);
  });

  it('временные файлы сценариев с ошибкой удалены', () => {
    assert.equal(fs.existsSync(file('output-pipe-error.txt')), false);
    assert.equal(fs.existsSync(file('output-pipeline-error.txt')), false);
  });

  it('цепочка: output-chain.txt = верхний регистр + строки задом наперёд', () => {
    const input = fs.readFileSync(file('input.txt'), 'utf8');
    const expected = input.split('\n').map((l) => reverseLine(l.toUpperCase())).join('\n');
    assert.equal(fs.readFileSync(file('output-chain.txt'), 'utf8'), expected);
    assert.match(res.stdout, /Обработка завершена/);
  });
});
