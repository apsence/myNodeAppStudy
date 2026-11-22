'use strict';

const { validateStudent, parseListOptions, parseId, SORT_COLUMNS } = require('../models/student');
const { ValidationError } = require('../lib/appErrors');
const { escapeLike } = require('../lib/common');

const COLUMNS = 'id, name, group_name, course, grade, created_at';
const round2 = (n) => (n === null || n === undefined ? null : Math.round(Number(n) * 100) / 100);

/**
 * Data Access Object для таблицы students.
 * Весь SQL инкапсулирован здесь: снаружи — только методы и обычные объекты.
 * Все значения передаются через плейсхолдеры ?; имена столбцов для ORDER BY/SET берутся только из белых списков.
 * Работает с интерфейсом db.query(sql, params) / db.transaction(fn) (пул или обёртка createDb).
 */
class StudentDAO {
  constructor(db) {
    this.db = db;
  }

  static toStudent(row) {
    if (!row) return null;
    return {
      id: row.id,
      name: row.name,
      group_name: row.group_name,
      course: row.course,
      grade: row.grade === null || row.grade === undefined ? null : Number(row.grade),
      created_at: row.created_at,
    };
  }

  /** Создание с валидацией. Возвращает созданного студента. */
  async create(data) {
    const { valid, errors, value } = validateStudent(data);
    if (!valid) throw new ValidationError(errors);
    const [res] = await this.db.query(
      'INSERT INTO students (name, group_name, course, grade) VALUES (?, ?, ?, ?)',
      [value.name, value.group_name, value.course, value.grade ?? null]
    );
    return this.findById(res.insertId);
  }

  async findById(id) {
    const [rows] = await this.db.query(`SELECT ${COLUMNS} FROM students WHERE id = ?`, [parseId(id)]);
    return StudentDAO.toStudent(rows[0]);
  }

  static _where(opts) {
    const clauses = [];
    const params = [];
    if (opts.group_name !== undefined) { clauses.push('group_name = ?'); params.push(opts.group_name); }
    if (opts.course !== undefined) { clauses.push('course = ?'); params.push(opts.course); }
    if (opts.grade_min !== undefined) { clauses.push('grade >= ?'); params.push(opts.grade_min); }
    if (opts.grade_max !== undefined) { clauses.push('grade <= ?'); params.push(opts.grade_max); }
    return { sql: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '', params };
  }

  /** Список: фильтры комбинируются через AND; пагинация; сортировка из белого списка (+ id для стабильности). */
  async findAll(rawOptions = {}) {
    const opts = parseListOptions(rawOptions);
    const where = StudentDAO._where(opts);
    const orderBy = `ORDER BY ${SORT_COLUMNS[opts.sortBy]} ${opts.order === 'desc' ? 'DESC' : 'ASC'}, id ASC`;

    const [[rows], [countRows]] = await Promise.all([
      this.db.query(`SELECT ${COLUMNS} FROM students ${where.sql} ${orderBy} LIMIT ? OFFSET ?`, [...where.params, opts.limit, opts.offset]),
      this.db.query(`SELECT COUNT(*) AS total FROM students ${where.sql}`, where.params),
    ]);
    const total = Number(countRows[0].total);
    return {
      data: rows.map(StudentDAO.toStudent),
      pagination: {
        total,
        limit: opts.limit,
        offset: opts.offset,
        page: Math.floor(opts.offset / opts.limit) + 1,
        pages: Math.ceil(total / opts.limit),
      },
    };
  }

  /** Частичное обновление через SET только переданных (и проверенных) полей. null — студент не найден. */
  async update(id, data) {
    const studentId = parseId(id);
    const { valid, errors, value } = validateStudent(data, { partial: true });
    if (!valid) throw new ValidationError(errors);
    const columns = Object.keys(value); // только поля из белого списка models/student.js
    const [res] = await this.db.query(
      `UPDATE students SET ${columns.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`,
      [...columns.map((c) => value[c]), studentId]
    );
    if (res.affectedRows === 0) return null; // affectedRows = найдено строк (даже если значения те же)
    return this.findById(studentId);
  }

  async delete(id) {
    const [res] = await this.db.query('DELETE FROM students WHERE id = ?', [parseId(id)]);
    return res.affectedRows > 0;
  }

  /** Поиск по имени (LIKE %query%; спецсимволы шаблона экранируются). */
  async search(query, { limit = 20 } = {}) {
    const q = typeof query === 'string' ? query.trim() : '';
    if (q.length < 1 || q.length > 100) throw new ValidationError(['запрос поиска должен содержать от 1 до 100 символов']);
    const [rows] = await this.db.query(
      `SELECT ${COLUMNS} FROM students WHERE name LIKE ? ESCAPE '\\\\' ORDER BY name ASC, id ASC LIMIT ?`,
      [`%${escapeLike(q)}%`, Math.min(Math.max(Number(limit) || 20, 1), 100)]
    );
    return { found: rows.length, data: rows.map(StudentDAO.toStudent) };
  }

  /** Статистика: всего, средний/мин/макс балл, количество по группам и курсам. */
  async getStats() {
    const [[overallRows], [groupRows], [courseRows]] = await Promise.all([
      this.db.query('SELECT COUNT(*) AS total, AVG(grade) AS averageGrade, MIN(grade) AS minGrade, MAX(grade) AS maxGrade FROM students'),
      this.db.query('SELECT group_name, COUNT(*) AS cnt FROM students GROUP BY group_name ORDER BY group_name'),
      this.db.query('SELECT course, COUNT(*) AS cnt FROM students GROUP BY course ORDER BY course'),
    ]);
    const o = overallRows[0];
    return {
      total: Number(o.total),
      averageGrade: round2(o.averageGrade),
      minGrade: round2(o.minGrade),
      maxGrade: round2(o.maxGrade),
      byGroup: Object.fromEntries(groupRows.map((r) => [r.group_name, Number(r.cnt)])),
      byCourse: Object.fromEntries(courseRows.map((r) => [String(r.course), Number(r.cnt)])),
    };
  }

  /**
   * Массовое создание в одной транзакции: при ошибке любого INSERT откатываются все.
   * Транзакцию (BEGIN/COMMIT/ROLLBACK и release) обеспечивает db.transaction().
   */
  async batchCreate(items) {
    if (!Array.isArray(items) || items.length === 0) throw new ValidationError(['ожидается непустой массив студентов']);
    const rows = [];
    const problems = [];
    items.forEach((item, index) => {
      const r = validateStudent(item);
      if (r.valid) rows.push(r.value);
      else problems.push({ index, errors: r.errors });
    });
    if (problems.length) throw new ValidationError(problems, 'Ошибка валидации массива (ничего не вставлено)');

    let current = -1;
    try {
      await this.db.transaction(async (tx) => {
        for (let i = 0; i < rows.length; i++) {
          current = i;
          const v = rows[i];
          await tx.query('INSERT INTO students (name, group_name, course, grade) VALUES (?, ?, ?, ?)', [v.name, v.group_name, v.course, v.grade ?? null]);
        }
      });
    } catch (err) {
      err.transaction = 'rolled back';
      err.batchIndex = current;
      throw err;
    }
    return { created: rows.length, transaction: 'committed' };
  }

  async count() {
    const [rows] = await this.db.query('SELECT COUNT(*) AS total FROM students');
    return Number(rows[0].total);
  }
}

module.exports = { StudentDAO };
