'use strict';

/**
 * Задание 4 (сложный уровень)
 * Реплика-сет, транзакции (commit/abort, изоляция), Change Streams, Read Preference.
 * Нужен реплика-сет: docker compose up -d  (или mongod --replSet rs0 + rs.initiate()).
 *
 * Флаг --watch: после демонстрации оставить Change Stream открытым до Ctrl+C.
 */

const { performance } = require('node:perf_hooks');
const cfg = require('./config');
const { createClient, connectionHint } = require('./config/mongo');
const { sleep, ignoreNamespaceNotFound, line, errLine } = require('./utils/common');

const { GROUP, COLLECTIONS: C } = cfg;
const argv = process.argv.slice(2);

const student = (no, name, grade) => ({ student_no: no, name, group_name: GROUP, course: 2, grade, created_at: new Date() });

async function showReplicaSet(db) {
  console.log('=== Реплика-сет ===');
  const hello = await db.admin().command({ hello: 1 });
  if (!hello.setName) {
    console.log('✖ MongoDB запущена без реплика-сета — транзакции и Change Streams недоступны.');
    console.log('  Вариант 1: docker compose up -d   (реплика-сет rs0 инициализируется автоматически)');
    console.log('  Вариант 2: mongod --replSet rs0 ...  затем в mongosh: rs.initiate()');
    process.exitCode = 1;
    return null;
  }
  const secondaries = (hello.hosts || []).filter((h) => h !== hello.primary);
  console.log(`✔ Реплика-сет: ${hello.setName}`);
  console.log(`✔ Primary: ${hello.primary || '(выборы primary)'}`);
  console.log(`✔ Вторичные: ${secondaries.length ? secondaries.join(', ') : 'нет (один узел)'}`);
  try {
    const st = await db.admin().command({ replSetGetStatus: 1 });
    console.log('rs.status():');
    for (const m of st.members) console.log(`  - ${m.name}: ${m.stateStr}`);
  } catch (err) {
    console.log(`(rs.status() недоступен: ${err.message})`);
  }
  return { setName: hello.setName, primary: hello.primary, secondaries };
}

async function setupTxCollection(db) {
  await db.collection(C.tx).drop().catch(ignoreNamespaceNotFound);
  await db.createCollection(C.tx); // в транзакции коллекция должна уже существовать
  await db.collection(C.tx).createIndex({ student_no: 1 }, { unique: true, name: 'student_no_unique' });
}

async function demoCommit(client, db) {
  console.log('\n=== Транзакция (успех) ===');
  const tx = db.collection(C.tx);
  const session = client.startSession();
  console.log('[SESSION] Начало');
  try {
    session.startTransaction({ readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } });
    console.log('[BEGIN] Транзакция начата');
    await tx.insertOne(student(1, 'Иван', 4.5), { session });
    console.log('[INSERT] Студент 1: Иван');
    await tx.insertOne(student(2, 'Мария', 3.8), { session });
    console.log('[INSERT] Студент 2: Мария');
    await tx.updateOne({ student_no: 1 }, { $set: { grade: 4.8 } }, { session });
    console.log('[UPDATE] Студент 1: grade=4.8');

    const inside = await tx.countDocuments({}, { session });
    const outside = await tx.countDocuments({});
    console.log(`[MVCC] до COMMIT внутри транзакции документов: ${inside}, снаружи: ${outside} (изоляция снимков)`);

    await session.commitTransaction();
    console.log('[COMMIT] Транзакция зафиксирована');
  } catch (err) {
    console.log(`[ABORT] ${errLine(err)}`);
    if (session.inTransaction()) await session.abortTransaction().catch(() => {});
    throw err;
  } finally {
    await session.endSession();
    console.log('[SESSION] Завершена (endSession)');
  }
  console.log('✔ Данные сохранены');
  console.log(`Проверка: студентов в БД = ${await tx.countDocuments()}`);
}

async function demoRollback(client, db) {
  console.log('\n=== Транзакция (откат) ===');
  const tx = db.collection(C.tx);
  const session = client.startSession();
  try {
    session.startTransaction({ readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } });
    console.log('[BEGIN] Транзакция начата');
    await tx.insertOne(student(3, 'Петр', 4.2), { session });
    console.log('[INSERT] Студент 3: Петр');
    try {
      await tx.insertOne(student(3, 'Петр (дубликат)', 4.0), { session });
    } catch (err) {
      console.log(`[INSERT] Студент 3 (дубликат): ✖ E${err.code} ${err.codeName || 'DuplicateKey'}`);
      throw err;
    }
    await session.commitTransaction();
    console.log('[COMMIT] (не должно быть выполнено)');
  } catch (err) {
    if (session.inTransaction()) await session.abortTransaction().catch(() => {});
    console.log('[ABORT] Транзакция отменена');
  } finally {
    await session.endSession();
  }
  console.log('✔ Данные не сохранены');
  const count = await tx.countDocuments();
  const petr = await tx.findOne({ student_no: 3 });
  console.log(`Проверка: студентов в БД = ${count} (Петр ${petr ? 'ДОБАВЛЕН — ошибка!' : 'не добавлен'})`);
}

