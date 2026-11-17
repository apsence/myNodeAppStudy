'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { load, mysqlError } = require('./helpers');

const { maskEnvText } = load('lib/envFile');
const { classifyError, connectionHint } = load('lib/errors');

describe('Задание 1: .env без пароля (для скриншота)', () => {
  it('маскирует пароль, остальные параметры показывает как есть', () => {
    const lines = maskEnvText('# комментарий\nDB_HOST=localhost\nDB_PORT=3306\nDB_USER=student\nDB_PASSWORD=super_secret\nDB_NAME=bbmo_01_23\n');
    assert.deepEqual(lines, ['DB_HOST=localhost', 'DB_PORT=3306', 'DB_USER=student', 'DB_PASSWORD=********', 'DB_NAME=bbmo_01_23']);
    assert.ok(!lines.join('\n').includes('super_secret'));
  });

  it('маскирует любые *_SECRET / *_TOKEN / ROOT_PASSWORD, работает с CRLF', () => {
    const lines = maskEnvText('API_TOKEN=abc\r\nMYSQL_ROOT_PASSWORD=x y z\r\nPORT=3000');
    assert.deepEqual(lines, ['API_TOKEN=********', 'MYSQL_ROOT_PASSWORD=********', 'PORT=3000']);
  });

  it('пустые строки и комментарии отбрасываются', () => {
    assert.deepEqual(maskEnvText('\n# only comment\n\n'), []);
  });
});

describe('Задание 1: ошибки подключения', () => {
  it('ECONNREFUSED — сетевая ошибка с подсказкой про запуск сервера', () => {
    const err = mysqlError('ECONNREFUSED');
    assert.equal(classifyError(err).category, 'network');
    assert.match(connectionHint(err), /не запущен|DB_PORT/);
  });

  it('ER_ACCESS_DENIED_ERROR — ошибка аутентификации с подсказкой про .env', () => {
    const err = mysqlError('ER_ACCESS_DENIED_ERROR', "Access denied for user 'student'@'localhost'");
    const c = classifyError(err);
    assert.equal(c.category, 'auth');
    assert.equal(c.critical, false);
    assert.match(connectionHint(err), /DB_PASSWORD/);
  });

  it('ER_BAD_DB_ERROR подсказывает создать базу, неизвестные коды — без подсказки', () => {
    assert.match(connectionHint(mysqlError('ER_BAD_DB_ERROR')), /setup-db/);
    assert.equal(connectionHint(mysqlError('SOMETHING_ELSE')), null);
  });
});
