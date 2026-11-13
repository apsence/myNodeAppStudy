'use strict';

const { MongoClient } = require('mongodb');
const { COLLECTIONS } = require('./constants');
const { STUDENT_SCHEMA } = require('../models/student');

/** Подключение к MongoDB, проверка реплика-сета, валидатор коллекции и индексы. */
class Database {
  constructor({ uri, dbName, logger, options = {} }) {
    this.uri = uri;
    this.dbName = dbName;
    this.logger = logger;
    this.options = options;
    this.client = null;
    this.db = null;
    this.replicaSet = null;
    this.connected = false;
  }

  get isConnected() { return this.connected; }
  get transactionsSupported() { return Boolean(this.replicaSet); }

  async connect() {
    this.client = new MongoClient(this.uri, {
      serverSelectionTimeoutMS: 5000,
      maxPoolSize: 20,
      appName: 'bbmo-01-23-lab23',
      ...this.options,
    });
    await this.client.connect();
    this.db = this.client.db(this.dbName);
    await this.db.command({ ping: 1 });
    this.replicaSet = await this._detectReplicaSet();
    this.connected = true;
    const mode = this.replicaSet
      ? `реплика-сет ${this.replicaSet}`
      : 'standalone: транзакции и Change Streams недоступны';
    this.logger.info(`MongoDB подключена: ${this.dbName} (${mode})`);
  }

  async _detectReplicaSet() {
    for (const cmd of [{ hello: 1 }, { isMaster: 1 }]) {
      try {
        const res = await this.db.command(cmd);
        return res.setName || null;
      } catch { /* пробуем следующую команду */ }
    }
    return null;
  }

  /** Валидатор уровня MongoDB ($jsonSchema). moderate — не трогает старые «неподходящие» документы. */
  async ensureValidator() {
    const name = COLLECTIONS.students;
    const validator = { $jsonSchema: STUDENT_SCHEMA };
    const exists = await this.db.listCollections({ name }, { nameOnly: true }).hasNext();
    if (exists) {
      await this.db.command({ collMod: name, validator, validationLevel: 'moderate', validationAction: 'error' });
    } else {
      await this.db.createCollection(name, { validator, validationLevel: 'moderate', validationAction: 'error' });
    }
    this.logger.info(`Валидатор коллекции ${name} установлен ($jsonSchema, level=moderate)`);
  }

  async ensureIndexes() {
    const c = this.db.collection(COLLECTIONS.students);
    const names = await Promise.all([
      c.createIndex({ group_name: 1 }, { name: 'group_name_1' }),
      c.createIndex({ name: 'text' }, { name: 'name_text', default_language: 'russian' }),
      c.createIndex({ email: 1 }, { name: 'email_1', unique: true, partialFilterExpression: { email: { $type: 'string' } } }),
    ]);
    this.logger.info(`Индексы созданы: ${names.join(', ')}`);
  }

  async close() {
    this.connected = false;
    if (this.client) await this.client.close();
  }
}

module.exports = { Database };
