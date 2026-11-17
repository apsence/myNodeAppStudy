'use strict';

/**
 * Задание 2 (средний уровень)
 * Таблица students и CRUD через пул соединений, affectedRows/changedRows,
 * параметризованные запросы и демонстрация SQL-инъекции (на отдельной таблице injection_demo).
 * ВНИМАНИЕ: таблица students пересоздаётся (DROP TABLE IF EXISTS) при каждом запуске.
 */

const cfg = require('./config');
const { createPool, createSingleConnection } = require('./config/database');
const { STUDENTS_DDL } = require('./config/schema');
const { classifyError, connectionHint } = require('./lib/errors');
const { fmtGrade } = require('./lib/common');

const GROUP = cfg.GROUP;
const OTHER = 'ББМО-02-23';
const show = (rows, fields = ['id', 'name', 'group_name', 'grade']) =>
  rows.forEach((r) => {
    const parts = fields.map((f) => {
      if (f === 'group_name') return `group=${r.group_name}`;
      if (f === 'grade') return `grade=${fmtGrade(r.grade)}`;
      return `${f}=${r[f]}`;
    });
    console.log('  ' + parts.join(', '));
  });

async function createTable(pool) {
  console.log('=== Создание таблицы ===');
  await pool.query('DROP TABLE IF EXISTS students');
  await pool.query(STUDENTS_DDL);
  console.log('✔ Таблица students создана');
  const [cols] = await pool.query('DESCRIBE students');
  cols.forEach((c) => console.log(`  ${c.Field.padEnd(11)} ${String(c.Type).padEnd(13)} null=${c.Null.padEnd(3)} key=${(c.Key || '-').padEnd(3)} ${c.Extra || ''}`));
  const [[meta]] = await pool.query(
    "SELECT ENGINE AS engine, TABLE_COLLATION AS collation FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'students'"
  );
  console.log(`  Движок: ${meta.engine}, кодировка/сопоставление: ${meta.collation}`);
}

async function inserts(pool) {
  console.log('\n=== INSERT ===');
  // execute() — настоящие prepared statements: SQL и данные отправляются серверу раздельно
  const [one] = await pool.execute('INSERT INTO students (name, group_name, course, grade) VALUES (?, ?, ?, ?)', ['Иван Иванов', GROUP, 2, 4.5]);
  console.log(`✔ Вставлен студент: id=${one.insertId}, affectedRows=${one.affectedRows}`);

  // Несколько строк одним запросом: INSERT ... VALUES (...), (...) — вложенный массив с query()
  const rows = [
    ['Мария Петрова', GROUP, 2, 3.8],
    ['Пётр Сидоров', GROUP, 3, 4.2],
    ['Анна Смирнова', GROUP, 1, 4.9],
  ];
  const [many] = await pool.query('INSERT INTO students (name, group_name, course, grade) VALUES ?', [rows]);
  console.log(`✔ Вставлено ${rows.length} студента: affectedRows=${many.affectedRows}, первый insertId=${many.insertId}`);

  const more = [
    ['Олег Кузнецов', GROUP, 2, 3.1],
    ['Елена Попова', GROUP, 4, 4.7],
    ['Дмитрий Лебедев', OTHER, 3, 2.8],
    ['Ольга Козлова', OTHER, 1, 2.5],
    ['Сергей Волков', OTHER, 2, 3.9],
  ];
  const [m2] = await pool.query('INSERT INTO students (name, group_name, course, grade) VALUES ?', [more]);
  console.log(`✔ Добавлено ещё ${more.length} студентов (affectedRows=${m2.affectedRows}) для демонстрации выборок`);
  return one.insertId;
}

async function selects(pool) {
  console.log('\n=== SELECT ===');
  const [all] = await pool.query('SELECT id, name, group_name, grade FROM students ORDER BY id');
  console.log(`Все студенты (${all.length}):`);
  show(all);

  const [byGroup] = await pool.query('SELECT id, name, group_name, grade FROM students WHERE group_name = ? ORDER BY id', [GROUP]);
  console.log(`\nСтуденты группы ${GROUP} (${byGroup.length}):`);
  show(byGroup);

  const [sorted] = await pool.query('SELECT id, name, grade FROM students WHERE group_name = ? ORDER BY grade DESC, id', [GROUP]);
  console.log(`\nСтуденты группы ${GROUP} (сортировка по grade DESC):`);
  show(sorted, ['id', 'name', 'grade']);

  const pageSize = 3;
  for (const page of [1, 2, 3]) {
    // LIMIT/OFFSET передаём через query(): execute() с числами в LIMIT на MySQL 8.0.22+ ведёт себя капризно
    const [rows] = await pool.query('SELECT id, name, grade FROM students ORDER BY id LIMIT ? OFFSET ?', [pageSize, (page - 1) * pageSize]);
    console.log(`\nПагинация: страница ${page} (LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}):`);
    show(rows, ['id', 'name', 'grade']);
  }
}

