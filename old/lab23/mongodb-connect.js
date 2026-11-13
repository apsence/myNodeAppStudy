'use strict';

/**
 * Задание 1 (базовый уровень)
 * Подключение к MongoDB через официальный драйвер:
 *  - MongoClient: connect() / db() / command({ping}) / close()
 *  - информация о сервере (buildInfo, listDatabases, listCollections)
 *  - разница «одно соединение» и MongoClient (пул соединений)
 *  - heartbeat-события и автоматическое переподключение
 *  - ошибки подключения (неверный URI)
 *
 * Флаги: --heartbeats=N (сколько секунд наблюдать), --no-reconnect, --no-errors
 */

const net = require('node:net');
const { performance } = require('node:perf_hooks');
const { MongoClient } = require('mongodb');
const cfg = require('./config');
const { connectionHint } = require('./config/mongo');
const { sleep, errLine } = require('./utils/common');

const argv = process.argv.slice(2);
const hasFlag = (f) => argv.includes(f);
const argNum = (name, def) => {
  const a = argv.find((x) => x.startsWith(`${name}=`));
  return a ? Number(a.split('=')[1]) || def : def;
};

const HEARTBEATS = argNum('--heartbeats', 4);
const HB_MS = 1000; // heartbeatFrequencyMS (минимум для драйвера — 500)
const iso = () => new Date().toISOString();

/** Логирование heartbeat-событий мониторинга топологии (SDAM). */
function watchHeartbeats(client, stats) {
  client.on('serverHeartbeatSucceeded', (e) => {
    stats.ok++;
    console.log(`[HEARTBEAT] Успешно: ${iso()} (${Math.round(e.duration)} мс)`);
  });
  client.on('serverHeartbeatFailed', (e) => {
    stats.failed++;
    console.log(`[HEARTBEAT] ✖ Ошибка: ${iso()} — ${(e.failure && e.failure.message) || 'нет ответа'}`);
  });
}

async function printServerInfo(client, db) {
  console.log('\n=== Информация о сервере ===');

  try {
    const status = await db.command({ connectionStatus: 1 });
    const users = status.authInfo && status.authInfo.authenticatedUsers;
    const user = users && users.length ? users[0].user : (cfg.parseUri(cfg.mongoUri) || {}).user;
    console.log(`Пользователь: ${user || '(без аутентификации)'}`);
  } catch (err) {
    console.log(`Пользователь: не удалось определить (${err.message})`);
  }

  try {
    const { databases } = await client.db().admin().listDatabases();
    console.log('Список БД:');
    for (const d of databases) console.log(`- ${d.name}`);
    if (!databases.some((d) => d.name === cfg.dbName)) {
      console.log(`(БД ${cfg.dbName} в списке нет — она создаётся лениво при первой вставке)`);
    }
  } catch (err) {
    console.log(`Список БД недоступен (нет прав на listDatabases): ${err.message}`);
  }

  const collections = await db.listCollections({}, { nameOnly: true }).toArray();
  console.log(`Коллекции в ${cfg.dbName}:`);
  if (collections.length === 0) console.log('(пусто — БД создаётся лениво при первой вставке)');
  for (const c of collections) console.log(`- ${c.name}`);
}

/** Сколько соединений создаёт клиент при N параллельных запросах и каким размером пула. */
async function poolRun(maxPoolSize, parallel) {
  const client = new MongoClient(cfg.mongoUri, { maxPoolSize, serverSelectionTimeoutMS: 5000 });
  let created = 0;
  client.on('connectionCreated', () => created++);
  await client.connect();
  const db = client.db(cfg.dbName);
  const t0 = performance.now();
  await Promise.all(Array.from({ length: parallel }, () => db.command({ ping: 1 })));
  const ms = performance.now() - t0;
  await client.close();
  return { created, ms };
}

