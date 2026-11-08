'use strict';

/**
 * Задание 3 (продвинутый уровень)
 * Курсоры, агрегации, потоковая обработка 1 000 000 документов, индексы и explain(),
 * текстовый поиск.
 *
 * Флаги: --size=N (по умолчанию BIG_SIZE из .env, 1 000 000), --reset (пересоздать данные)
 * Коллекции: students_big, groups, students_search.
 */

const { spawn } = require('node:child_process');
const { performance } = require('node:perf_hooks');
const cfg = require('./config');
const { createClient, connectionHint } = require('./config/mongo');
const { mulberry32, hashString, mb, ignoreNamespaceNotFound, line, errLine } = require('./utils/common');

const { GROUP, COLLECTIONS: C } = cfg;
const argv = process.argv.slice(2);
const argNum = (name, def) => {
  const a = argv.find((x) => x.startsWith(`${name}=`));
  return a ? Number(a.split('=')[1]) || def : def;
};
const SIZE = argNum('--size', cfg.bigSize);
const RESET = argv.includes('--reset');
const GROUPS = ['ББМО-01-23', 'ББМО-02-23', 'ББМО-03-23'];
const sec = (ms) => (ms / 1000).toFixed(2);

// ---------- генерация данных ----------

const MALE = [['Иван', 'Иванов'], ['Пётр', 'Петров'], ['Алексей', 'Смирнов'], ['Дмитрий', 'Кузнецов'], ['Сергей', 'Попов'], ['Андрей', 'Волков'], ['Иван', 'Соколов'], ['Олег', 'Лебедев']];
const FEMALE = [['Мария', 'Петрова'], ['Анна', 'Соколова'], ['Елена', 'Лебедева'], ['Ольга', 'Козлова'], ['Наталья', 'Новикова'], ['Ирина', 'Морозова'], ['Мария', 'Иванова'], ['Светлана', 'Попова']];

function makeStudent(i, rnd) {
  const [first, last] = rnd() < 0.5 ? MALE[Math.floor(rnd() * MALE.length)] : FEMALE[Math.floor(rnd() * FEMALE.length)];
  return {
    name: `${first} ${last}`,
    email: `student${i}@bbmo.example`,
    group_name: GROUPS[Math.floor(rnd() * GROUPS.length)],
    course: 1 + Math.floor(rnd() * 4),
    grade: Math.round((2 + rnd() * 3) * 10) / 10,
    created_at: new Date(),
  };
}

async function ensureData(db) {
  const coll = db.collection(C.big);
  if (RESET) await coll.drop().catch(ignoreNamespaceNotFound);
  const existing = await coll.estimatedDocumentCount();
  if (existing >= SIZE) {
    console.log(`Данные уже есть: ${existing} документов в ${C.big} (пропускаем генерацию; --reset — пересоздать)`);
    return existing;
  }
  if (existing > 0) await coll.drop().catch(ignoreNamespaceNotFound);

  console.log(`Генерация ${SIZE} документов в ${C.big} (батчи по 10 000)...`);
  const rnd = mulberry32(hashString(GROUP));
  const t0 = performance.now();
  const BATCH = 10000;
  let lastPct = 0;
  for (let start = 0; start < SIZE; start += BATCH) {
    const n = Math.min(BATCH, SIZE - start);
    const batch = Array.from({ length: n }, (_, k) => makeStudent(start + k + 1, rnd));
    await coll.insertMany(batch, { ordered: false });
    const pct = Math.floor(((start + n) / SIZE) * 10) * 10;
    if (pct > lastPct) {
      lastPct = pct;
      console.log(`  ${pct}% (${start + n}/${SIZE})`);
    }
  }
  console.log(`✔ Данные созданы за ${sec(performance.now() - t0)} сек`);
  return SIZE;
}

// ---------- курсоры ----------