async function updates(pool, id) {
  console.log('\n=== UPDATE ===');
  let [r] = await pool.execute('UPDATE students SET grade = ? WHERE id = ?', [4.8, id]);
  console.log(`✔ Обновлён студент id=${id}: affectedRows=${r.affectedRows}, changedRows=${r.changedRows}`);
  [r] = await pool.execute('UPDATE students SET grade = ? WHERE id = ?', [4.8, id]);
  console.log(`✔ Повторное обновление: affectedRows=${r.affectedRows}, changedRows=${r.changedRows}`);
  console.log('  affectedRows — сколько строк НАЙДЕНО по условию, changedRows — сколько реально ИЗМЕНЕНО (значение то же → 0)');
  const [[row]] = await pool.query('SELECT id, name, grade FROM students WHERE id = ?', [id]);
  show([row], ['id', 'name', 'grade']);
}

async function deletes(pool, id) {
  console.log('\n=== DELETE ===');
  const [one] = await pool.execute('DELETE FROM students WHERE id = ?', [id]);
  console.log(`✔ Удалён студент id=${id}: affectedRows=${one.affectedRows}`);
  const [again] = await pool.execute('DELETE FROM students WHERE id = ?', [id]);
  console.log(`  повторное удаление того же id: affectedRows=${again.affectedRows} (такой записи уже нет)`);

  console.log(`⚠ Удаление всех студентов группы ${OTHER} (DELETE без WHERE удалил бы ВСЮ таблицу!)`);
  const [grp] = await pool.execute('DELETE FROM students WHERE group_name = ?', [OTHER]);
  console.log(`✔ Удалено студентов группы ${OTHER}: affectedRows=${grp.affectedRows}`);
  const [[left]] = await pool.query('SELECT COUNT(*) AS n FROM students');
  console.log(`Осталось студентов: ${left.n}`);
}

const tableExists = async (conn, name) => {
  const [rows] = await conn.query('SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?', [name]);
  return rows.length > 0;
};

async function sqlInjection(pool) {
  console.log('\n=== Защита от SQL-инъекции ===');
  console.log('(опыты идут на отдельной таблице injection_demo — таблица students не затрагивается)');

  const reset = async () => {
    await pool.query('DROP TABLE IF EXISTS injection_demo');
    await pool.query('CREATE TABLE injection_demo (id INT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(50) NOT NULL) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4');
    await pool.query("INSERT INTO injection_demo (name) VALUES ('Иван'), ('Мария')");
  };
  await reset();

  // 1. Подмена условия
  const bypass = "' OR '1'='1";
  const unsafeSql = `SELECT id, name FROM injection_demo WHERE name = '${bypass}'`;
  console.log(`\n1) Подмена условия: ввод ${JSON.stringify(bypass)}`);
  console.log(`   Конкатенация → ${unsafeSql}`);
  const [leaked] = await pool.query(unsafeSql);
  console.log(`   ✖ Вернулись ВСЕ строки: ${leaked.length} (ожидалось 0)`);
  const [safe1] = await pool.query('SELECT id, name FROM injection_demo WHERE name = ?', [bypass]);
  console.log(`   ✔ Плейсхолдер ?: найдено ${safe1.length} строк — ввод воспринят как обычный текст`);

  // 2. Деструктивный ввод
  const payload = "'; DROP TABLE injection_demo; -- ";
  const attackSql = `SELECT id, name FROM injection_demo WHERE name = '${payload}'`;
  console.log(`\n2) Попытка инъекции: ${JSON.stringify(payload)}`);
  console.log(`   Конкатенация → ${attackSql}`);
  try {
    await pool.query(attackSql);
  } catch (err) {
    console.log(`   Обычное соединение (multipleStatements=false) отклонило запрос: ${classifyError(err).code} — это защита драйвера по умолчанию, но на неё нельзя полагаться`);
  }
  console.log(`   Таблица injection_demo существует: ${await tableExists(pool, 'injection_demo')}`);

  const risky = await createSingleConnection({ multipleStatements: true }); // небезопасная конфигурация
  try {
    await risky.query(attackSql);
    console.log(`   С multipleStatements=true: ✖ Конкатенация привела к удалению таблицы (существует: ${await tableExists(pool, 'injection_demo')})`);
  } catch (err) {
    console.log(`   Ошибка: ${err.message}`);
  } finally {
    await risky.end();
  }

  await reset();
  const [safe2] = await pool.query('SELECT id, name FROM injection_demo WHERE name = ?', [payload]);
  console.log(`   ✔ Параметризованный запрос безопасен: найдено ${safe2.length}, таблица существует: ${await tableExists(pool, 'injection_demo')}`);
  await pool.query('DROP TABLE injection_demo');
}

async function main() {
  const pool = createPool();
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
    console.log(`Группа студентов: ${GROUP}\n`);
    await createTable(pool);
    const id = await inserts(pool);
    await selects(pool);
    await updates(pool, id);
    await deletes(pool, id);
    await sqlInjection(pool);
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