async function demoWithTransaction(client, db) {
  console.log('\n=== session.withTransaction() — автоматические повторы при временных ошибках ===');
  const tx = db.collection(C.tx);
  const session = client.startSession();
  try {
    await session.withTransaction(async () => {
      await tx.insertOne(student(4, 'Олег', 4.0), { session });
      await tx.insertOne(student(5, 'Анна', 5.0), { session });
    }, { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } });
    console.log(`✔ withTransaction выполнена, студентов в БД = ${await tx.countDocuments()}`);
  } finally {
    await session.endSession();
  }
}

const studentDoc = (name, grade) => ({ name, group_name: GROUP, course: 1, grade, created_at: new Date() });

async function demoChangeStream(db) {
  console.log('\n=== Change Streams ===');
  const students = db.collection(C.students);
  const stream = students.watch([], { fullDocument: 'updateLookup' });
  console.log(`[WATCH] Отслеживание коллекции ${C.students}`);
  await stream.tryNext(); // реально открывает курсор на сервере, чтобы не пропустить первые события

  const EXPECTED = 4;
  const seen = [];
  const consumer = (async () => {
    for await (const change of stream) {
      seen.push(change.operationType);
      if (change.operationType === 'insert') console.log(`[CHANGE] insert: ${line({ name: change.fullDocument.name })}`);
      else if (change.operationType === 'update') console.log(`[CHANGE] update: ${line({ _id: change.documentKey._id, ...change.updateDescription.updatedFields })}`);
      else if (change.operationType === 'replace') console.log(`[CHANGE] replace: ${line({ _id: change.documentKey._id, name: change.fullDocument.name, grade: change.fullDocument.grade })}`);
      else if (change.operationType === 'delete') console.log(`[CHANGE] delete: ${line({ _id: change.documentKey._id })}`);
      if (seen.length >= EXPECTED) break;
    }
  })();

  // Параллельно выполняем INSERT, UPDATE, REPLACE, DELETE
  const { insertedId } = await students.insertOne(studentDoc('Анна', 4.2));
  await sleep(250);
  await students.updateOne({ _id: insertedId }, { $set: { grade: 5.0 } });
  await sleep(250);
  await students.replaceOne({ _id: insertedId }, studentDoc('Анна Сидорова', 4.9));
  await sleep(250);
  await students.deleteOne({ _id: insertedId });

  await Promise.race([consumer, sleep(10000)]);
  await stream.close();
  console.log(`[WATCH] Stream закрыт (получено событий: ${seen.length}: ${seen.join(', ')})`);
}

async function watchForever(db) {
  console.log('\n[WATCH] Режим --watch: меняйте коллекцию students (например, из mongosh). Выход — Ctrl+C');
  const stream = db.collection(C.students).watch([], { fullDocument: 'updateLookup' });
  process.once('SIGINT', async () => {
    await stream.close();
    console.log('\n[WATCH] Stream закрыт');
  });
  try {
    for await (const change of stream) {
      console.log(`[CHANGE] ${change.operationType}: ${line(change.fullDocument || change.documentKey)}`);
    }
  } catch (err) {
    if (!stream.closed) throw err;
  }
}

async function demoReadPreference(client, db, rs) {
  console.log('\n=== Read Preference ===');
  const modes = ['primary', 'primaryPreferred', 'secondaryPreferred', 'nearest'];
  if (rs.secondaries.length) modes.push('secondary');
  else console.log('(режим secondary пропущен: вторичных узлов нет — запрос не нашёл бы подходящий сервер)');

  let served = new Set();
  client.on('commandSucceeded', (e) => {
    if (['aggregate', 'count', 'find'].includes(e.commandName)) served.add(e.address);
  });

  for (const mode of modes) {
    const coll = db.collection(C.tx, { readPreference: mode });
    served = new Set();
    for (let i = 0; i < 3; i++) await coll.countDocuments({}); // прогрев
    const N = 30;
    const t0 = performance.now();
    for (let i = 0; i < N; i++) await coll.countDocuments({});
    const avg = (performance.now() - t0) / N;
    console.log(`${mode.padEnd(20)} ${avg.toFixed(1).padStart(5)} мс   (отвечали: ${[...served].join(', ')})`);
  }
  console.log('primary — всегда актуальные данные; secondary* — разгружают primary, но данные могут отставать (репликационный лаг);');
  console.log('nearest — минимальная задержка по сети; для критичных чтений используйте primary + readConcern "majority".');
}

async function main() {
  const client = createClient({ monitorCommands: true });
  try {
    await client.connect();
  } catch (err) {
    console.error(`✖ Не удалось подключиться: ${errLine(err)}`);
    const hint = connectionHint(err);
    if (hint) console.error(`  Подсказка: ${hint}`);
    process.exitCode = 1;
    return;
  }
  try {
    const db = client.db(cfg.dbName);
    const rs = await showReplicaSet(db);
    if (!rs) return;
    await setupTxCollection(db);
    await demoCommit(client, db);
    await demoRollback(client, db);
    await demoWithTransaction(client, db);
    await demoChangeStream(db);
    await demoReadPreference(client, db, rs);
    if (argv.includes('--watch')) await watchForever(db);
  } finally {
    await client.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
