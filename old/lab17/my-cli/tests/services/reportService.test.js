'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const reportService = require('../../services/reportService');

describe('reportService.generate', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'my-cli-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('генерирует json-отчёт с корректным содержимым', () => {
    const output = path.join(tmpDir, 'report.json');
    reportService.generate({ type: 'json', output, force: false });

    expect(fs.existsSync(output)).toBe(true);
    const content = JSON.parse(fs.readFileSync(output, 'utf8'));
    expect(content.report).toBe('lab17');
  });

  test('выбрасывает ошибку при недопустимом типе отчёта', () => {
    const output = path.join(tmpDir, 'report.unknown');
    expect(() => reportService.generate({ type: 'unknown', output, force: false })).toThrow(
      /недопустимый тип отчёта/
    );
  });

  test('не перезаписывает существующий файл без --force', () => {
    const output = path.join(tmpDir, 'report2.json');
    reportService.generate({ type: 'json', output, force: false });
    expect(() => reportService.generate({ type: 'json', output, force: false })).toThrow(
      /уже существует/
    );
  });

  test('перезаписывает существующий файл при force: true', () => {
    const output = path.join(tmpDir, 'report3.json');
    reportService.generate({ type: 'json', output, force: false });
    expect(() =>
      reportService.generate({ type: 'json', output, force: true })
    ).not.toThrow();
  });
});
