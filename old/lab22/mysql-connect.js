'use strict';

/**
 * Задание 1 (базовый уровень)
 * Одиночное соединение (createConnection) и пул (createPool), SELECT VERSION(),
 * информация о сервере, обработка ошибок подключения (ECONNREFUSED, ER_ACCESS_DENIED_ERROR).
 * Флаг --show-env печатает .env с замаскированным паролем (для скриншота отчёта).
 */

const cfg = require('./config');
const { createSingleConnection, createPool } = require('./config/database');
const { classifyError, connectionHint } = require('./lib/errors');

const INFO_SQL = 'SELECT VERSION() AS version, DATABASE() AS db, USER() AS user';

function showEnv() {
  console.log('=== Содержимое .env (пароль скрыт) ===');
  const lines = cfg.describeEnv();
  if (!lines) console.log('Файл .env не найден: скопируйте .env.example в .env');
  else lines.forEach((l) => console.log(l));
}

function printConfig() {
  const { host, port, user, database } = cfg.db;
  console.log(`Параметры из .env: host=${host}, port=${port}, user=${user}, database=${database}, password=******** (скрыт)`);
}

async function singleConnection() {
  console.log('=== Одиночное соединение ===');
  const conn = await createSingleConnection(); // одно TCP-соединение
  try {
    console.log('✔ Подключение установлено');
    const [[info]] = await conn.query(INFO_SQL);
    console.log(`Версия MySQL: ${info.version}`);
    console.log(`Текущая БД: ${info.db}`);
    console.log(`Пользователь: ${info.user}`);
  } finally {
    await conn.end(); // одиночное соединение нужно закрывать вручную
    console.log('✖ Соединение закрыто (conn.end())');
  }
}

async function poolDemo() {
  console.log('\n=== Пул соединений ===');
  const pool = createPool();
  let created = 0;
  pool.on('connection', () => created++); // событие: пул открыл новое физическое соединение
  try {
    console.log(`✔ Пул создан (лимит: ${cfg.db.connectionLimit})`);
    const [[info]] = await pool.query(INFO_SQL); // соединение берётся и возвращается в пул автоматически
    console.log(`Версия MySQL: ${info.version}`);
    console.log(`Текущая БД: ${info.db}`);
    console.log(`Пользователь: ${info.user}`);

    // 10 параллельных «медленных» запросов заставляют пул открыть все 10 соединений
    await Promise.all(Array.from({ length: cfg.db.connectionLimit }, () => pool.query('SELECT SLEEP(0.3)')));
    console.log(`Соединений в пуле: ${created}`);
    const [[again]] = await pool.query('SELECT 1 + 1 AS result');
    console.log(`✔ Пул готов к работе (повторный запрос без нового подключения: 1 + 1 = ${again.result})`);

    await compareSingleVsPool(pool);
  } finally {
    await pool.end();
    console.log('Пул закрыт (pool.end()) при завершении программы');
  }
}

/** Разница на практике: 10 запросов по 0.2 с — последовательно на одном соединении и параллельно через пул. */
async function compareSingleVsPool(pool) {
  console.log('\n=== Одиночное соединение vs пул: 10 запросов SELECT SLEEP(0.2) ===');
  const N = 10;
  const conn = await createSingleConnection();
  let t0 = Date.now();
  for (let i = 0; i < N; i++) await conn.query('SELECT SLEEP(0.2)'); // одно соединение — запросы идут по очереди
  const singleMs = Date.now() - t0;
  await conn.end();

  t0 = Date.now();
  await Promise.all(Array.from({ length: N }, () => pool.query('SELECT SLEEP(0.2)'))); // пул — параллельно
  const poolMs = Date.now() - t0;
  console.log(`Одиночное соединение: ${singleMs} мс`);
  console.log(`Пул (${cfg.db.connectionLimit} соединений): ${poolMs} мс (быстрее в ${(singleMs / Math.max(poolMs, 1)).toFixed(1)} раза)`);
}

async function connectionErrors() {
  console.log('\n=== Ошибки подключения ===');
  const cases = [
    { title: 'Сервер недоступен (порт 9999)', overrides: { port: 9999 } },
    { title: `Неверный пароль для пользователя ${cfg.db.user}`, overrides: { password: 'wrong-password-123' } },
  ];
  for (const { title, overrides } of cases) {
    console.log(`${title}:`);
    let conn;
    try {
      conn = await createSingleConnection({ connectTimeout: 3000, ...overrides });
      await conn.query('SELECT 1');
      console.log('  (подключение неожиданно удалось)');
    } catch (err) {
      const c = classifyError(err);
      console.log(`  ✖ [${c.code}] ${err.message}`);
      console.log(`    категория: ${c.title}`);
      const hint = connectionHint(err);
      if (hint) console.log(`    подсказка: ${hint}`);
    } finally {
      if (conn) await conn.end().catch(() => {});
    }
  }
}

async function main() {
  if (process.argv.includes('--show-env')) return showEnv();

  printConfig();
  try {
    await singleConnection();
    await poolDemo();
  } catch (err) {
    const c = classifyError(err);
    console.error(`✖ Не удалось подключиться: [${c.code}] ${err.message}`);
    const hint = connectionHint(err);
    if (hint) console.error(`  Подсказка: ${hint}`);
    process.exitCode = 1;
  }
  await connectionErrors();
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
