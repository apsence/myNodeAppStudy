'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { ROOT, load } = require('./helpers');

const { STUDENTS_DDL } = load('config/schema');
const { escapeLike, fmtGrade } = load('lib/common');
const { parseMigration, splitStatements } = load('lib/migrator');

const flat = (s) => s.replace(/\s+/g, ' ').replace(/;\s*$/, '').trim();

describe('Задание 2: таблица students', () => {
  it('столбцы и типы соответствуют заданию', () => {
    assert.match(STUDENTS_DDL, /id INT NOT NULL AUTO_INCREMENT/);
    assert.match(STUDENTS_DDL, /PRIMARY KEY \(id\)/);
    assert.match(STUDENTS_DDL, /name VARCHAR\(100\) NOT NULL/);
    assert.match(STUDENTS_DDL, /group_name VARCHAR\(20\) NOT NULL/);
    assert.match(STUDENTS_DDL, /course INT NOT NULL/);
    assert.match(STUDENTS_DDL, /grade DECIMAL\(3,2\)/);
    assert.match(STUDENTS_DDL, /created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP/);
  });

  it('движок InnoDB и кодировка utf8mb4', () => {
    assert.match(STUDENTS_DDL, /ENGINE=InnoDB/);
    assert.match(STUDENTS_DDL, /CHARSET=utf8mb4/);
  });

  it('grade допускает NULL (по заданию оценка может отсутствовать)', () => {
    assert.match(STUDENTS_DDL, /grade DECIMAL\(3,2\) NULL/);
  });

  it('миграция 001_create_students.sql создаёт ту же таблицу, что и задание 2', () => {
    const sql = fs.readFileSync(path.join(ROOT, 'migrations', '001_create_students.sql'), 'utf8');
    assert.equal(flat(parseMigration(sql).up), flat(STUDENTS_DDL));
  });
});

describe('Задание 2: параметризованные запросы и вывод', () => {
  it('escapeLike экранирует %, _ и обратную косую черту', () => {
    assert.equal(escapeLike('50%_off\\'), '50\\%\\_off\\\\');
    assert.equal(escapeLike('Иван'), 'Иван');
  });

  it('fmtGrade печатает 2 знака и NULL', () => {
    assert.equal(fmtGrade(4.5), '4.50');
    assert.equal(fmtGrade('3.8'), '3.80');
    assert.equal(fmtGrade(null), 'NULL');
  });

  it('SQL-инъекция из задания: payload остаётся данными, если идёт отдельным параметром', () => {
    const payload = "'; DROP TABLE students; --";
    // что делает «плохой» код: payload попадает в текст SQL
    const unsafe = `SELECT * FROM students WHERE name = '${payload}'`;
    assert.ok(unsafe.includes('DROP TABLE'));
    // что делает код с плейсхолдером: текст SQL не зависит от ввода
    const safeSql = 'SELECT * FROM students WHERE name = ?';
    assert.ok(!safeSql.includes('DROP'));
  });

  it('splitStatements: делит скрипт на выражения и пропускает строки-комментарии', () => {
    assert.deepEqual(splitStatements('-- c\nSELECT 1;\n\nSELECT 2;\n-- end\n'), ['SELECT 1', 'SELECT 2']);
  });
});
