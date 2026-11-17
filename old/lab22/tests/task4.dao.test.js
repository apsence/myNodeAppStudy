'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { load, fakeDb, mysqlError } = require('./helpers');

const { StudentDAO } = load('dao/StudentDAO');
const { ValidationError } = load('lib/appErrors');

const ok = { name: 'Иван Иванов', group_name: 'ББМО-01-23', course: 2, grade: 4.5 };
const dbRow = (id, extra = {}) => ({ id, name: 'Иван', group_name: 'ББМО-01-23', course: 2, grade: '4.50', created_at: new Date(0), ...extra });

describe('Задание 4: StudentDAO — структура', () => {
  it('содержит все методы из задания и они асинхронные', () => {
    for (const m of ['create', 'findById', 'findAll', 'update', 'delete', 'search', 'getStats']) {
      assert.equal(typeof StudentDAO.prototype[m], 'function', m);
      assert.equal(StudentDAO.prototype[m].constructor.name, 'AsyncFunction', `${m} должен быть async`);
    }
  });
});

describe('Задание 4: StudentDAO.create / findById', () => {
  it('create: параметризованный INSERT, затем чтение созданной записи', async () => {
    const db = fakeDb((sql) => (sql.startsWith('INSERT') ? [{ insertId: 7, affectedRows: 1 }] : [[dbRow(7)]]));
    const created = await new StudentDAO(db).create(ok);
    assert.equal(db.calls[0].sql, 'INSERT INTO students (name, group_name, course, grade) VALUES (?, ?, ?, ?)');
    assert.deepEqual(db.calls[0].params, ['Иван Иванов', 'ББМО-01-23', 2, 4.5]);
    assert.equal(created.id, 7);
    assert.equal(created.grade, 4.5); // DECIMAL-строка приведена к числу
  });

  it('create: NULL-оценка передаётся как NULL', async () => {
    const db = fakeDb((sql) => (sql.startsWith('INSERT') ? [{ insertId: 1 }] : [[dbRow(1, { grade: null })]]));
    const { grade, ...noGrade } = ok;
    const created = await new StudentDAO(db).create(noGrade);
    assert.equal(db.calls[0].params[3], null);
    assert.equal(created.grade, null);
  });

  it('create: невалидные данные → ValidationError, SQL не выполняется', async () => {
    const db = fakeDb();
    await assert.rejects(new StudentDAO(db).create({ ...ok, name: 'И' }), (e) => e instanceof ValidationError && e.details[0].includes('слишком короткое'));
    assert.equal(db.calls.length, 0);
  });

  it('findById: плейсхолдер и проверка id; null, если записи нет', async () => {
    const db = fakeDb(() => [[]]);
    assert.equal(await new StudentDAO(db).findById(5), null);
    assert.deepEqual(db.calls[0].params, [5]);
    await assert.rejects(new StudentDAO(db).findById('1 OR 1=1'), ValidationError);
    assert.equal(db.calls.length, 1);
  });
});

