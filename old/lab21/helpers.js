'use strict';

const { spawn } = require('node:child_process');
const path = require('node:path');

const fs = require('node:fs');

// Корень проекта = папка, где лежит stream-readable.js.
// Работает и если тесты лежат в lab21/tests/, и если прямо в lab21/.
const ROOT = [__dirname, path.join(__dirname, '..')].find((dir) =>
  fs.existsSync(path.join(dir, 'stream-readable.js'))
);
if (!ROOT) throw new Error('Не найден stream-readable.js: положите тесты в папку lab21 или lab21/tests');
const file = (name) => path.join(ROOT, name);

/** Запускает скрипт задания в отдельном процессе и собирает его вывод. */
function run(script, { timeoutMs = 60000 } = {}) {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const child = spawn(process.execPath, [file(script)], { cwd: ROOT });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8').on('data', (d) => (stdout += d));
    child.stderr.setEncoding('utf8').on('data', (d) => (stderr += d));
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`${script}: превышено время ожидания ${timeoutMs} мс`));
    }, timeoutMs);
    child.on('error', reject);
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ stdout, stderr, code, ms: Date.now() - started });
    });
  });
}

/** Сколько раз подстрока встречается в тексте. */
const count = (text, sub) => text.split(sub).length - 1;

/** require() модуля из lib/ независимо от места, где лежит тест. */
const lib = (name) => require(path.join(ROOT, 'lib', name));

module.exports = { ROOT, file, lib, run, count };
