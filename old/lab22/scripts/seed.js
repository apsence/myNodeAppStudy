'use strict';

/** Наполняет students тестовыми данными (по умолчанию 100). Нужны применённые миграции: npm run migrate. */
const cfg = require('../config');
const { createPool } = require('../config/database');
const { createDb } = require('../lib/db');
const { StudentDAO } = require('../dao/StudentDAO');
const { mulberry32, hashString } = require('../lib/common');

const count = Number((process.argv.find((a) => a.startsWith('--count=')) || '').split('=')[1]) || 100;
const GROUPS = ['ББМО-01-23', 'ББМО-02-23', 'ББМО-03-23'];
const NAMES = ['Иван Иванов', 'Мария Петрова', 'Пётр Сидоров', 'Анна Смирнова', 'Олег Кузнецов', 'Елена Попова', 'Дмитрий Лебедев', 'Ольга Козлова', 'Иван Соколов', 'Наталья Морозова'];

async function main() {
  const pool = createPool();
  try {
    const db = createDb(pool);
    const dao = new StudentDAO(db);
    const rnd = mulberry32(hashString(cfg.GROUP));
    const items = Array.from({ length: count }, () => ({
      name: NAMES[Math.floor(rnd() * NAMES.length)],
      group_name: GROUPS[Math.floor(rnd() * GROUPS.length)],
      course: 1 + Math.floor(rnd() * 4),
      grade: rnd() < 0.05 ? null : Math.round((2.5 + rnd() * 2.5) * 100) / 100,
    }));
    const res = await dao.batchCreate(items);
    console.log(`✔ Добавлено студентов: ${res.created}. Всего в таблице: ${await dao.count()}`);
  } catch (err) {
    console.error(`✖ ${err.code || err.name}: ${err.message}`);
    if (err.code === 'ER_NO_REFERENCED_ROW_2') console.error('  Группы не найдены: сначала выполните npm run migrate.');
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main();
