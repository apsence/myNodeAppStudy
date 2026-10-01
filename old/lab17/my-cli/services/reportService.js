'use strict';

const fs = require('fs');
const path = require('path');

const ALLOWED_TYPES = ['html', 'pdf', 'json', 'csv'];

function buildContent(type) {
  switch (type) {
    case 'json':
      return JSON.stringify(
        { report: 'lab17', generatedAt: new Date().toISOString() },
        null,
        2
      );
    case 'csv':
      return 'field,value\nreport,lab17\n';
    case 'html':
      return '<!DOCTYPE html>\n<html><body><h1>Отчёт (лаб. работа №17)</h1></body></html>\n';
    case 'pdf':
      // Упрощённая заглушка PDF — для настоящего PDF используйте библиотеку pdfkit.
      return '%PDF-1.4\n% Заглушка PDF-отчёта для лабораторной работы №17\n';
    default:
      return '';
  }
}

/**
 * Сгенерировать отчёт заданного типа и сохранить по указанному пути.
 * @throws если тип недопустим, или файл уже существует и force не указан
 */
function generate({ type, output, force }) {
  if (!ALLOWED_TYPES.includes(type)) {
    throw new Error(
      `недопустимый тип отчёта "${type}". Допустимые значения: ${ALLOWED_TYPES.join(', ')}`
    );
  }

  const dir = path.dirname(output);
  if (dir && dir !== '.' && !fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  if (fs.existsSync(output) && !force) {
    throw new Error(`файл "${output}" уже существует. Используйте --force для перезаписи`);
  }

  fs.writeFileSync(output, buildContent(type), 'utf8');
  return output;
}

module.exports = { generate, ALLOWED_TYPES };
