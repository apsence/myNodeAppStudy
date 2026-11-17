'use strict';

/** Удаляет ВСЕ таблицы лабораторной (students, groups, migrations, big_data, демо-таблицы). */
const { createSingleConnection } = require('../config/database');

const TABLES = ['students', '`groups`', 'migrations', 'big_data', 'tx_students', 'err_orders', 'err_users', 'injection_demo'];

async function main() {
  const conn = await createSingleConnection();
  try {
    await conn.query('SET FOREIGN_KEY_CHECKS = 0');
    for (const t of TABLES) await conn.query(`DROP TABLE IF EXISTS ${t}`);
    await conn.query('SET FOREIGN_KEY_CHECKS = 1');
    console.log(`✔ Удалены таблицы: ${TABLES.map((t) => t.replace(/`/g, '')).join(', ')}`);
  } finally {
    await conn.end();
  }
}

main().catch((err) => {
  console.error(`✖ ${err.code || err.name}: ${err.message}`);
  process.exitCode = 1;
});
