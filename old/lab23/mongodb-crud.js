'use strict';

/**
 * Задание 2 (средний уровень)
 * CRUD-операции с коллекцией students: insert, find (фильтр, сортировка, пагинация,
 * проекция), update ($set, $inc, $unset, $push), delete.
 * ВНИМАНИЕ: в начале коллекция students пересоздаётся (drop), чтобы запуск был воспроизводимым.
 */

const cfg = require('./config');
const { createClient, connectionHint } = require('./config/mongo');
const { ignoreNamespaceNotFound, line, errLine } = require('./utils/common');

const GROUP = cfg.GROUP;
const OTHER = 'ББМО-02-23';
const doc = (name, group_name, course, grade) => ({ name, group_name, course, grade, created_at: new Date() });
const printDocs = (docs) => docs.forEach((d) => console.log('  ' + line(d)));
const bytes = (value) => Buffer.byteLength(JSON.stringify(value));

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
    const students = db.collection(cfg.COLLECTIONS.students);
    await students.drop().catch(ignoreNamespaceNotFound);

    console.log(`=== Коллекция students (группа ${GROUP}) ===`);
    console.log(`Индекс: ${await students.createIndex({ group_name: 1 })}`);

    // ---------------- INSERT ----------------
    console.log('\n--- INSERT ---');
    const one = await students.insertOne(doc('Иван Иванов', GROUP, 2, 4.5));
    console.log(`✔ insertOne: insertedId=${line(one.insertedId)}`);

    const many = await students.insertMany([
      doc('Мария Петрова', GROUP, 2, 3.8),
      doc('Пётр Сидоров', GROUP, 3, 4.2),
      doc('Анна Смирнова', GROUP, 1, 4.9),
    ]);
    console.log(`✔ insertMany: вставлено ${many.insertedCount} документа, insertedIds=${line(many.insertedIds)}`);

    const bulk = await students.insertMany([
      doc('Олег Кузнецов', GROUP, 2, 3.1),
      doc('Елена Попова', GROUP, 4, 4.7),
      doc('Дмитрий Лебедев', OTHER, 3, 2.8),
      doc('Ольга Козлова', OTHER, 1, 2.5),
      doc('Сергей Волков', OTHER, 2, 3.9),
      doc('Наталья Морозова', OTHER, 3, 2.4),
      doc('Андрей Новиков', OTHER, 4, 4.4),
    ]);
    console.log(`✔ insertMany: ещё ${bulk.insertedCount} документов (всего ${await students.countDocuments()})`);

    // ---------------- SELECT ----------------
    console.log('\n--- SELECT ---');
    const all = await students.find({}).toArray();
    console.log(`Все документы (${all.length}):`);
    printDocs(all.slice(0, 3));
    console.log('  ...');
    console.log('⚠ toArray() загружает ВСЕ документы в память — для больших коллекций используйте limit() или for await по курсору.');

    const byGroup = await students.find({ group_name: GROUP }).toArray();
    console.log(`\nС фильтром { group_name: "${GROUP}" } (${byGroup.length}):`);
    printDocs(byGroup);

    const sorted = await students.find({}).sort({ grade: -1 }).limit(5).toArray();
    console.log('\nС сортировкой { grade: -1 }, топ-5:');
    printDocs(sorted.map(({ name, group_name, grade }) => ({ name, group_name, grade })));

    const pageSize = 3;
    for (const page of [1, 2]) {
      const rows = await students.find({}).sort({ grade: -1, _id: 1 }).skip((page - 1) * pageSize).limit(pageSize).toArray();
      console.log(`\nПагинация: страница ${page} (skip(${(page - 1) * pageSize}).limit(${pageSize})):`);
      printDocs(rows.map(({ name, grade }) => ({ name, grade })));
    }
    console.log('(skip() на больших смещениях медленный — лучше пагинация по значению индексированного поля)');

    const found = await students.findOne({ _id: one.insertedId });
    console.log(`\nfindOne({ _id: ... }):`);
    printDocs([found]);

    // Проекция
    console.log('\nС проекцией { name: 1, grade: 1, _id: 0 }:');
    const projected = await students.find({}, { projection: { name: 1, grade: 1, _id: 0 } }).toArray();
    printDocs(projected.slice(0, 4));
    const fullSize = bytes(all);
    const projSize = bytes(projected);
    console.log(`Размер выборки: полная ${fullSize} байт, с проекцией ${projSize} байт (−${Math.round((1 - projSize / fullSize) * 100)}% трафика)`);

    // ---------------- UPDATE ----------------
    console.log('\n--- UPDATE ---');
    let r = await students.updateOne({ name: 'Иван Иванов' }, { $set: { grade: 4.8 } });
    console.log(`✔ updateOne ($set grade=4.8): matchedCount=${r.matchedCount}, modifiedCount=${r.modifiedCount}`);
    r = await students.updateOne({ name: 'Иван Иванов' }, { $set: { grade: 4.8 } });
    console.log(`  повтор с тем же значением: matchedCount=${r.matchedCount}, modifiedCount=${r.modifiedCount} (нашли, но менять нечего)`);

    r = await students.updateMany({ group_name: GROUP }, { $inc: { course: 1 } });
    console.log(`✔ updateMany (group=${GROUP}, $inc: course+1): matchedCount=${r.matchedCount}, modifiedCount=${r.modifiedCount}`);

    r = await students.updateOne({ name: 'Мария Петрова' }, { $push: { tags: 'староста' } });
    console.log(`✔ updateOne ($push tags): matchedCount=${r.matchedCount}, modifiedCount=${r.modifiedCount}`);
    await students.updateOne({ name: 'Мария Петрова' }, { $set: { note: 'проверить документы' } });
    r = await students.updateOne({ name: 'Мария Петрова' }, { $unset: { note: '' } });
    console.log(`✔ updateOne ($unset note): matchedCount=${r.matchedCount}, modifiedCount=${r.modifiedCount}`);
    printDocs([await students.findOne({ name: 'Мария Петрова' }, { projection: { _id: 0, name: 1, course: 1, tags: 1, note: 1 } })]);

    // ---------------- DELETE ----------------
    console.log('\n--- DELETE ---');
    let d = await students.deleteOne({ name: 'Андрей Новиков' });
    console.log(`✔ deleteOne: deletedCount=${d.deletedCount}`);
    d = await students.deleteMany({ grade: { $lt: 3 } });
    console.log(`✔ deleteMany (grade < 3): deletedCount=${d.deletedCount}`);
    console.log(`\nОсталось документов: ${await students.countDocuments()}`);
  } finally {
    await client.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
