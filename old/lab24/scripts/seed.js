'use strict';

/** Наполняет коллекцию users тестовыми данными (по умолчанию 100) и создаёт индексы. npm run seed -- --count=100 */
const { MongoClient } = require('mongodb');
const { arg, mongoUri, dbName } = require('./_env');

const GROUPS = ['ББМО-01-23', 'ББМО-02-23', 'ББМО-03-23'];
const FIRST = ['Иван', 'Мария', 'Пётр', 'Анна', 'Олег', 'Елена', 'Дмитрий', 'Ольга', 'Сергей', 'Наталья'];
const LAST = ['Иванов', 'Петров', 'Сидоров', 'Смирнов', 'Кузнецов', 'Попов', 'Лебедев', 'Козлов', 'Новиков', 'Морозов'];

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

async function main() {
  const count = Number(arg('count', 100));
  const client = new MongoClient(mongoUri, { serverSelectionTimeoutMS: 5000 });
  await client.connect();
  try {
    const users = client.db(dbName).collection('users');
    await users.createIndex({ email: 1 }, { unique: true, name: 'email_unique' });
    await users.createIndex({ name: 'text', email: 'text' }, { name: 'users_text', default_language: 'russian', weights: { name: 10, email: 5 } });
    await users.createIndex({ group_name: 1, course: 1 }, { name: 'group_course' });
    await users.deleteMany({ email: /^seed\d+@bbmo\.example$/ });

    const rnd = mulberry32(2023);
    const now = Date.now();
    const docs = Array.from({ length: count }, (_, i) => {
      const created = new Date(now - (count - i) * 3600 * 1000);
      return {
        name: `${FIRST[Math.floor(rnd() * FIRST.length)]} ${LAST[Math.floor(rnd() * LAST.length)]}`,
        email: `seed${i + 1}@bbmo.example`,
        group_name: GROUPS[Math.floor(rnd() * GROUPS.length)],
        course: 1 + Math.floor(rnd() * 4),
        age: 17 + Math.floor(rnd() * 9),
        role: 'user',
        created_at: created,
        updated_at: created,
      };
    });
    await users.insertMany(docs);
    console.log(`✔ Добавлено пользователей: ${docs.length}. Всего в коллекции: ${await users.countDocuments()}`);
  } finally {
    await client.close();
  }
}

main().catch((err) => {
  console.error(`✖ ${err.message}`);
  process.exitCode = 1;
});