describe('Задание 4: StudentDAO.findAll — пагинация, фильтры, сортировка', () => {
  const handler = (total) => (sql) => (sql.startsWith('SELECT COUNT') ? [[{ total }]] : [[dbRow(1), dbRow(2)]]);

  it('метаданные пагинации: всего, страница, число страниц', async () => {
    const dao = new StudentDAO(fakeDb(handler(100)));
    const r = await dao.findAll({ limit: 5, offset: 0 });
    assert.deepEqual(r.pagination, { total: 100, limit: 5, offset: 0, page: 1, pages: 20 });
    const last = await dao.findAll({ limit: 5, offset: 95 });
    assert.equal(last.pagination.page, 20);
    const odd = await new StudentDAO(fakeDb(handler(102))).findAll({ limit: 3 });
    assert.equal(odd.pagination.pages, 34); // как в примере задания 5
  });

  it('значения по умолчанию: LIMIT 10 OFFSET 0', async () => {
    const db = fakeDb(handler(0));
    await new StudentDAO(db).findAll();
    const sel = db.calls.find((c) => c.sql.startsWith('SELECT id'));
    assert.match(sel.sql, /LIMIT \? OFFSET \?$/);
    assert.deepEqual(sel.params.slice(-2), [10, 0]);
  });

  it('фильтры комбинируются через AND, все значения — параметры', async () => {
    const db = fakeDb(handler(3));
    await new StudentDAO(db).findAll({ group_name: 'ББМО-01-23', course: 2, grade_min: 4, grade_max: 5, limit: 10 });
    const sel = db.calls.find((c) => c.sql.startsWith('SELECT id'));
    assert.match(sel.sql, /WHERE group_name = \? AND course = \? AND grade >= \? AND grade <= \?/);
    assert.deepEqual(sel.params, ['ББМО-01-23', 2, 4, 5, 10, 0]);
    const cnt = db.calls.find((c) => c.sql.startsWith('SELECT COUNT'));
    assert.match(cnt.sql, /WHERE group_name = \? AND course = \? AND grade >= \? AND grade <= \?/);
  });

  it('без фильтров WHERE отсутствует', async () => {
    const db = fakeDb(handler(1));
    await new StudentDAO(db).findAll({});
    assert.ok(!db.calls[0].sql.includes('WHERE'));
  });

  const sorts = [
    [{ sortBy: 'name', order: 'asc' }, 'ORDER BY name ASC, id ASC'],
    [{ sortBy: 'name', order: 'desc' }, 'ORDER BY name DESC, id ASC'],
    [{ sortBy: 'grade', order: 'asc' }, 'ORDER BY grade ASC, id ASC'],
    [{ sortBy: 'grade', order: 'desc' }, 'ORDER BY grade DESC, id ASC'],
    [{ sortBy: 'created_at', order: 'desc' }, 'ORDER BY created_at DESC, id ASC'],
  ];
  for (const [opts, expected] of sorts) {
    it(`сортировка ${JSON.stringify(opts)} → ${expected}`, async () => {
      const db = fakeDb(handler(1));
      await new StudentDAO(db).findAll(opts);
      assert.ok(db.calls.find((c) => c.sql.startsWith('SELECT id')).sql.includes(expected));
    });
  }

  it('ORDER BY берётся из белого списка: попытка подставить SQL отклоняется до обращения к БД', async () => {
    const db = fakeDb(handler(1));
    await assert.rejects(new StudentDAO(db).findAll({ sortBy: 'grade; DROP TABLE students', order: 'asc' }), ValidationError);
    assert.equal(db.calls.length, 0);
  });
});

describe('Задание 4: StudentDAO.update / delete', () => {
  it('update: SET только переданных полей, значения — параметры; студент не найден → null', async () => {
    const db = fakeDb((sql) => (sql.startsWith('UPDATE') ? [{ affectedRows: 1, changedRows: 1 }] : [[dbRow(3, { grade: '4.80' })]]));
    const dao = new StudentDAO(db);
    const updated = await dao.update(3, { grade: 4.8, course: 3 });
    assert.equal(db.calls[0].sql, 'UPDATE students SET grade = ?, course = ? WHERE id = ?');
    assert.deepEqual(db.calls[0].params, [4.8, 3, 3]);
    assert.equal(updated.grade, 4.8);

    const none = await new StudentDAO(fakeDb(() => [{ affectedRows: 0 }])).update(99, { grade: 4 });
    assert.equal(none, null);
  });

  it('update: affectedRows=1 (найдено) считается успехом даже при changedRows=0 (то же значение)', async () => {
    const db = fakeDb((sql) => (sql.startsWith('UPDATE') ? [{ affectedRows: 1, changedRows: 0 }] : [[dbRow(1)]]));
    assert.notEqual(await new StudentDAO(db).update(1, { grade: 4.5 }), null);
  });

  it('update: неизвестные столбцы (id, created_at) не попадут в SQL', async () => {
    const db = fakeDb();
    await assert.rejects(new StudentDAO(db).update(1, { id: 5, 'grade = 5, name': 'x' }), ValidationError);
    assert.equal(db.calls.length, 0);
  });

  it('delete: true/false по affectedRows, id проверяется', async () => {
    assert.equal(await new StudentDAO(fakeDb(() => [{ affectedRows: 1 }])).delete(1), true);
    assert.equal(await new StudentDAO(fakeDb(() => [{ affectedRows: 0 }])).delete(1), false);
    await assert.rejects(new StudentDAO(fakeDb()).delete('abc'), ValidationError);
  });
});