function runToArrayChild() {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ['--max-old-space-size=64', __filename, '--child-toarray'], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '';
    let err = '';
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (err += d));
    child.on('close', (code, signal) => resolve({ code, signal, out, err }));
  });
}

async function demoCursors(db, total) {
  console.log('\n=== Курсоры ===');
  const coll = db.collection(C.big);

  const cursor = coll.find({}, { projection: { name: 1, grade: 1 } }).batchSize(1000);
  console.log(`find() вернул курсор (${cursor.constructor.name}), данные ещё не загружены`);
  console.log('cursor.next() — по одному документу:');
  for (let i = 0; i < 3; i++) console.log('  ' + line(await cursor.next()));
  await cursor.close();
  console.log(`cursor.close() выполнен, cursor.closed = ${cursor.closed}`);

  console.log(`\nИтерация через for await (batchSize: 1000), ${total} документов:`);
  let n = 0;
  let sum = 0;
  let peakHeap = process.memoryUsage().heapUsed;
  let peakRss = process.memoryUsage().rss;
  const t0 = performance.now();
  for await (const doc of coll.find({}, { projection: { grade: 1 } }).batchSize(1000)) {
    n++;
    sum += doc.grade; // «обработка» каждого документа
    if (n % 5000 === 0) {
      const m = process.memoryUsage();
      peakHeap = Math.max(peakHeap, m.heapUsed);
      peakRss = Math.max(peakRss, m.rss);
    }
  }
  console.log(`Получено ${n} документов за ${sec(performance.now() - t0)} сек, средняя оценка ${(sum / n).toFixed(2)}`);
  console.log(`Пик памяти: heap ${mb(peakHeap)} МБ, RSS ${mb(peakRss)} МБ (документы не накапливаются в памяти)`);

  console.log('\nЧерез toArray() (в отдельном процессе с лимитом кучи 64 МБ, чтобы не уронить основной):');
  const res = await runToArrayChild();
  const combined = `${res.err}\n${res.out}`;
  if (/heap out of memory|Allocation failed/i.test(combined)) {
    console.log('✖ Ошибка: JavaScript heap out of memory');
    console.log(`  toArray() попытался загрузить ${total} документов в память при лимите 64 МБ`);
  } else if (res.code === 0) {
    const info = JSON.parse(res.out.trim().split('\n').pop());
    console.log(`✔ toArray() отработал: ${info.count} документов, heap ${info.heapMB} МБ`);
    console.log('  Выборка слишком мала, чтобы исчерпать память — увеличьте --size.');
  } else {
    console.log(`✖ Дочерний процесс завершился с кодом ${res.code} ${res.signal || ''}`);
    console.log(combined.split('\n').slice(-6).join('\n'));
  }
}

// ---------- агрегации ----------

