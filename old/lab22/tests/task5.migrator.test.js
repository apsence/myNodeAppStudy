'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { ROOT, load, norm, mysqlError } = require('./helpers');

const { Migrator, parseMigration, splitStatements, listMigrationFiles } = load('lib/migrator');

const MIGRATIONS = path.join(ROOT, 'migrations');

describe('Задание 5: файлы миграций', () => {
  it('001_create_students.sql и 002_create_groups.sql на месте, порядок по номеру', () => {
    assert.deepEqual(listMigrationFiles(MIGRATIONS).map((f) => f.name), ['001_create_students.sql', '002_create_groups.sql']);
  });

  it('в каждой миграции есть секции up и down', () => {
    for (const f of listMigrationFiles(MIGRATIONS)) {
      const { up, down } = parseMigration(fs.readFileSync(f.path, 'utf8'));
      assert.ok(up.length > 0, `${f.name}: нет up`);
      assert.ok(down.length > 0, `${f.name}: нет down`);
    }
  });

  it('groups — зарезервированное слово MySQL 8: в миграции имя только в обратных кавычках', () => {
    const sql = fs.readFileSync(path.join(MIGRATIONS, '002_create_groups.sql'), 'utf8');
    const code = sql.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n');
    assert.ok(!/(?<!`)\bgroups\b(?!`)/.test(code), 'найдено имя groups без кавычек');
    assert.match(code, /`groups`/);
    assert.match(code, /FOREIGN KEY \(group_name\) REFERENCES `groups` \(name\)/);
  });

  it('002 добавляет внешний ключ после переноса существующих групп студентов (не ломает данные заданий 2–4)', () => {
    const { up } = parseMigration(fs.readFileSync(path.join(MIGRATIONS, '002_create_groups.sql'), 'utf8'));
    const statements = splitStatements(up).map(norm);
    const backfill = statements.findIndex((s) => /^INSERT IGNORE INTO `groups` \(name\) SELECT DISTINCT group_name FROM students/.test(s));
    const fk = statements.findIndex((s) => /^ALTER TABLE students ADD CONSTRAINT fk_students_group/.test(s));
    assert.ok(backfill >= 0 && fk > backfill, 'перенос групп должен идти до добавления внешнего ключа');
  });
});

describe('Задание 5: разбор миграций', () => {
  it('parseMigration делит файл на up и down', () => {
    const r = parseMigration('-- migrate:up\nCREATE TABLE a (id INT);\n\n-- migrate:down\nDROP TABLE a;\n');
    assert.equal(r.up, 'CREATE TABLE a (id INT);');
    assert.equal(r.down, 'DROP TABLE a;');
  });

  it('splitStatements: несколько выражений, комментарии пропускаются', () => {
    assert.deepEqual(splitStatements('-- x\nA;\nB\nC;\n\n;'), ['A', 'B\nC']);
  });
});

/** Фейковое соединение: хранит таблицу migrations в памяти и журналирует выражения. */
function fakeConn({ failOn = null, failDownErrno = null } = {}) {
  const applied = [];
  const log = [];
  return {
    applied, log,
    async query(sql, params = []) {
      const s = norm(sql);
      log.push(s);
      if (s.startsWith('CREATE TABLE IF NOT EXISTS migrations')) return [{}];
      if (s.startsWith('SELECT name, applied_at FROM migrations')) return [applied.map((name) => ({ name, applied_at: new Date(0) })).sort((a, b) => a.name.localeCompare(b.name))];
      if (s.startsWith('INSERT INTO migrations')) { applied.push(params[0]); return [{}]; }
      if (s.startsWith('DELETE FROM migrations')) { applied.splice(applied.indexOf(params[0]), 1); return [{}]; }
      if (failOn && s.includes(failOn)) throw mysqlError('ER_PARSE_ERROR', 'syntax', { errno: 1064 });
      if (failDownErrno && /^(ALTER TABLE students DROP FOREIGN KEY|DROP TABLE)/.test(s)) throw mysqlError('X', 'gone', { errno: failDownErrno });
      return [{}];
    },
  };
}

describe('Задание 5: Migrator (npm run migrate / migrate:rollback)', () => {
  it('up(): применяет миграции по порядку и записывает их в таблицу migrations', async () => {
    const conn = fakeConn();
    const applied = await new Migrator({ conn, dir: MIGRATIONS }).up();
    assert.deepEqual(applied, ['001_create_students.sql', '002_create_groups.sql']);
    assert.deepEqual(conn.applied, ['001_create_students.sql', '002_create_groups.sql']);
    assert.ok(conn.log.findIndex((s) => s.startsWith('CREATE TABLE IF NOT EXISTS students')) < conn.log.findIndex((s) => s.startsWith('CREATE TABLE IF NOT EXISTS `groups`')));
  });

  it('повторный up(): ничего не применяет (идемпотентность)', async () => {
    const conn = fakeConn();
    const m = new Migrator({ conn, dir: MIGRATIONS });
    await m.up();
    const before = conn.log.length;
    assert.deepEqual(await m.up(), []);
    assert.ok(!conn.log.slice(before).some((s) => s.startsWith('CREATE TABLE IF NOT EXISTS students')));
  });

  it('ошибка в миграции: останавливается, не записывает её как применённую, добавляет имя файла к ошибке', async () => {
    const conn = fakeConn({ failOn: 'CREATE TABLE IF NOT EXISTS `groups`' });
    await assert.rejects(new Migrator({ conn, dir: MIGRATIONS }).up(), (e) => e.migration === '002_create_groups.sql');
    assert.deepEqual(conn.applied, ['001_create_students.sql']);
  });

  it('rollback(): откатывает последнюю миграцию (по умолчанию одну) и удаляет запись о ней', async () => {
    const conn = fakeConn();
    const m = new Migrator({ conn, dir: MIGRATIONS });
    await m.up();
    assert.deepEqual(await m.rollback(), ['002_create_groups.sql']);
    assert.deepEqual(conn.applied, ['001_create_students.sql']);
    assert.ok(conn.log.some((s) => s === 'DROP TABLE IF EXISTS `groups`'));
  });

  it('rollback(steps): откат в обратном порядке', async () => {
    const conn = fakeConn();
    const m = new Migrator({ conn, dir: MIGRATIONS });
    await m.up();
    assert.deepEqual(await m.rollback(5), ['002_create_groups.sql', '001_create_students.sql']);
    assert.deepEqual(conn.applied, []);
  });

  it('rollback терпит «уже удалено» (errno 1091/1146), но не проглатывает другие ошибки', async () => {
    const lenient = fakeConn({ failDownErrno: 1091 });
    const m1 = new Migrator({ conn: lenient, dir: MIGRATIONS });
    await m1.up();
    assert.deepEqual(await m1.rollback(), ['002_create_groups.sql']);

    const strict = fakeConn({ failDownErrno: 1064 });
    const m2 = new Migrator({ conn: strict, dir: MIGRATIONS });
    await m2.up();
    await assert.rejects(m2.rollback(), (e) => e.errno === 1064);
  });

  it('status(): показывает применённые и ожидающие миграции', async () => {
    const conn = fakeConn();
    const m = new Migrator({ conn, dir: MIGRATIONS });
    await m.up();
    await m.rollback();
    assert.deepEqual((await m.status()).map((s) => [s.name, s.applied]), [['001_create_students.sql', true], ['002_create_groups.sql', false]]);
  });
});