describe('Задание 4: StudentDAO.search', () => {
  it('ищет через LIKE с параметром, возвращает found и данные', async () => {
    const db = fakeDb(() => [[dbRow(1, { name: 'Иван Иванов' }), dbRow(15, { name: 'Иван Петров' })]]);
    const r = await new StudentDAO(db).search('Иван');
    assert.match(db.calls[0].sql, /WHERE name LIKE \? ESCAPE/);
    assert.equal(db.calls[0].params[0], '%Иван%');
    assert.equal(r.found, 2);
  });

  it('спецсимволы LIKE экранируются, SQL-инъекция остаётся данными', async () => {
    const db = fakeDb();
    await new StudentDAO(db).search("50%_'; DROP TABLE students; --");
    assert.ok(!db.calls[0].sql.includes('DROP'));
    assert.equal(db.calls[0].params[0], "%50\\%\\_'; DROP TABLE students; --%");
  });

  it('пустой запрос и слишком длинный запрос отклоняются', async () => {
    const dao = new StudentDAO(fakeDb());
    await assert.rejects(dao.search('   '), ValidationError);
    await assert.rejects(dao.search('а'.repeat(101)), ValidationError);
    await assert.rejects(dao.search(undefined), ValidationError);
  });
});

describe('Задание 4: StudentDAO.getStats', () => {
  it('собирает общее число, средний/мин/макс, количество по группам и курсам', async () => {
    const db = fakeDb((sql) => {
      if (sql.includes('AVG(grade)')) return [[{ total: 100, averageGrade: '4.1234', minGrade: '2.50', maxGrade: '5.00' }]];
      if (sql.includes('GROUP BY group_name')) return [[{ group_name: 'ББМО-01-23', cnt: 40 }, { group_name: 'ББМО-02-23', cnt: 35 }, { group_name: 'ББМО-03-23', cnt: 25 }]];
      return [[{ course: 1, cnt: 30 }, { course: 2, cnt: 35 }, { course: 3, cnt: 20 }, { course: 4, cnt: 15 }]];
    });
    assert.deepEqual(await new StudentDAO(db).getStats(), {
      total: 100, averageGrade: 4.12, minGrade: 2.5, maxGrade: 5,
      byGroup: { 'ББМО-01-23': 40, 'ББМО-02-23': 35, 'ББМО-03-23': 25 },
      byCourse: { 1: 30, 2: 35, 3: 20, 4: 15 },
    });
  });

  it('пустая таблица: средний/мин/макс = null, без падения', async () => {
    const db = fakeDb((sql) => (sql.includes('AVG(grade)') ? [[{ total: 0, averageGrade: null, minGrade: null, maxGrade: null }]] : [[]]));
    const s = await new StudentDAO(db).getStats();
    assert.equal(s.total, 0);
    assert.equal(s.averageGrade, null);
    assert.deepEqual(s.byGroup, {});
  });
});

describe('Задание 5: StudentDAO.batchCreate (транзакция)', () => {
  const items = [ok, { ...ok, name: 'Мария Петрова' }];

  it('успех: все INSERT в одной транзакции → created и committed', async () => {
    const db = fakeDb();
    assert.deepEqual(await new StudentDAO(db).batchCreate(items), { created: 2, transaction: 'committed' });
    assert.deepEqual(db.txLog, ['begin', 'commit']);
    assert.equal(db.calls.length, 2);
  });

  it('ошибка INSERT (нет группы / дубликат) → rollback, ошибка помечена и содержит индекс', async () => {
    const db = fakeDb((sql, params, n) => { if (n === 2) throw mysqlError('ER_NO_REFERENCED_ROW_2'); return [{}]; });
    await assert.rejects(new StudentDAO(db).batchCreate(items), (e) => e.code === 'ER_NO_REFERENCED_ROW_2' && e.transaction === 'rolled back' && e.batchIndex === 1);
    assert.deepEqual(db.txLog, ['begin', 'rollback']);
  });

  it('невалидный элемент → ValidationError с индексами, транзакция не начинается', async () => {
    const db = fakeDb();
    await assert.rejects(
      new StudentDAO(db).batchCreate([ok, { name: 'X' }]),
      (e) => e instanceof ValidationError && e.details[0].index === 1
    );
    assert.deepEqual(db.txLog, []);
  });

  it('пустой массив и не-массив отклоняются', async () => {
    const dao = new StudentDAO(fakeDb());
    await assert.rejects(dao.batchCreate([]), ValidationError);
    await assert.rejects(dao.batchCreate({}), ValidationError);
  });
});
