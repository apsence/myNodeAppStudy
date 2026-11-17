'use strict';

/**
 * Задание 3 (продвинутый уровень)
 *  - категории ошибок MySQL (сеть, аутентификация, синтаксис, конфликты, ограничения);
 *  - обработка ошибок пула: слушатель 'error', логирование, пересоздание пула;
 *  - потоковое чтение 100 000 строк (.stream()) против SELECT целиком (в процессе с ограниченной памятью);
 *  - транзакции: beginTransaction / commit / rollback / release в finally.
 * Флаги: --size=N (по умолчанию BIG_SIZE из .env), --reset (пересоздать big_data), --only=errors|pool|stream|tx
 */

const { spawn } = require('node:child_process');
const { performance } = require('node:perf_hooks');
const cfg = require('./config');
const { createPool, createSingleConnection } = require('./config/database');
const { classifyError, connectionHint } = require('./lib/errors');
const { createLogger } = require('./lib/logger');
const { ManagedPool } = require('./lib/db');
const { sleep, mb } = require('./lib/common');

const argv = process.argv.slice(2);
const argValue = (name) => {
  const a = argv.find((x) => x.startsWith(`--${name}=`));
  return a ? a.split('=')[1] : undefined;
};
const SIZE = Number(argValue('size')) || cfg.bigSize;
const ONLY = argValue('only');
const CHILD = argValue('child'); // служебный режим: 'all' | 'stream'
const CHILD_HEAP_MB = 48;
const want = (name) => !ONLY || ONLY === name;
const sec = (ms) => (ms / 1000).toFixed(2);

// ---------- 1. Демонстрация категорий ошибок ----------

function report(err, text) {
  const c = classifyError(err);
  console.log(`[${c.code}] ${text}`);
  console.log(`    категория: ${c.title}; сообщение сервера/драйвера: ${err.sqlMessage || err.message}`);
}

async function expectError(fn) {
  try {
    await fn();
    return null;
  } catch (err) {
    return err;
  }
}