async function demoSingleVsPool() {
  console.log('\n=== Одиночное соединение vs MongoClient (пул соединений) ===');
  const parallel = 30;
  const single = await poolRun(1, parallel);
  const pooled = await poolRun(10, parallel);
  console.log(`maxPoolSize=1  (одно соединение): ${parallel} параллельных ping → соединений создано: ${single.created}, ${single.ms.toFixed(0)} мс`);
  console.log(`maxPoolSize=10 (MongoClient)    : ${parallel} параллельных ping → соединений создано: ${pooled.created}, ${pooled.ms.toFixed(0)} мс`);
  console.log('MongoClient = пул соединений + фоновый мониторинг топологии. Его создают один раз на приложение,');
  console.log('а client.db(name) — лёгкая операция (просто обёртка, сетевых запросов не делает).');
}

/** Простейший TCP-прокси, чтобы «оборвать» и «вернуть» сеть без остановки самой MongoDB. */
class TcpProxy {
  constructor(host, port) {
    this.host = host;
    this.port = port;
    this.sockets = new Set();
    this.server = null;
    this.listenPort = 0;
  }

  _listen() {
    return new Promise((resolve, reject) => {
      this.server = net.createServer((client) => {
        const upstream = net.connect(this.port, this.host);
        this.sockets.add(client).add(upstream);
        const close = () => {
          client.destroy();
          upstream.destroy();
          this.sockets.delete(client);
          this.sockets.delete(upstream);
        };
        client.on('error', close).on('close', close);
        upstream.on('error', close).on('close', close);
        client.pipe(upstream);
        upstream.pipe(client);
      });
      this.server.once('error', reject);
      this.server.listen(this.listenPort, '127.0.0.1', () => {
        this.listenPort = this.server.address().port;
        resolve(this.listenPort);
      });
    });
  }

  start() { return this._listen(); }

  async drop() {
    for (const s of this.sockets) s.destroy();
    this.sockets.clear();
    await new Promise((resolve) => this.server.close(resolve));
  }

  restore() { return this._listen(); }
}

function proxiedUri(uri, proxyPort) {
  const u = new URL(uri);
  u.hostname = '127.0.0.1';
  u.port = String(proxyPort);
  if (!u.pathname || u.pathname === '') u.pathname = '/';
  u.searchParams.set('directConnection', 'true'); // не «убегать» на адреса из конфигурации реплика-сета
  return u.toString();
}

async function demoReconnect() {
  console.log('\n=== Переподключение при потере связи (имитация через TCP-прокси) ===');
  const target = cfg.parseUri(cfg.mongoUri);
  if (!target || target.protocol !== 'mongodb:') {
    console.log('Пропущено: демонстрация поддерживает только URI вида mongodb://host:port/db с одним хостом.');
    return;
  }

  const proxy = new TcpProxy(target.host, target.port);
  const port = await proxy.start();
  const client = new MongoClient(proxiedUri(cfg.mongoUri, port), {
    heartbeatFrequencyMS: HB_MS,
    serverMonitoringMode: 'poll',
    serverSelectionTimeoutMS: 2000,
    connectTimeoutMS: 1000,
  });
  const stats = { ok: 0, failed: 0 };
  try {
    await client.connect();
    const db = client.db(cfg.dbName);
    await db.command({ ping: 1 });
    console.log(`✔ Подключено через прокси 127.0.0.1:${port} → ${target.host}:${target.port}`);
    watchHeartbeats(client, stats);
    await sleep(2200);

    console.log('⚡ Обрываем сеть (прокси закрывает все TCP-соединения)...');
    await proxy.drop();
    await sleep(2500);
    try {
      await db.command({ ping: 1 });
      console.log('ping неожиданно прошёл');
    } catch (err) {
      console.log(`✖ ping во время обрыва: ${errLine(err)}`);
    }

    console.log('⚡ Сеть восстановлена');
    await proxy.restore();
    let recovered = false;
    for (let attempt = 1; attempt <= 10 && !recovered; attempt++) {
      try {
        await db.command({ ping: 1 });
        recovered = true;
        console.log(`✔ Драйвер переподключился автоматически (попытка ${attempt}), новый MongoClient не создавался`);
      } catch {
        await sleep(500);
      }
    }
    if (!recovered) console.log('✖ Переподключиться не удалось');
    await sleep(1200);
    console.log(`Итого heartbeat: успешных ${stats.ok}, неудачных ${stats.failed}`);
  } finally {
    await client.close().catch(() => {});
    await proxy.drop().catch(() => {});
  }
}

