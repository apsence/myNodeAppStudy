'use strict';

const { MongoClient } = require('mongodb');
const cfg = require('./index');

/** Создаёт MongoClient с разумными настройками по умолчанию (подключение — через client.connect()). */
function createClient(options = {}, uri = cfg.mongoUri) {
  return new MongoClient(uri, {
    serverSelectionTimeoutMS: 5000,
    appName: 'bbmo-01-23-lab23',
    ...options,
  });
}

/** Подсказка по частым причинам ошибок подключения. */
function connectionHint(err) {
  if (err && err.name === 'MongoServerSelectionError') {
    return 'Проверьте, что MongoDB запущена (docker compose up -d) и MONGODB_URI в .env указан верно.';
  }
  if (err && (err.name === 'MongoParseError' || err.name === 'MongoAPIError')) {
    return 'Неверный формат MONGODB_URI. Ожидается: mongodb://user:password@host:27017/bbmo_01_23';
  }
  if (err && err.code === 18) return 'Неверный логин или пароль в MONGODB_URI.';
  return null;
}

module.exports = { createClient, connectionHint };
