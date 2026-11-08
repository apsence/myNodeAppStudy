'use strict';

/** Наполняет students тестовыми данными (по умолчанию 1000). Повторный запуск пересоздаёт seed-записи. */
const cfg = require('../config');
const { Database } = require('../config/database');
const { StudentDAO } = require('../dao/StudentDAO');
const { createLogger } = require('../utils/logger');
const { Metrics } = require('../utils/metrics');
const { mulberry32, hashString } = require('../utils/common');

const count = Number((process.argv.find((a) => a.startsWith('--count=')) || '').split('=')[1]) || 1000;
const GROUPS = ['ББМО-01-23', 'ББМО-02-23', 'ББМО-03-23'];
const NAMES = ['Иван Иванов', 'Мария Петрова', 'Пётр Сидоров', 'Анна Смирнова', 'Олег Кузнецов', 'Елена Попова', 'Дмитрий Лебедев', 'Ольга Козлова', 'Иван Соколов', 'Наталья Морозова'];

async function main() {
  const quiet = createLogger({ out: () => {} });
  const database = new Database({ uri: cfg.mongoUri, dbName: cfg.dbName, logger: quiet });
  await database.connect();
  await database.ensureValidator();
  await database.ensureIndexes();
  const dao = new StudentDAO({ database, logger: quiet, metrics: new Metrics() });

  const removed = await dao.collection.deleteMany({ email: /^seed\d+@bbmo\.example$/ });
  if (removed.deletedCount) console.log(`Удалено прежних seed-записей: ${removed.deletedCount}`);

  const rnd = mulberry32(hashString(cfg.GROUP));
  const items = Array.from({ length: count }, (_, i) => ({
    name: NAMES[Math.floor(rnd() * NAMES.length)],
    email: `seed${i + 1}@bbmo.example`,
    group_name: GROUPS[Math.floor(rnd() * GROUPS.length)],
    course: 1 + Math.floor(rnd() * 4),
    grade: Math.round((2 + rnd() * 3) * 10) / 10,
  }));

  const CHUNK = 500;
  for (let i = 0; i < items.length; i += CHUNK) {
    const res = await dao.batchCreate(items.slice(i, i + CHUNK));
    console.log(`  вставлено ${i + res.inserted}/${count} (${res.transaction})`);
  }
  console.log(`✔ Готово. Всего в коллекции: ${await dao.collection.countDocuments()}`);
  await database.close();
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