async function demoErrors(pool) {
  console.log('=== Демонстрация ошибок ===');

  console.log('\n-- Сетевые --');
  let err = await expectError(async () => (await createSingleConnection({ port: 9999, connectTimeout: 3000 })).end());
  if (err) report(err, 'Сервер недоступен: localhost:9999');
  err = await expectError(async () => (await createSingleConnection({ host: '10.255.255.1', connectTimeout: 1500 })).end());
  if (err) report(err, 'Хост не отвечает (10.255.255.1, connectTimeout=1500 мс) — на некоторых сетях вместо таймаута сразу приходит ENETUNREACH');
  console.log('[PROTOCOL_CONNECTION_LOST] показан в разделе «Обработка ошибок пула» ниже');

  console.log('\n-- Аутентификация --');
  err = await expectError(async () => (await createSingleConnection({ password: 'wrong-password-123' })).end());
  if (err) report(err, `Неверный пароль для пользователя ${cfg.db.user}`);

  console.log('\n-- Синтаксис --');
  err = await expectError(() => pool.query('SELECT * FRM students'));
  if (err) report(err, 'Синтаксическая ошибка: SELECT * FRM students');

  await pool.query('DROP TABLE IF EXISTS err_orders');
  await pool.query('DROP TABLE IF EXISTS err_users');
  await pool.query(`CREATE TABLE err_users (
    id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    email VARCHAR(100) NOT NULL,
    name VARCHAR(100) NOT NULL,
    UNIQUE KEY uq_err_users_email (email)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  await pool.query(`CREATE TABLE err_orders (
    id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    CONSTRAINT fk_err_orders_user FOREIGN KEY (user_id) REFERENCES err_users (id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  await pool.query("INSERT INTO err_users (email, name) VALUES ('ivan@bbmo.example', 'Иван')");

  console.log('\n-- Конфликты --');
  err = await expectError(() => pool.query("INSERT INTO err_users (email, name) VALUES ('ivan@bbmo.example', 'Дубль')"));
  if (err) report(err, "Дублирование уникального ключа: email='ivan@bbmo.example'");

  console.log('\n-- Ограничения --');
  err = await expectError(() => pool.query("INSERT INTO err_users (email, name) VALUES ('petr@bbmo.example', NULL)"));
  if (err) report(err, 'NULL в NOT NULL столбце: name');
  err = await expectError(() => pool.query('INSERT INTO err_orders (user_id) VALUES (9999)'));
  if (err) {
    report(err, 'Внешний ключ: пользователя с id=9999 не существует');
    console.log('    (в MySQL 8 для INSERT приходит код ER_NO_REFERENCED_ROW_2 — это тот же случай, что и ER_NO_REFERENCED_ROW)');
  }

  await pool.query('DROP TABLE err_orders');
  await pool.query('DROP TABLE err_users');
}

// ---------- 2. Ошибки пула ----------

async function demoPoolErrors() {
  console.log('\n=== Обработка ошибок пула ===');
  const logger = createLogger();
  const managed = new ManagedPool({ factory: () => createPool({ connectionLimit: 3 }), logger });
  console.log("Слушатель pool.on('error') установлен; критические ошибки приводят к пересозданию пула");
  const killer = await createSingleConnection();
  try {
    console.log('\nСценарий 1: сервер обрывает соединение во время запроса (KILL CONNECTION)');
    const slow = managed.query('SELECT SLEEP(1.5) AS slept');
    await sleep(400);
    const [procs] = await killer.query("SELECT ID FROM information_schema.PROCESSLIST WHERE INFO LIKE 'SELECT SLEEP(1.5)%' AND ID <> CONNECTION_ID()");
    if (procs.length === 0) console.log('(не удалось найти соединение с запросом — пропускаем обрыв)');
    for (const { ID } of procs) await killer.query('KILL CONNECTION ?', [ID]);
    const [rows] = await slow;
    console.log(`✔ Запрос завершился после восстановления: slept=${rows[0].slept}, пересозданий пула: ${managed.recreations}`);

    console.log('\nСценарий 2: пул закрыт (критическая ошибка POOL_CLOSED)');
    await managed.pool.end();
    const [[ok]] = await managed.query('SELECT 1 AS ok');
    console.log(`✔ Запрос выполнен на новом пуле: ok=${ok.ok}; всего пересозданий: ${managed.recreations}`);
  } finally {
    await killer.end();
    await managed.end().catch(() => {});
  }
}

// ---------- 3. Потоковые запросы ----------

const WORDS = ['студент', 'лабораторная', 'работа', 'потоки', 'данные', 'запрос', 'таблица', 'группа', 'оценка', 'сервер'];
const payloadFor = (i) => {
  let s = `${i} `;
  while (s.length < 200) s += `${WORDS[(i + s.length) % WORDS.length]} `;
  return s.slice(0, 200);
};

async function ensureBigData(pool) {
  const exists = (await pool.query("SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'big_data'"))[0].length > 0;
  if (exists && !argv.includes('--reset')) {
    const [[{ n }]] = await pool.query('SELECT COUNT(*) AS n FROM big_data');
    if (Number(n) === SIZE) {
      console.log(`Таблица big_data уже содержит ${n} записей (пропускаем генерацию; --reset — пересоздать)`);
      return;
    }
  }
  await pool.query('DROP TABLE IF EXISTS big_data');
  await pool.query(`CREATE TABLE big_data (
    id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    student_name VARCHAR(100) NOT NULL,
    payload VARCHAR(255) NOT NULL,
    score DECIMAL(5,2) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  console.log(`Генерация ${SIZE} записей в big_data (пакеты по 5000)...`);
  const t0 = performance.now();
  const BATCH = 5000;
  for (let start = 0; start < SIZE; start += BATCH) {
    const rows = [];
    for (let i = start; i < Math.min(start + BATCH, SIZE); i++) rows.push([`Студент ${i + 1}`, payloadFor(i + 1), ((i * 37) % 301) / 100 + 2]);
    await pool.query('INSERT INTO big_data (student_name, payload, score) VALUES ?', [rows]);
  }
  console.log(`✔ Данные созданы за ${sec(performance.now() - t0)} сек`);
}

/** Чтение через .stream(): строки приходят по мере поступления, в памяти не накапливаются. */
async function streamAll(pool, onRow) {
  const conn = await pool.getConnection();
  try {
    await new Promise((resolve, reject) => {
      // .stream() есть у «обычного» (callback) соединения — оно доступно как conn.connection
      const stream = conn.connection.query('SELECT * FROM big_data').stream({ highWaterMark: 1000 });
      stream.on('data', onRow);
      stream.on('end', resolve);
      stream.on('error', reject);
    });
  } finally {
    conn.release();
  }
}

function runChild(mode) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [`--max-old-space-size=${CHILD_HEAP_MB}`, __filename, `--child=${mode}`], { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (err += d));
    child.on('close', (code, signal) => resolve({ code, signal, out, err }));
  });
}

async function childMain(mode) {
  const pool = createPool({ connectionLimit: 1 });
  try {
    let rows = 0;
    if (mode === 'all') {
      const [result] = await pool.query('SELECT * FROM big_data'); // весь результат — в память
      rows = result.length;
    } else {
      await streamAll(pool, () => rows++);
    }
    console.log(JSON.stringify({ rows, heapMB: mb(process.memoryUsage().heapUsed) }));
  } finally {
    await pool.end();
  }
}

async function demoStreaming(pool) {
  console.log('\n=== Потоковый запрос ===');
  await ensureBigData(pool);
  const [[{ n }]] = await pool.query('SELECT COUNT(*) AS n FROM big_data');
  const total = Number(n);

  console.log(`Чтение ${total} записей через .stream()...`);
  let count = 0;
  let sum = 0;
  let nextStep = 10;
  let peakHeap = process.memoryUsage().heapUsed;
  let peakRss = process.memoryUsage().rss;
  const t0 = performance.now();
  await streamAll(pool, (row) => {
    count++;
    sum += Number(row.score); // «обработка» каждой строки
    if (count % 2000 === 0) {
      const m = process.memoryUsage();
      peakHeap = Math.max(peakHeap, m.heapUsed);
      peakRss = Math.max(peakRss, m.rss);
    }
    const pct = Math.floor((count / total) * 100);
    if (pct >= nextStep) {
      console.log(`[STREAM] Получено: ${count} (${pct}%)`);
      nextStep = pct - (pct % 10) + 10;
    }
  });
  console.log(`✔ Обработано за ${sec(performance.now() - t0)} сек, средний score ${(sum / count).toFixed(2)}`);
  console.log(`Пик памяти: heap ${mb(peakHeap)} МБ (RSS ${mb(peakRss)} МБ) — строки не накапливаются`);

  console.log(`\nСравнение: оба варианта в отдельных процессах с лимитом кучи ${CHILD_HEAP_MB} МБ`);
  const viaStream = await runChild('stream');
  if (viaStream.code === 0) console.log(`  .stream():     ✔ ${JSON.parse(viaStream.out.trim().split('\n').pop()).rows} строк обработано, heap ${JSON.parse(viaStream.out.trim().split('\n').pop()).heapMB} МБ`);
  else console.log(`  .stream():     ✖ процесс завершился с кодом ${viaStream.code}\n${viaStream.err.split('\n').slice(-4).join('\n')}`);

  const whole = await runChild('all');
  if (/heap out of memory|Allocation failed/i.test(`${whole.err}\n${whole.out}`)) {
    console.log('  SELECT целиком: ✖ Ошибка: JavaScript heap out of memory');
  } else if (whole.code === 0) {
    console.log(`  SELECT целиком: ✔ уместился (heap ${JSON.parse(whole.out.trim().split('\n').pop()).heapMB} МБ) — таблица слишком мала, увеличьте --size`);
  } else {
    console.log(`  SELECT целиком: ✖ процесс завершился с кодом ${whole.code} ${whole.signal || ''}`);
  }

  // Оценка потребности в памяти по небольшой выборке
  const before = process.memoryUsage().heapUsed;
  const [sample] = await pool.query('SELECT * FROM big_data LIMIT 10000');
  const perRow = (process.memoryUsage().heapUsed - before) / sample.length;
  if (perRow > 0) console.log(`Оценка: одна строка ≈ ${Math.round(perRow)} байт в куче → ${total} строк ≈ ${mb(perRow * total)} МБ (без учёта буферов драйвера)`);
}

// ---------- 4. Транзакции ----------

async function transaction(pool, title, studentNos) {
  console.log(`\n--- ${title} ---`);
  const conn = await pool.getConnection(); // соединение для транзакции берём из пула
  try {
    await conn.beginTransaction();
    console.log('Начало транзакции');
    for (const [i, no] of studentNos.entries()) {
      try {
        await conn.query('INSERT INTO tx_students (student_no, name) VALUES (?, ?)', [no, `Студент ${no}`]);
        console.log(`✔ INSERT ${i + 1} выполнен (student_no=${no})`);
      } catch (err) {
        console.log(`✖ INSERT ${i + 1} не выполнен (${classifyError(err).code}: student_no=${no})`);
        throw err;
      }
    }
    await conn.commit();
    console.log('✔ COMMIT выполнен — изменения сохранены');
  } catch (err) {
    await conn.rollback();
    console.log('Rollback выполнен — изменения отменены');
  } finally {
    conn.release(); // ОБЯЗАТЕЛЬНО: иначе соединение «утекает» и пул со временем иссякнет
    console.log('Соединение возвращено в пул');
  }
  const [[{ n }]] = await pool.query('SELECT COUNT(*) AS n FROM tx_students');
  console.log(`Проверка: записей в tx_students = ${n}`);
}

async function demoTransactions(pool) {
  console.log('\n=== Транзакция ===');
  await pool.query('DROP TABLE IF EXISTS tx_students');
  await pool.query('CREATE TABLE tx_students (student_no INT NOT NULL PRIMARY KEY, name VARCHAR(100) NOT NULL) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4');
  await transaction(pool, 'Успешная транзакция', [1, 2]);
  await transaction(pool, 'Откат: третий INSERT дублирует ключ', [3, 4, 3]);
}

// ---------- запуск ----------

async function main() {
  const pool = createPool();
  pool.on('error', (err) => console.log(`[POOL ERROR] ${classifyError(err).code}`));
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
    if (want('errors')) await demoErrors(pool);
    if (want('pool')) await demoPoolErrors();
    if (want('stream')) await demoStreaming(pool);
    if (want('tx')) await demoTransactions(pool);
  } finally {
    await pool.end();
  }
}

if (CHILD) {
  childMain(CHILD).catch((err) => {
    console.error(err);
    process.exit(2);
  });
} else {
  main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