async function demoAggregations(db) {
  console.log('\n=== Агрегации ===');
  const coll = db.collection(C.big);
  const run = (pipeline) => coll.aggregate(pipeline, { allowDiskUse: true }).toArray();

  const t0 = performance.now();
  const avg = await run([
    { $group: { _id: '$group_name', avgGrade: { $avg: '$grade' }, students: { $sum: 1 } } },
    { $project: { _id: 0, group_name: '$_id', students: 1, avgGrade: { $round: ['$avgGrade', 2] } } },
    { $sort: { group_name: 1 } },
  ]);
  console.log(`Средний балл по группам ($group → $project → $sort), ${sec(performance.now() - t0)} сек:`);
  for (const r of avg) console.log(`  ${r.group_name}: ${r.avgGrade} (студентов: ${r.students})`);

  const byCourse = await run([{ $group: { _id: '$course', count: { $sum: 1 } } }, { $sort: { _id: 1 } }]);
  console.log('Количество студентов по курсам:');
  for (const r of byCourse) console.log(`  ${r._id} курс: ${r.count}`);

  const older = await run([
    { $match: { course: { $gte: 3 } } },
    { $group: { _id: '$group_name', count: { $sum: 1 } } },
    { $sort: { _id: 1 } },
  ]);
  console.log('Студенты 3–4 курсов по группам ($match → $group):');
  for (const r of older) console.log(`  ${r._id}: ${r.count}`);

  const top = await run([
    { $sort: { grade: -1, _id: 1 } },
    { $limit: 10 },
    { $project: { _id: 0, name: 1, group_name: 1, grade: 1 } },
  ]);
  console.log('Топ-10 студентов по оценке ($sort → $limit → $project):');
  top.forEach((r, i) => console.log(`  ${String(i + 1).padStart(2)}. ${r.name} (${r.group_name}) — ${r.grade}`));

  const groups = db.collection(C.groups);
  await groups.deleteMany({});
  await groups.insertMany([
    { group_name: 'ББМО-01-23', curator: 'Иванов И.И.' },
    { group_name: 'ББМО-02-23', curator: 'Петрова А.С.' },
    { group_name: 'ББМО-03-23', curator: 'Сидоров В.П.' },
  ]);
  const joined = await run([
    { $group: { _id: '$group_name', students: { $sum: 1 } } },
    { $lookup: { from: C.groups, localField: '_id', foreignField: 'group_name', as: 'group' } },
    { $unwind: '$group' },
    { $project: { _id: 0, group_name: '$_id', students: 1, curator: '$group.curator' } },
    { $sort: { group_name: 1 } },
  ]);
  console.log('\n$lookup (JOIN с коллекцией groups):');
  for (const r of joined) console.log('  ' + line(r));
}

// ---------- индексы ----------

function collectStages(plan, acc = []) {
  if (!plan) return acc;
  if (plan.stage) acc.push(plan.stage + (plan.indexName ? `(${plan.indexName})` : ''));
  if (plan.inputStage) collectStages(plan.inputStage, acc);
  if (plan.inputStages) plan.inputStages.forEach((s) => collectStages(s, acc));
  return acc;
}

async function explain(coll, filter) {
  const ex = await coll.find(filter).explain('executionStats');
  const es = ex.executionStats;
  const wp = ex.queryPlanner.winningPlan;
  return {
    ms: es.executionTimeMillis,
    docs: es.totalDocsExamined,
    keys: es.totalKeysExamined,
    returned: es.nReturned,
    stages: collectStages(wp.queryPlan || wp).join(' → '),
  };
}

async function avgWallMs(coll, filter, runs = 3) {
  let total = 0;
  for (let i = 0; i < runs; i++) {
    const t0 = performance.now();
    await coll.find(filter, { projection: { _id: 1 } }).toArray();
    total += performance.now() - t0;
  }
  return total / runs;
}

function printExplain(title, e, wall) {
  console.log(`${title}`);
  console.log(`  план: ${e.stages}`);
  console.log(`  executionTimeMillis: ${e.ms}`);
  console.log(`  totalKeysExamined: ${e.keys}`);
  console.log(`  totalDocsExamined: ${e.docs}`);
  console.log(`  nReturned: ${e.returned}`);
  console.log(`  среднее время запроса (3 прогона): ${wall.toFixed(1)} мс`);
}

