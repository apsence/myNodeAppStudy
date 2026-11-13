'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./helpers');

const { validateStudentInput, buildDocument, STUDENT_SCHEMA } = load('models/student');

const ok = { name: 'Иван Иванов', group_name: 'ББМО-01-23', course: 2, grade: 4.5 };

describe('Задание 5: валидация (JSON Schema, уровень приложения)', () => {
  it('корректный документ проходит, строки обрезаются по краям', () => {
    const r = validateStudentInput({ ...ok, name: '  Иван Иванов  ' });
    assert.equal(r.valid, true);
    assert.equal(r.value.name, 'Иван Иванов');
  });

  it('обязательные поля: name, group_name, course, grade', () => {
    const r = validateStudentInput({});
    assert.equal(r.valid, false);
    for (const f of ['name', 'group_name', 'course', 'grade']) {
      assert.ok(r.errors.some((e) => e.includes(`"${f}" обязательно`)), `нет ошибки про ${f}`);
    }
  });

  it('проверяет типы и диапазоны', () => {
    assert.equal(validateStudentInput({ ...ok, grade: 5.5 }).valid, false);
    assert.equal(validateStudentInput({ ...ok, grade: 1.9 }).valid, false);
    assert.equal(validateStudentInput({ ...ok, grade: '4.5' }).valid, false);
    assert.equal(validateStudentInput({ ...ok, course: 0 }).valid, false);
    assert.equal(validateStudentInput({ ...ok, course: 2.5 }).valid, false);
    assert.equal(validateStudentInput({ ...ok, name: 'А' }).valid, false);
    assert.equal(validateStudentInput({ ...ok, grade: 5 }).valid, true);
    assert.equal(validateStudentInput({ ...ok, grade: 2 }).valid, true);
  });

  it('проверяет формат группы и email', () => {
    assert.equal(validateStudentInput({ ...ok, group_name: 'без формата' }).valid, false);
    assert.equal(validateStudentInput({ ...ok, group_name: 'ББМО-02-23' }).valid, true);
    assert.equal(validateStudentInput({ ...ok, email: 'не-почта' }).valid, false);
    assert.equal(validateStudentInput({ ...ok, email: 'a@b.ru' }).valid, true);
  });

  it('отклоняет неизвестные и служебные поля (_id, created_at)', () => {
    const r = validateStudentInput({ ...ok, _id: 'x', created_at: new Date(), hacker: 1 });
    assert.equal(r.valid, false);
    assert.equal(r.errors.filter((e) => e.includes('неизвестное')).length, 3);
  });

  it('тело должно быть объектом', () => {
    for (const bad of [null, [], 'str', 5, undefined]) assert.equal(validateStudentInput(bad).valid, false);
  });

  it('partial: можно передать часть полей, но не пустой объект', () => {
    assert.equal(validateStudentInput({ grade: 4 }, { partial: true }).valid, true);
    assert.equal(validateStudentInput({}, { partial: true }).valid, false);
    assert.equal(validateStudentInput({ grade: 9 }, { partial: true }).valid, false);
  });

  it('buildDocument добавляет created_at', () => {
    const now = new Date('2026-01-01T00:00:00Z');
    assert.deepEqual(buildDocument(ok, now), { ...ok, created_at: now });
  });

  it('схема пригодна для $jsonSchema MongoDB: только поддерживаемые ключевые слова', () => {
    const allowed = new Set(['bsonType', 'title', 'description', 'required', 'additionalProperties', 'properties', 'minLength', 'maxLength', 'minimum', 'maximum', 'pattern']);
    const walk = (node) => {
      for (const key of Object.keys(node)) {
        assert.ok(allowed.has(key), `ключевое слово "${key}" не поддерживается в $jsonSchema`);
      }
      Object.values(node.properties || {}).forEach(walk);
    };
    walk(STUDENT_SCHEMA);
    assert.ok(STUDENT_SCHEMA.required.every((f) => f in STUDENT_SCHEMA.properties));
  });
});
