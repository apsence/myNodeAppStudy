'use strict';

/** npm run migrate | migrate:rollback [--steps=N | --all] | migrate:status */
const path = require('node:path');
const cfg = require('../config');
const { createSingleConnection } = require('../config/database');
const { createLogger } = require('../lib/logger');
const { Migrator } = require('../lib/migrator');
const { connectionHint } = require('../lib/errors');

async function main() {
  const command = process.argv[2] || 'up';
  const logger = createLogger();
  const conn = await createSingleConnection();
  try {
    const migrator = new Migrator({ conn, dir: path.join(cfg.rootDir, 'migrations'), logger });
    if (command === 'up') {
      const applied = await migrator.up();
      logger.info(applied.length ? `Миграции применены: ${applied.length} (${applied.join(', ')})` : 'Миграции применены: 0 (новых нет)');
    } else if (command === 'rollback') {
      const stepsArg = process.argv.find((a) => a.startsWith('--steps='));
      const steps = process.argv.includes('--all') ? Number.MAX_SAFE_INTEGER : Number(stepsArg ? stepsArg.split('=')[1] : 1) || 1;
      const rolledBack = await migrator.rollback(steps);
      logger.info(rolledBack.length ? `Откачено миграций: ${rolledBack.length} (${rolledBack.join(', ')})` : 'Откатывать нечего');
    } else if (command === 'status') {
      console.log('Статус миграций:');
      for (const m of await migrator.status()) console.log(`  ${m.applied ? '✔ применена ' : '✖ не применена'}  ${m.name}${m.applied_at ? `  (${m.applied_at.toISOString ? m.applied_at.toISOString() : m.applied_at})` : ''}`);
    } else {
      console.error(`Неизвестная команда: ${command}. Используйте up | rollback | status`);
      process.exitCode = 1;
    }
  } catch (err) {
    console.error(`✖ ${err.migration ? `[${err.migration}] ` : ''}${err.code || err.name}: ${err.message}`);
    const hint = connectionHint(err);
    if (hint) console.error(`  ${hint}`);
    process.exitCode = 1;
  } finally {
    await conn.end();
  }
}

main();