async function demoBadUris() {
  console.log('\n=== Ошибки подключения ===');

  console.log('1) Неверный формат URI (http:// вместо mongodb://):');
  try {
    new MongoClient('http://localhost:27017');
  } catch (err) {
    console.log(`✖ ${errLine(err)}`);
  }

  console.log('2) Недоступный сервер (порт 1), serverSelectionTimeoutMS=2000:');
  const unreachable = new MongoClient('mongodb://student:password@localhost:1/bbmo_01_23', { serverSelectionTimeoutMS: 2000 });
  try {
    await unreachable.connect();
    await unreachable.db('bbmo_01_23').command({ ping: 1 });
  } catch (err) {
    console.log(`✖ ${errLine(err)}`);
  } finally {
    await unreachable.close().catch(() => {});
  }

  const parsed = cfg.parseUri(cfg.mongoUri);
  if (parsed && parsed.user) {
    console.log(`3) Неверный пароль для пользователя ${parsed.user}:`);
    const u = new URL(cfg.mongoUri);
    u.password = 'wrong-password-123';
    const bad = new MongoClient(u.toString(), { serverSelectionTimeoutMS: 3000 });
    try {
      await bad.connect();
      await bad.db(cfg.dbName).command({ ping: 1 });
      console.log('(сервер принял неверный пароль — аутентификация на сервере выключена)');
    } catch (err) {
      console.log(`✖ ${errLine(err)}`);
    } finally {
      await bad.close().catch(() => {});
    }
  }
}

async function main() {
  console.log('=== Подключение к MongoDB ===');
  console.log(`URI: ${cfg.maskUri(cfg.mongoUri)}`);

  const client = new MongoClient(cfg.mongoUri, {
    heartbeatFrequencyMS: HB_MS,
    serverMonitoringMode: 'poll', // регулярный опрос — удобно показывать heartbeat
    serverSelectionTimeoutMS: 5000,
    appName: 'bbmo-01-23-lab23',
  });

  try {
    await client.connect();                  // установка соединения с кластером
    const db = client.db(cfg.dbName);        // доступ к БД — лёгкая операция, без сети
    await db.command({ ping: 1 });           // проверка соединения
    const { version } = await db.admin().command({ buildInfo: 1 });
    console.log('✔ Подключение установлено');
    console.log(`Версия MongoDB: ${version}`);
    console.log(`База данных: ${cfg.dbName}`);

    await printServerInfo(client, db);
    await demoSingleVsPool();

    console.log('\n=== Heartbeat ===');
    const stats = { ok: 0, failed: 0 };
    watchHeartbeats(client, stats);
    await sleep(HEARTBEATS * HB_MS + 500);
    console.log(stats.failed === 0 && stats.ok > 0 ? '✔ Соединение стабильно' : `⚠ Успешных: ${stats.ok}, неудачных: ${stats.failed}`);
  } catch (err) {
    console.error(`✖ Не удалось подключиться: ${errLine(err)}`);
    const hint = connectionHint(err);
    if (hint) console.error(`  Подсказка: ${hint}`);
    process.exitCode = 1;
    await client.close().catch(() => {});
    if (!hasFlag('--no-errors')) await demoBadUris();
    return;
  }

  await client.close();
  console.log('✔ Соединение закрыто (client.close())');

  if (!hasFlag('--no-reconnect')) await demoReconnect();
  if (!hasFlag('--no-errors')) await demoBadUris();
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
