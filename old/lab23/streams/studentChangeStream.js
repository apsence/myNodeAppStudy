'use strict';

const EventEmitter = require('node:events');
const { COLLECTIONS } = require('../config/constants');
const { sleep } = require('../utils/common');

/** Приводит событие Change Stream к компактному виду для логов и WebSocket. */
function formatChange(change) {
  const upd = change.updateDescription || {};
  return {
    operation: change.operationType,
    id: change.documentKey ? String(change.documentKey._id) : null,
    document: change.fullDocument || null,
    updatedFields: upd.updatedFields || undefined,
    removedFields: upd.removedFields && upd.removedFields.length ? upd.removedFields : undefined,
    at: new Date().toISOString(),
  };
}

/**
 * Следит за коллекцией students и генерирует событие 'change'.
 * При обрыве переоткрывается с resumeAfter (токен последнего события).
 */
class StudentChangeStream extends EventEmitter {
  constructor({ database, logger }) {
    super();
    this.database = database;
    this.logger = logger;
    this.stopped = true;
    this.active = false;
    this.stream = null;
    this.resumeToken = null;
    this.loop = null;
  }

  async start() {
    if (!this.database.replicaSet) {
      this.logger.warn('Change Stream не запущен: MongoDB не в режиме реплика-сета');
      return false;
    }
    this.stopped = false;
    let signalReady;
    const ready = new Promise((resolve) => { signalReady = resolve; });
    this.loop = this._run(signalReady);
    await ready;
    return this.active;
  }

  async _run(signalReady) {
    let first = true;
    while (!this.stopped) {
      try {
        const options = { fullDocument: 'updateLookup' };
        if (this.resumeToken) options.resumeAfter = this.resumeToken;
        this.stream = this.database.db.collection(COLLECTIONS.students).watch([], options);
        await this.stream.tryNext(); // открываем курсор на сервере до первого события
        this.active = true;
        if (first) { this.logger.info('Change Stream запущен'); first = false; }
        signalReady();
        for await (const change of this.stream) {
          this.resumeToken = change._id;
          this.emit('change', formatChange(change));
        }
      } catch (err) {
        this.active = false;
        if (this.stopped) break;
        this.logger.error(`Change Stream: ${err.message}; повтор через 2 с`);
        signalReady();
        await sleep(2000);
      }
    }
    this.active = false;
    signalReady();
  }

  async stop() {
    this.stopped = true;
    if (this.stream) await this.stream.close().catch(() => {});
    if (this.loop) await this.loop.catch(() => {});
    this.logger.info('Change Stream закрыт');
  }
}

module.exports = { StudentChangeStream, formatChange };
