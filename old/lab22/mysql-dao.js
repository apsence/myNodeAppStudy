'use strict';

/**
 * Задание 4 (сложный уровень)
 * StudentDAO: валидация, пагинация, фильтры, сортировка, поиск, статистика.
 * ВНИМАНИЕ: таблица students пересоздаётся и заполняется 100 тестовыми студентами.
 */

const cfg = require('./config');
const { createPool } = require('./config/database');
const { STUDENTS_DDL } = require('./config/schema');
const { createDb } = require('./lib/db');
const { classifyError, connectionHint } = require('./lib/errors');
const { StudentDAO } = require('./dao/StudentDAO');
const { fmtGrade, mulberry32, hashString } = require('./lib/common');

const GROUPS = ['ББМО-01-23', 'ББМО-02-23', 'ББМО-03-23'];
const NAMES = ['Иван Иванов', 'Мария Петрова', 'Пётр Сидоров', 'Анна Смирнова', 'Олег Кузнецов', 'Елена Попова', 'Дмитрий Лебедев', 'Ольга Козлова', 'Иван Петров', 'Наталья Морозова'];

const row = (s) => `id=${s.id}, name=${s.name}, group=${s.group_name}, course=${s.course}, grade=${fmtGrade(s.grade)}`;
const plural = (n, one, few, many) => {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return few;
  return many;
};
const students = (n) => `${n} ${plural(n, 'студент', 'студента', 'студентов')}`;

function printStructure() {
  console.log('--- Структура класса StudentDAO ---');
  const names = Object.getOwnPropertyNames(StudentDAO.prototype).filter((n) => n !== 'constructor');
  for (const n of names) {
    const isAsync = StudentDAO.prototype[n].constructor.name === 'AsyncFunction';
    console.log(`  ${isAsync ? 'async ' : '      '}${n}()`);
  }
  console.log('  статические: ' + Object.getOwnPropertyNames(StudentDAO).filter((n) => typeof StudentDAO[n] === 'function' && !['length', 'name', 'prototype'].includes(n)).join(', '));
  console.log('  Весь SQL инкапсулирован внутри класса; наружу отдаются только обычные объекты и Promise.');
}

