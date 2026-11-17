'use strict';

const fs = require('node:fs');
const path = require('node:path');

// Ошибки отката, которые безопасно игнорировать (объект уже удалён):
// 1091 — нет такого ключа/FK, 1146 — нет таблицы, 1051 — неизвестная таблица
const IGNORABLE_DOWN_ERRNO = new Set([1091, 1146, 1051]);

/** Делит файл миграции на секции "-- migrate:up" и "-- migrate:down". */
function parseMigration(sql) {
  const up = [];
  const down = [];
  let target = null;
  for (const rawLine of String(sql).split(/\r?\n/)) {
    const marker = rawLine.trim().match(/^--\s*migrate:(up|down)\s*$/i);
    if (marker) { target = marker[1].toLowerCase() === 'up' ? up : down; continue; }
    if (target) target.push(rawLine);
  }
  return { up: up.join('\n').trim(), down: down.join('\n').trim() };
}

/** Делит SQL на отдельные выражения по ';' (строки-комментарии отбрасываются). */
function splitStatements(sql) {
  return String(sql)
    .split(/\r?\n/)
    .filter((l) => !l.trim().startsWith('--'))
    .join('\n')
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean);
}

const FILE_RE = /^(\d{3})_[a-z0-9_]+\.sql$/i;

function listMigrationFiles(dir) {
  return fs
    .readdirSync(dir)
    .filter((f) => FILE_RE.test(f))
    .sort()
    .map((f) => ({ name: f, version: f.slice(0, 3), path: path.join(dir, f) }));
}

/** Применение/откат миграций. conn — одно соединение mysql2/promise (не пул). */
class Migrator {
  constructor({ conn, dir, logger = null }) {
    this.conn = conn;
    this.dir = dir;
    this.logger = logger;
  }

  _log(msg) { if (this.logger) this.logger.info(msg); }

  async ensureTable() {
    await this.conn.query(`CREATE TABLE IF NOT EXISTS migrations (
      id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uq_migrations_name (name)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
  }

  async applied() {
    await this.ensureTable();
    const [rows] = await this.conn.query('SELECT name, applied_at FROM migrations ORDER BY name');
    return rows;
  }

  async status() {
    const done = new Map((await this.applied()).map((r) => [r.name, r.applied_at]));
    return listMigrationFiles(this.dir).map((f) => ({ name: f.name, applied: done.has(f.name), applied_at: done.get(f.name) || null }));
  }

  /** Применяет все ещё не применённые миграции по порядку. Возвращает список применённых имён. */
  async up() {
    const done = new Set((await this.applied()).map((r) => r.name));
    const appliedNow = [];
    for (const file of listMigrationFiles(this.dir)) {
      if (done.has(file.name)) continue;
      const { up } = parseMigration(fs.readFileSync(file.path, 'utf8'));
      if (!up) throw new Error(`В ${file.name} нет секции "-- migrate:up"`);
      this._log(`Применяю миграцию ${file.name}...`);
      for (const statement of splitStatements(up)) {
        try {
          await this.conn.query(statement);
        } catch (err) {
          err.migration = file.name;
          throw err;
        }
      }
      await this.conn.query('INSERT INTO migrations (name) VALUES (?)', [file.name]);
      appliedNow.push(file.name);
    }
    return appliedNow;
  }

  /** Откатывает последние `steps` применённых миграций (по умолчанию одну). */
  async rollback(steps = 1) {
    const done = (await this.applied()).map((r) => r.name).sort().reverse().slice(0, steps);
    const files = new Map(listMigrationFiles(this.dir).map((f) => [f.name, f]));
    const rolledBack = [];
    for (const name of done) {
      const file = files.get(name);
      if (!file) throw new Error(`Файл миграции ${name} не найден — откат невозможен`);
      const { down } = parseMigration(fs.readFileSync(file.path, 'utf8'));
      if (!down) throw new Error(`В ${name} нет секции "-- migrate:down"`);
      this._log(`Откатываю миграцию ${name}...`);
      for (const statement of splitStatements(down)) {
        try {
          await this.conn.query(statement);
        } catch (err) {
          if (!IGNORABLE_DOWN_ERRNO.has(err.errno)) throw err;
        }
      }
      await this.conn.query('DELETE FROM migrations WHERE name = ?', [name]);
      rolledBack.push(name);
    }
    return rolledBack;
  }
}

module.exports = { Migrator, parseMigration, splitStatements, listMigrationFiles };
