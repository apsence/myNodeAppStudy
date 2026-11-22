'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./helpers');

const { validateStudent, parseListOptions, parseId } = load('models/student');
const { validateGroup } = load('models/group');
const { ValidationError } = load('lib/appErrors');

const ok = { name: 'Иван Иванов', group_name: 'ББМО-01-23', course: 2, grade: 4.5 };

describe('Задание 4: валидация студента', () => {
  it('корректные данные проходят', () => {
    assert.equal(validateStudent(ok).valid, true);
  });

  it('name: обязательное, от 2 до 100 символов (сообщения как в задании)', () => {
    assert.deepEqual(validateStudent({ ...ok, name: 'И' }).errors, ['name слишком короткое (мин. 2 символа)']);
    assert.ok(validateStudent({ ...ok, name: 'А'.repeat(101) }).errors[0].includes('слишком длинное'));
    assert.equal(validateStudent({ ...ok, name: 'А'.repeat(100) }).valid, true);
    assert.equal(validateStudent({ ...ok, name: 'Ив' }).valid, true);
    assert.ok(validateStudent({ group_name: ok.group_name, course: 1 }).errors.includes('name обязательно'));
    assert.equal(validateStudent({ ...ok, name: '   ' }).valid, false); // одни пробелы
  });

  it('group_name: формат ББМО-XX-XX', () => {
    assert.deepEqual(validateStudent({ ...ok, group_name: 'XX-1' }).errors, ['group_name не соответствует формату ББМО-XX-XX']);
    for (const bad of ['ББМО-1-23', 'ББМО-01-2023', 'ббмо-01-23', 'ББМО-01-23 ', 'ББМО-AB-CD']) {
      // пробел по краям обрезается, поэтому 'ББМО-01-23 ' становится корректным
      assert.equal(validateStudent({ ...ok, group_name: bad }).valid, bad === 'ББМО-01-23 ', bad);
    }
    assert.equal(validateStudent({ ...ok, group_name: 'ББМО-02-24' }).valid, true);
  });

  it('course: целое от 1 до 4', () => {
    for (const bad of [0, 5, 2.5, '2', null, NaN]) assert.equal(validateStudent({ ...ok, course: bad }).valid, false, String(bad));
    for (const good of [1, 2, 3, 4]) assert.equal(validateStudent({ ...ok, course: good }).valid, true);
  });

  it('grade: от 0 до 5, может быть NULL или отсутствовать; округляется до 2 знаков', () => {
    assert.equal(validateStudent({ ...ok, grade: null }).valid, true);
    const { grade, ...noGrade } = ok;
    assert.equal(validateStudent(noGrade).valid, true);
    assert.equal(validateStudent({ ...ok, grade: 0 }).valid, true);
    assert.equal(validateStudent({ ...ok, grade: 5 }).valid, true);
    for (const bad of [-0.1, 5.01, '4.5', NaN, Infinity]) assert.equal(validateStudent({ ...ok, grade: bad }).valid, false, String(bad));
    assert.equal(validateStudent({ ...ok, grade: 4.456 }).value.grade, 4.46);
  });

  it('неизвестные поля отклоняются (нельзя подсунуть id или created_at)', () => {
    const r = validateStudent({ ...ok, id: 1, created_at: 'x' });
    assert.equal(r.valid, false);
    assert.equal(r.errors.length, 2);
  });

  it('partial (для update): обязательных полей нет, но пустое обновление недопустимо', () => {
    assert.equal(validateStudent({ grade: 4 }, { partial: true }).valid, true);
    assert.equal(validateStudent({}, { partial: true }).valid, false);
    assert.equal(validateStudent({ course: 9 }, { partial: true }).valid, false);
  });

  it('тело — только объект', () => {
    for (const bad of [null, undefined, [], 'str', 5]) assert.equal(validateStudent(bad).valid, false);
  });
});

describe('Задание 4: параметры списка (пагинация, фильтры, сортировка)', () => {
  it('значения по умолчанию: limit=10, offset=0', () => {
    assert.deepEqual(parseListOptions({}), { limit: 10, offset: 0, sortBy: 'created_at', order: 'asc' });
  });

  it('разбирает строки из query-строки и комбинирует фильтры', () => {
    const o = parseListOptions({ limit: '5', offset: '10', group_name: 'ББМО-01-23', course: '2', grade_min: '4', grade_max: '5', sortBy: 'grade', order: 'DESC' });
    assert.deepEqual(o, { limit: 5, offset: 10, sortBy: 'grade', order: 'desc', group_name: 'ББМО-01-23', course: 2, grade_min: 4, grade_max: 5 });
  });

  it('отклоняет некорректные значения', () => {
    for (const q of [{ limit: '0' }, { limit: '101' }, { limit: 'x' }, { offset: '-1' }, { sortBy: 'password' }, { sortBy: 'id; DROP TABLE students' }, { order: 'up' }, { course: '5' }, { grade_min: '6' }, { grade_min: '4', grade_max: '3' }, { group_name: 'плохая' }]) {
      assert.throws(() => parseListOptions(q), ValidationError, JSON.stringify(q));
    }
  });

  it('parseId принимает только положительные целые', () => {
    assert.equal(parseId('42'), 42);
    assert.equal(parseId(7), 7);
    for (const bad of ['0', '-1', '1.5', 'abc', '1; DROP TABLE students', null, undefined, '99999999999']) assert.throws(() => parseId(bad), ValidationError, String(bad));
  });
});

describe('Задание 5: валидация группы', () => {
  it('name в формате ББМО-XX-XX, curator необязателен', () => {
    assert.equal(validateGroup({ name: 'ББМО-04-23' }).valid, true);
    assert.equal(validateGroup({ name: 'ББМО-04-23', curator: 'Иванов И.И.' }).valid, true);
    assert.equal(validateGroup({ name: 'неверно' }).valid, false);
    assert.equal(validateGroup({}).valid, false);
    assert.equal(validateGroup({ name: 'ББМО-04-23', curator: 'А'.repeat(101) }).valid, false);
    assert.equal(validateGroup({ name: 'ББМО-04-23', id: 1 }).valid, false);
  });
});