async function demoIndexes(db) {
  console.log('\n=== Индексы ===');
  const coll = db.collection(C.big);
  await coll.dropIndexes(); // начинаем «с нуля»: остаётся только _id
  console.log('Существующие индексы сброшены (остался только _id_)');

  const filter = { group_name: GROUP, grade: { $gte: 4.9 } };
  console.log(`\nЗапрос: ${line(filter)}`);

  const e0 = await explain(coll, filter);
  const w0 = await avgWallMs(coll, filter);
  printExplain('\nexplain() БЕЗ индекса:', e0, w0);

  console.log(`\n✔ Создан индекс: ${await coll.createIndex({ group_name: 1 })}`);
  const e1 = await explain(coll, filter);
  printExplain('explain() с индексом group_name_1:', e1, await avgWallMs(coll, filter));

  console.log(`\n✔ Создан составной индекс: ${await coll.createIndex({ group_name: 1, grade: -1 })}`);
  const e2 = await explain(coll, filter);
  const w2 = await avgWallMs(coll, filter);
  printExplain('explain() с составным индексом group_name_1_grade_-1:', e2, w2);
  console.log(`\n✔ Просмотрено документов: ${e0.docs} → ${e2.docs} (в ${Math.round(e0.docs / Math.max(e2.docs, 1))} раз меньше)`);
  console.log(`✔ Ускорение по времени: в ${(w0 / Math.max(w2, 0.1)).toFixed(0)} раз (${w0.toFixed(1)} мс → ${w2.toFixed(1)} мс)`);

  const emailFilter = { email: `student${Math.ceil(SIZE / 2)}@bbmo.example` };
  const x0 = await explain(coll, emailFilter);
  console.log(`\nПоиск по email без индекса: ${x0.stages}, просмотрено документов: ${x0.docs}`);
  console.log(`✔ Создан уникальный индекс: ${await coll.createIndex({ email: 1 }, { unique: true })}`);
  const x1 = await explain(coll, emailFilter);
  console.log(`Поиск по email с unique-индексом: ${x1.stages}, просмотрено документов: ${x1.docs}`);

  try {
    await coll.insertOne({ name: 'Дубликат', email: emailFilter.email, group_name: GROUP, course: 1, grade: 3 });
    console.log('⚠ дубликат email неожиданно вставился');
  } catch (err) {
    console.log(`✔ Уникальность работает: вставка дубликата отклонена (E${err.code}: ${err.codeName || 'DuplicateKey'})`);
  }
}

// ---------- текстовый поиск ----------

async function demoTextSearch(db) {
  console.log('\n=== Текстовый поиск ===');
  await db.collection(C.search).drop().catch(ignoreNamespaceNotFound);
  await db
    .collection(C.big)
    .aggregate([{ $limit: 20000 }, { $project: { name: 1, group_name: 1, course: 1, grade: 1 } }, { $out: C.search }])
    .toArray();
  const coll = db.collection(C.search);
  console.log(`Подготовлена коллекция ${C.search} (${await coll.countDocuments()} документов)`);
  console.log(`Создан текстовый индекс: ${await coll.createIndex({ name: 'text' }, { name: 'name_text', default_language: 'russian' })}`);

  for (const query of ['Иван', 'Иван Петров']) {
    const filter = { $text: { $search: query } };
    const found = await coll.countDocuments(filter);
    const rows = await coll
      .find(filter, { projection: { _id: 0, name: 1, score: { $meta: 'textScore' } }, sort: { score: { $meta: 'textScore' } }, limit: 3 })
      .toArray();
    console.log(`\nfind({ $text: { $search: "${query}" } }):`);
    console.log(`Найдено: ${found} документов`);
    rows.forEach((r, i) => console.log(`  Топ-${i + 1}: score=${r.score.toFixed(2)}, name="${r.name}"`));
  }
  console.log('\nРанжирование: документы, содержащие оба слова запроса, получают больший score.');
}

// ---------- запуск ----------

async function childToArray() {
  const client = createClient();
  await client.connect();
  const docs = await client.db(cfg.dbName).collection(C.big).find({}).toArray();
  console.log(JSON.stringify({ count: docs.length, heapMB: mb(process.memoryUsage().heapUsed) }));
  await client.close();
}

async function main() {
  const client = createClient();
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
    console.log(`=== Подготовка данных (группа ${GROUP}) ===`);
    const total = await ensureData(db);
    await demoCursors(db, total);
    await demoAggregations(db);
    await demoIndexes(db);
    await demoTextSearch(db);
  } finally {
    await client.close();
  }
}

if (argv.includes('--child-toarray')) {
  childToArray().catch((err) => {
    console.error(err);
    process.exit(2);
  });
} else {
  main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
