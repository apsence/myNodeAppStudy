'use strict';

/**
 * Создаёт (или повышает до admin) пользователя. Регистрация через API всегда даёт роль user.
 *   npm run create-admin -- --email=admin@bbmo.example --password=AdminPass123 [--role=admin|moderator]
 */
const { MongoClient } = require('mongodb');
const bcrypt = require('bcryptjs');
const { arg, mongoUri, dbName, rounds } = require('./_env');

async function main() {
  const email = String(arg('email', '')).trim().toLowerCase();
  const password = arg('password', '');
  const role = arg('role', 'admin');
  if (!email || password.length < 8 || !['admin', 'moderator', 'user'].includes(role)) {
    console.error('Использование: npm run create-admin -- --email=a@b.ru --password=МИНИМУМ8СИМВОЛОВ [--role=admin|moderator]');
    process.exitCode = 1;
    return;
  }
  const client = new MongoClient(mongoUri, { serverSelectionTimeoutMS: 5000 });
  await client.connect();
  try {
    const users = client.db(dbName).collection('users');
    const password_hash = await bcrypt.hash(password, rounds);
    const now = new Date();
    await users.updateOne(
      { email },
      { $set: { role, password_hash, updated_at: now }, $setOnInsert: { name: 'Администратор', group_name: 'ББМО-01-23', created_at: now } },
      { upsert: true }
    );
    console.log(`✔ Пользователь ${email} теперь имеет роль ${role}`);
  } finally {
    await client.close();
  }
}

main().catch((err) => {
  console.error(`✖ ${err.message}`);
  process.exitCode = 1;
});