async function main() {
  const pool = createPool();
  const db = createDb(pool); // обёртка над пулом: db.query / db.transaction
  const dao = new StudentDAO(db);
  try {
    await pool.query('SELECT 1');
  } catch (err) {
    console.error(`✖ Не удалось подключиться: [${classifyError(err).code}] ${err.message}`);
    const hint = connectionHint(err);
    if (hint) console.error(`  Подсказка: ${hint}`);
    process.exitCode = 1;
    await pool.end().catch(() => {});
    return;
  }

  try {
    await pool.query('DROP TABLE IF EXISTS students');
    await pool.query(STUDENTS_DDL);

    console.log(`=== StudentDAO (группа ${cfg.GROUP}) ===`);
    printStructure();

    console.log('\n--- Создание с валидацией ---');
    const first = await dao.create({ name: 'Иван', group_name: cfg.GROUP, course: 2, grade: 4.5 });
    console.log(`✔ Создан: id=${first.id}, name=${first.name}`);
    const bad = [
      { name: 'И', group_name: cfg.GROUP, course: 2 },
      { name: 'Мария', group_name: 'XX-1', course: 2 },
      { name: 'Пётр', group_name: cfg.GROUP, course: 5 },
      { name: 'Анна', group_name: cfg.GROUP, course: 1, grade: 6 },
    ];
    for (const data of bad) {
      try {
        await dao.create(data);
        console.log('✔ (неожиданно) создан');
      } catch (err) {
        console.log(`✖ Ошибка: ${err.details.join('; ')}`);
      }
    }
    const withNull = await dao.create({ name: 'Без оценки', group_name: cfg.GROUP, course: 1, grade: null });
    console.log(`✔ grade может быть NULL: id=${withNull.id}, grade=${fmtGrade(withNull.grade)}`);

    // Заполняем до 100 студентов одной транзакцией (batchCreate)
    const rnd = mulberry32(hashString(cfg.GROUP));
    const items = Array.from({ length: 98 }, (_, i) => ({
      name: NAMES[Math.floor(rnd() * NAMES.length)],
      group_name: GROUPS[Math.floor(rnd() * GROUPS.length)],
      course: 1 + Math.floor(rnd() * 4),
      grade: i % 20 === 0 ? null : Math.round((2.5 + rnd() * 2.5) * 100) / 100,
    }));
    await dao.batchCreate(items);
    console.log(`(добавлено ещё 98 студентов транзакцией batchCreate; всего в таблице: ${await dao.count()})`);

    console.log('\n--- Пагинация ---');
    let page = await dao.findAll({ limit: 5, offset: 0 });
    console.log('findAll({ limit: 5, offset: 0 }):');
    console.log(`Всего: ${page.pagination.total}, Страница: ${page.pagination.page}/${page.pagination.pages}`);
    page.data.forEach((s) => console.log('  ' + row(s)));
    page = await dao.findAll({ limit: 5, offset: 95 });
    console.log(`findAll({ limit: 5, offset: 95 }) — последняя страница: ${page.pagination.page}/${page.pagination.pages}, записей на странице: ${page.data.length}`);

    console.log('\n--- Фильтры ---');
    let r = await dao.findAll({ group_name: cfg.GROUP, course: 2, limit: 100 });
    console.log(`findAll({ group_name: '${cfg.GROUP}', course: 2 }):`);
    console.log(`Найдено: ${students(r.pagination.total)}`);
    r.data.slice(0, 3).forEach((s) => console.log('  ' + row(s)));
    r = await dao.findAll({ grade_min: 4.0, grade_max: 5.0, limit: 100 });
    console.log(`findAll({ grade_min: 4.0, grade_max: 5.0 }):`);
    console.log(`Найдено: ${students(r.pagination.total)}`);
    r = await dao.findAll({ group_name: cfg.GROUP, course: 3, grade_min: 4.0, limit: 100 });
    console.log(`Комбинация (группа + курс 3 + оценка от 4.0): ${students(r.pagination.total)}`);

    console.log('\n--- Сортировка ---');
    for (const opts of [
      { sortBy: 'name', order: 'asc' },
      { sortBy: 'name', order: 'desc' },
      { sortBy: 'grade', order: 'asc' },
      { sortBy: 'grade', order: 'desc' },
      { sortBy: 'created_at', order: 'desc' },
    ]) {
      const res = await dao.findAll({ ...opts, limit: 3 });
      console.log(`findAll(${JSON.stringify(opts)}):`);
      res.data.forEach((s) => console.log('  ' + row(s)));
    }

    console.log('\n--- Поиск ---');
    let found = await dao.search('Иван');
    console.log("search('Иван'):");
    console.log(`Найдено: ${students(found.found)}`);
    found.data.slice(0, 5).forEach((s) => console.log(`  id=${s.id}, name=${s.name}`));
    found = await dao.search("%' OR '1'='1");
    console.log(`search("%' OR '1'='1") (попытка инъекции и шаблона LIKE): найдено ${found.found} — ввод воспринят как обычный текст`);

    console.log('\n--- Обновление и удаление ---');
    const updated = await dao.update(first.id, { grade: 4.8 });
    console.log(`update(${first.id}, { grade: 4.8 }) → grade=${fmtGrade(updated.grade)}`);
    console.log(`update(999999, { grade: 4 }) → ${await dao.update(999999, { grade: 4 })} (студент не найден)`);
    console.log(`delete(${withNull.id}) → ${await dao.delete(withNull.id)}; повторно → ${await dao.delete(withNull.id)}`);

    console.log('\n--- Статистика ---');
    const st = await dao.getStats();
    console.log(`Всего студентов: ${st.total}`);
    console.log(`Средний балл: ${fmtGrade(st.averageGrade)}`);
    console.log(`Минимальная оценка: ${fmtGrade(st.minGrade)}`);
    console.log(`Максимальная оценка: ${fmtGrade(st.maxGrade)}`);
    console.log('По группам:');
    for (const [g, n] of Object.entries(st.byGroup)) console.log(`${g}: ${n}`);
    console.log('По курсам:');
    for (const [c, n] of Object.entries(st.byCourse)) console.log(`${c} курс: ${n}`);
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
