'use strict';

const { validateGroup } = require('../models/group');
const { parseId } = require('../models/student');
const { ValidationError } = require('../lib/appErrors');

// groups — зарезервированное слово в MySQL 8.0.2+, поэтому имя таблицы всегда в обратных кавычках
const GROUPS = '`groups`';

class GroupDAO {
  constructor(db) {
    this.db = db;
  }

  async list() {
    const [rows] = await this.db.query(
      `SELECT g.id, g.name, g.curator, g.created_at, COUNT(s.id) AS students
         FROM ${GROUPS} g LEFT JOIN students s ON s.group_name = g.name
        GROUP BY g.id, g.name, g.curator, g.created_at
        ORDER BY g.name`
    );
    return rows.map((r) => ({ id: r.id, name: r.name, curator: r.curator, students: Number(r.students), created_at: r.created_at }));
  }

  async findById(id) {
    const [rows] = await this.db.query(`SELECT id, name, curator, created_at FROM ${GROUPS} WHERE id = ?`, [parseId(id)]);
    return rows[0] || null;
  }

  async create(data) {
    const { valid, errors, value } = validateGroup(data);
    if (!valid) throw new ValidationError(errors);
    const [res] = await this.db.query(`INSERT INTO ${GROUPS} (name, curator) VALUES (?, ?)`, [value.name, value.curator]);
    return this.findById(res.insertId);
  }
}

module.exports = { GroupDAO };
