'use strict';

const chalk = require('chalk');

/**
 * Принцип разделения потоков:
 *  - logger.data()    -> stdout: РЕЗУЛЬТАТ работы программы (то, что можно
 *                        перенаправить в файл/конвейер, "Silence is Golden").
 *  - logger.success()
 *    logger.info()
 *    logger.warn()
 *    logger.error()   -> stderr: логи, статусы, предупреждения и ошибки.
 *                        Видны в терминале даже при `> file` для stdout.
 *
 * Цвет применяется только если соответствующий поток подключён к TTY
 * (process.stdout.isTTY / process.stderr.isTTY) — при редиректе в файл
 * управляющие ANSI-коды не добавляются.
 */

function colorize(stream, text, colorFn) {
  return stream && stream.isTTY ? colorFn(text) : text;
}

function data(msg) {
  process.stdout.write(`${msg}\n`);
}

function success(msg) {
  process.stderr.write(`${colorize(process.stderr, `✔ ${msg}`, chalk.green)}\n`);
}

function info(msg) {
  process.stderr.write(`${colorize(process.stderr, `ℹ ${msg}`, chalk.blue)}\n`);
}

function warn(msg) {
  process.stderr.write(`${colorize(process.stderr, `⚠ ${msg}`, chalk.yellow)}\n`);
}

function error(msg) {
  process.stderr.write(`${colorize(process.stderr, `✖ Ошибка: ${msg}`, chalk.red)}\n`);
}

function plain(msg) {
  process.stderr.write(`${msg}\n`);
}

function verbose(msg, isVerbose) {
  if (!isVerbose) return;
  process.stderr.write(`${colorize(process.stderr, `[VERBOSE] ${msg}`, chalk.gray)}\n`);
}

module.exports = { data, success, info, warn, error, plain, verbose };
