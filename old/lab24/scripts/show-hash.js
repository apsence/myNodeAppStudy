'use strict';

/** Показывает, как пароль хранится в БД (для скриншота): npm run show-hash -- --email=ivan@example.com */
const { MongoClient } = require('mongodb');
const { arg, mongoUri, dbName } = require('./_env');

async function main() {
  const email = String(arg('email', '')).trim().toLowerCase();
  if (!email) {
    console.error('Использование: npm run show-hash -- --email=ivan@example.com');
    process.exitCode = 1;
    return;
  }
  const client = new MongoClient(mongoUri, { serverSelectionTimeoutMS: 5000 });
  await client.connect();
  try {
    const user = await client.db(dbName).collection('users').findOne({ email }, { projection: { name: 1, email: 1, role: 1, password_hash: 1 } });
    if (!user) return console.log(`Пользователь ${email} не найден`);
    console.log(`email: ${user.email}, role: ${user.role}`);
    console.log(`password_hash: ${user.password_hash || '(пароль не задан)'}`);
    if (user.password_hash) {
      const [, version, cost] = user.password_hash.split('$');
      console.log(`формат bcrypt: версия $${version}$, cost=${cost} (2^${cost} раундов), длина ${user.password_hash.length} символов`);
      console.log('пароль в открытом виде в БД отсутствует');
    }
  } finally {
    await client.close();
  }
}

main().catch((err) => {
  console.error(`✖ ${err.message}`);
  process.exitCode = 1;
});
