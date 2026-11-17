'use strict';

/**
 * Создаёт базу bbmo_01_23 и пользователя student (НЕ root) с правами только на эту БД.
 * Запускается один раз от имени администратора MySQL:
 *   npm run setup-db -- --root-password=ВАШ_ПАРОЛЬ_ROOT
 * (или переменная окружения MYSQL_ROOT_PASSWORD; --root-user=... — другой администратор)
 * Пароль student берётся из DB_PASSWORD в .env.
 */
const cfg = require('../config');
const { mysql } = require('../config/database');
const { connectionHint } = require('../lib/errors');

const arg = (name) => {
  const a = process.argv.find((x) => x.startsWith(`--${name}=`));
  return a ? a.slice(name.length + 3) : undefined;
};

async function main() {
  const rootUser = arg('root-user') || process.env.MYSQL_ROOT_USER || 'root';
  const rootPassword = arg('root-password') ?? process.env.MYSQL_ROOT_PASSWORD ?? '';
  const { host, port, user, password, database } = cfg.db;
  if (!password || password === 'change_me') {
    console.error('✖ Укажите свой пароль для пользователя student в DB_PASSWORD (файл .env), а не change_me.');
    process.exitCode = 1;
    return;
  }

  const admin = await mysql.createConnection({ host, port, user: rootUser, password: rootPassword });
  try {
    await admin.query('CREATE DATABASE IF NOT EXISTS ?? CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci', [database]);
    console.log(`✔ База данных ${database} готова`);
    // учётная запись для localhost и 127.0.0.1; пароль экранируется драйвером (query, а не execute)
    for (const h of ['localhost', '127.0.0.1']) {
      await admin.query('CREATE USER IF NOT EXISTS ?@? IDENTIFIED BY ?', [user, h, password]);
      await admin.query('ALTER USER ?@? IDENTIFIED BY ?', [user, h, password]);
      await admin.query(`GRANT ALL PRIVILEGES ON \`${database.replace(/`/g, '')}\`.* TO ?@?`, [user, h]);
    }
    await admin.query('FLUSH PRIVILEGES');
    console.log(`✔ Пользователь ${user} создан, права выданы только на ${database}.*`);
    console.log('Дальше: npm run task1');
  } catch (err) {
    console.error(`✖ ${err.code || err.name}: ${err.message}`);
    const hint = connectionHint(err);
    if (hint) console.error(`  ${hint.replace('npm run setup-db', 'этот скрипт')}`);
    process.exitCode = 1;
  } finally {
    await admin.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
