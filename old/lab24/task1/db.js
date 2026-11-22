'use strict';

const { MongoClient } = require('mongodb');

let client = null;
let db = null;

/** MongoClient инициализируется ОДИН раз при старте приложения. */
async function connect({ uri, dbName }) {
  if (db) return db;
  client = new MongoClient(uri, { serverSelectionTimeoutMS: 5000 });
  await client.connect();
  db = client.db(dbName);
  await db.collection('users').createIndex({ email: 1 }, { unique: true, name: 'email_unique' });
  return db;
}

function getDb() {
  if (!db) throw new Error('MongoDB не подключена: сначала вызовите connect()');
  return db;
}

async function close() {
  if (client) await client.close();
  client = null;
  db = null;
}

module.exports = { connect, getDb, close };
