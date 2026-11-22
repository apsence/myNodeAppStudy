'use strict';

/** Миграции MongoDB: npm run migrate [-- up|down|status]. Применённые миграции записываются в коллекцию migrations. */
const fs = require('node:fs');
const path = require('node:path');
const { MongoClient } = require('mongodb');
const { mongoUri, dbName } = require('./_env');

async function main() {
  const command = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : 'up';
  const dir = path.join(__dirname, '..', 'migrations');
  const files = fs.readdirSync(dir).filter((f) => /^\d{3}_.+\.js$/.test(f)).sort();
  const client = new MongoClient(mongoUri, { serverSelectionTimeoutMS: 5000 });
  await client.connect();
  try {
    const db = client.db(dbName);
    const log = db.collection('migrations');
    const applied = new Set((await log.find({}).toArray()).map((m) => m.name));

    if (command === 'status') {
      for (const f of files) console.log(`${applied.has(f.replace(/\.js$/, '')) ? '✔ применена    ' : '✖ не применена '} ${f}`);
    } else if (command === 'up') {
      let n = 0;
      for (const f of files) {
        const migration = require(path.join(dir, f));
        if (applied.has(migration.name)) continue;
        await migration.up(db);
        await log.insertOne({ name: migration.name, applied_at: new Date() });
        console.log(`✔ применена ${migration.name}`);
        n++;
      }
      console.log(n ? `Применено миграций: ${n}` : 'Новых миграций нет');
    } else if (command === 'down') {
      const last = [...files].reverse().map((f) => require(path.join(dir, f))).find((m) => applied.has(m.name));
      if (!last) return console.log('Откатывать нечего');
      await last.down(db);
      await log.deleteOne({ name: last.name });
      console.log(`✔ откачена ${last.name}`);
    } else {
      console.error('Команды: up | down | status');
      process.exitCode = 1;
    }
  } finally {
    await client.close();
  }
}

main().catch((err) => {
  console.error(`✖ ${err.message}`);
  process.exitCode = 1;
});
