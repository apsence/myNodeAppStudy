'use strict';

/**
 * Задание 3 (продвинутый уровень)
 * pipe() и pipeline(): копирование файла, обработка ошибок,
 * автоматическая очистка ресурсов, цепочка Transform-потоков.
 */

const fs = require('node:fs');
const path = require('node:path');
const { Transform, pipeline } = require('node:stream');

const DIR = __dirname;
const file = (name) => path.join(DIR, name);

const INPUT = file('input.txt');
const MISSING = 'missing.txt'; // относительный путь — ошибка читается лучше

// ---------- вспомогательные функции ----------

function ensureInput() {
  if (fs.existsSync(INPUT)) return;
  const lines = [
    'Группа: ББМО-01-23',
    'Лабораторная работа №21: потоки в Node.js',
    'Readable, Writable, Transform и Duplex — четыре типа потоков.',
    'pipe() соединяет потоки, но не очищает ресурсы при ошибке.',
    'pipeline() делает это автоматически и даёт единый колбэк.',
    'Backpressure — механизм согласования скорости читателя и писателя.',
  ];
  let text = '';
  while (Buffer.byteLength(text) < 1024) text += lines.join('\n') + '\n';
  fs.writeFileSync(INPUT, text);
}

const size = (p) => fs.statSync(p).size;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rm = (p) => fs.rmSync(p, { force: true });

function head(p, n = 3) {
  const lines = fs.readFileSync(p, 'utf8').split('\n').filter(Boolean);
  return lines.slice(0, n).map((l) => '    ' + l).join('\n');
}

// ---------- Transform-потоки для цепочки ----------

class UpperCase extends Transform {
  constructor() {
    // decodeStrings: false — строки приходят как есть;
    // encoding: 'utf8' — на выходе тоже строки (многобайтные символы не рвутся)
    super({ decodeStrings: false, encoding: 'utf8' });
  }
  _transform(chunk, enc, cb) {
    cb(null, chunk.toString().toUpperCase());
  }
}

/** Разворачивает каждую строку задом наперёд (с буферизацией неполной строки). */
class ReverseLines extends Transform {
  constructor() {
    super({ decodeStrings: false, encoding: 'utf8' });
    this.rest = '';
  }
  _transform(chunk, enc, cb) {
    const parts = (this.rest + chunk.toString()).split('\n');
    this.rest = parts.pop(); // последняя часть может быть неполной
    cb(null, parts.map((l) => [...l].reverse().join('')).join('\n') + (parts.length ? '\n' : ''));
  }
  _flush(cb) {
    cb(null, [...this.rest].reverse().join(''));
  }
}

// ---------- демонстрации ----------

function pipeSuccess() {
  console.log('=== Демонстрация pipe() ===');
  const out = file('output-pipe.txt');
  console.log('Чтение: input.txt');
  console.log('Запись: output-pipe.txt');
  return new Promise((resolve) => {
    const rs = fs.createReadStream(INPUT);
    const ws = fs.createWriteStream(out);
    rs.on('error', (e) => console.log(`✖ Ошибка чтения: ${e.message}`));
    ws.on('error', (e) => console.log(`✖ Ошибка записи: ${e.message}`));
    ws.on('finish', () => {
      console.log('✔ Копирование завершено');
      console.log(`Размер: ${size(out)} байт`);
      const same = fs.readFileSync(INPUT).equals(fs.readFileSync(out));
      console.log(same ? '✔ Содержимое input.txt и output-pipe.txt совпадает' : '✖ Файлы различаются!');
      resolve();
    });
    rs.pipe(ws);
  });
}

function pipeError() {
  console.log('\n=== Демонстрация pipe() с ошибкой ===');
  const out = file('output-pipe-error.txt');
  console.log('Чтение: missing.txt');
  return new Promise((resolve) => {
    const rs = fs.createReadStream(MISSING);
    const ws = fs.createWriteStream(out);
    rs.on('error', async (err) => {
      console.log(`✖ Ошибка: ${err.message}`);
      await sleep(100); // даём время убедиться, что pipe() ничего не сделает
      console.log(`  Источник закрыт (rs.destroyed): ${rs.destroyed}`);
      console.log(`  Приёмник закрыт (ws.destroyed): ${ws.destroyed}, завершён (ws.writableEnded): ${ws.writableEnded}`);
      if (!ws.destroyed) {
        console.log('⚠ Внимание: pipe() не закрыл целевой поток!');
        console.log('⚠ Файловый дескриптор остаётся открытым — возможна утечка ресурсов.');
      }
      ws.destroy(); // чистим вручную, чтобы не оставлять утечку в самом скрипте
      await sleep(50);
      rm(out);
      resolve();
    });
    rs.pipe(ws);
  });
}

function pipelineSuccess() {
  console.log('\n=== Демонстрация pipeline() ===');
  const out = file('output-pipeline.txt');
  console.log('Чтение: input.txt');
  console.log('Запись: output-pipeline.txt');
  return new Promise((resolve) => {
    pipeline(fs.createReadStream(INPUT), fs.createWriteStream(out), (err) => {
      if (err) {
        console.log(`✖ Ошибка: ${err.message}`);
      } else {
        console.log('✔ Копирование завершено');
        console.log(`Размер: ${size(out)} байт`);
        const same = fs.readFileSync(INPUT).equals(fs.readFileSync(out));
        console.log(same ? '✔ Содержимое input.txt и output-pipeline.txt совпадает' : '✖ Файлы различаются!');
      }
      resolve();
    });
  });
}

function pipelineError() {
  console.log('\n=== Демонстрация pipeline() с ошибкой ===');
  const out = file('output-pipeline-error.txt');
  console.log('Чтение: missing.txt');
  return new Promise((resolve) => {
    const rs = fs.createReadStream(MISSING);
    const ws = fs.createWriteStream(out);
    pipeline(rs, ws, async (err) => {
      console.log(`✖ Ошибка: ${err.message}`);
      await sleep(100);
      console.log(`  Источник закрыт (rs.destroyed): ${rs.destroyed}`);
      console.log(`  Приёмник закрыт (ws.destroyed): ${ws.destroyed}`);
      if (rs.destroyed && ws.destroyed) {
        console.log('✔ Все потоки автоматически закрыты');
        console.log('✔ Утечек нет');
      }
      rm(out);
      resolve();
    });
  });
}

function chain() {
  console.log('\n=== Цепочка потоков ===');
  const out = file('output-chain.txt');
  console.log('input.txt → uppercase → reverse → output-chain.txt');
  return new Promise((resolve) => {
    const source = fs.createReadStream(INPUT, { encoding: 'utf8' });
    const dest = fs.createWriteStream(out);
    dest.on('finish', () => {
      console.log('✔ Обработка завершена');
      resolve();
    });
    // Классическая цепочка pipe(). Ошибку нужно слушать на КАЖДОМ потоке отдельно.
    const t1 = new UpperCase();
    const t2 = new ReverseLines();
    for (const s of [source, t1, t2, dest]) s.on('error', (e) => console.log(`✖ ${e.message}`));
    source.pipe(t1).pipe(t2).pipe(dest);
  });
}

async function main() {
  ensureInput();
  await pipeSuccess();
  await pipeError();
  await pipelineSuccess();
  await pipelineError();
  await chain();

  console.log('\n=== Содержимое выходных файлов (первые 3 строки) ===');
  for (const name of ['output-pipe.txt', 'output-pipeline.txt', 'output-chain.txt']) {
    console.log(`--- ${name} (${size(file(name))} байт) ---`);
    console.log(head(file(name)));
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
