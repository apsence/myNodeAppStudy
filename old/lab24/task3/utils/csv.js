'use strict';

const COLUMNS = ['_id', 'name', 'email', 'group_name', 'course', 'age', 'created_at'];

/**
 * Ячейка CSV: кавычки/запятые/переводы строк экранируются по RFC 4180;
 * строки, начинающиеся с = + - @, получают префикс ' (защита от CSV/formula-injection в Excel).
 */
function escapeCell(value) {
  if (value === null || value === undefined) return '';
  let s = value instanceof Date ? value.toISOString() : String(value);
  if (typeof value === 'string' && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  if (/[",\r\n]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

const toCsvLine = (row, columns = COLUMNS) => columns.map((c) => escapeCell(row[c])).join(',');

/** Потоковая генерация CSV: BOM (чтобы Excel правильно открыл кириллицу), заголовок, строки. */
async function* csvChunks(rows, columns = COLUMNS) {
  yield `\uFEFF${columns.join(',')}\r\n`;
  for await (const row of rows) yield `${toCsvLine(row, columns)}\r\n`;
}

module.exports = { COLUMNS, escapeCell, toCsvLine, csvChunks };
