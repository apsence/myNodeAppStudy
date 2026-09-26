'use strict';

const projectService = require('../../services/projectService');

describe('projectService.init', () => {
  test('успешно инициализирует проект с корректными данными', () => {
    const result = projectService.init({
      name: 'demo',
      type: 'cli',
      features: ['typescript'],
      git: true,
    });
    expect(result).toEqual({ name: 'demo', type: 'cli', features: ['typescript'], git: true });
  });

  test('выбрасывает ошибку без имени проекта', () => {
    expect(() => projectService.init({ type: 'cli' })).toThrow(/не указано имя проекта/);
  });

  test('выбрасывает ошибку без типа проекта', () => {
    expect(() => projectService.init({ name: 'demo' })).toThrow(/не указан тип проекта/);
  });

  test('typeLabel возвращает понятную подпись', () => {
    expect(projectService.typeLabel('cli')).toBe('CLI-утилита');
    expect(projectService.typeLabel('неизвестный')).toBe('неизвестный');
  });
});
