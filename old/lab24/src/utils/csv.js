'use strict';

const COLUMNS = ['_id', 'name', 'email', 'group_name', 'course', 'age', 'created_at'];

/** Ячейка CSV (RFC 4180) + защита от formula-injection: строки, начинающиеся с = + - @, получают префикс '. */
function escapeCell(value) {
  if (value === null || value === undefined) return '';
  let s = value instanceof Date ? value.toISOString() : String(value);
  if (typeof value === 'string' && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  if (/[",\r\n]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

const toCsvLine = (row, columns = COLUMNS) => columns.map((c) => escapeCell(row[c])).join(',');

/** Потоковый CSV: BOM для Excel, заголовок, строки. */
async function* csvChunks(rows, columns = COLUMNS) {
  yield `\uFEFF${columns.join(',')}\r\n`;
  for await (const row of rows) yield `${toCsvLine(row, columns)}\r\n`;
}

/** Потоковый JSON-массив: [ {...}, {...} ]. */
async function* jsonChunks(rows, columns = COLUMNS) {
  yield '[';
  let first = true;
  for await (const row of rows) {
    const picked = Object.fromEntries(columns.map((c) => [c, row[c]]));
    yield `${first ? '' : ','}\n${JSON.stringify(picked)}`;
    first = false;
  }
  yield '\n]\n';
}

module.exports = { COLUMNS, escapeCell, toCsvLine, csvChunks, jsonChunks };
