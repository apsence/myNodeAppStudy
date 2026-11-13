'use strict';

/**
 * Прогоняет все запросы REST API и печатает «как в curl» — удобно для скриншотов.
 * Сервер должен быть запущен (npm start). Нужен Node 18+ (встроенный fetch).
 */
require('dotenv').config({ path: require('node:path').join(__dirname, '..', '.env') });

const BASE = `http://localhost:${process.env.HTTP_PORT || 3000}`;

async function call(method, path, body, { show = (x) => x } = {}) {
  const init = { method, headers: {} };
  if (body !== undefined) {
    init.headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(body);
  }
  const res = await fetch(BASE + path, init);
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = text; }
  const cmd = body === undefined ? `curl -X ${method} "${BASE}${path}"` : `curl -X ${method} ${BASE}${path} -H "Content-Type: application/json" -d '${JSON.stringify(body)}'`;
  console.log(`\n$ ${cmd}`);
  console.log(`HTTP ${res.status}${res.headers.get('x-cache') ? `  X-Cache: ${res.headers.get('x-cache')}` : ''}`);
  console.log(JSON.stringify(show(json), null, 2));
  return { status: res.status, json };
}

async function main() {
  const stamp = Date.now();

  const list = await call('GET', '/api/students?limit=3');
  await call('GET', '/api/students?limit=3'); // второй раз — из кэша (X-Cache: HIT)

  await call('POST', '/api/students/batch', [
    { name: 'Анна Белова', email: `anna.${stamp}@bbmo.example`, course: 1, grade: 4.6 },
    { name: 'Олег Громов', email: `oleg.${stamp}@bbmo.example`, course: 2, grade: 4.1 },
  ]);

  console.log('\n--- Откат транзакции: второй документ дублирует email первого ---');
  await call('POST', '/api/students/batch', [
    { name: 'Игорь Дубов', email: `dup.${stamp}@bbmo.example`, course: 1, grade: 3.5 },
    { name: 'Игорь Дубов-2', email: `dup.${stamp}@bbmo.example`, course: 1, grade: 3.6 },
  ]);
  await call('GET', '/api/students?limit=1&group_name=ББМО-01-23&sort=grade&order=desc');

  await call('GET', '/api/students/stats');
  await call('GET', `/api/students/search?q=${encodeURIComponent('Иван')}&limit=3`);

  const id = list.json && list.json.data && list.json.data[0] && list.json.data[0]._id;
  if (id) {
    await call('GET', `/api/students/${id}`);
    await call('PUT', `/api/students/${id}`, { grade: 5 });
  }
  await call('GET', '/api/students/000000000000000000000000'); // 404
  await call('POST', '/api/students', { name: 'X', course: 9 }); // 400 валидация

  await call('GET', '/api/metrics');
}

main().catch((err) => {
  console.error(`Не удалось выполнить запросы: ${err.message}. Сервер запущен (npm start)?`);
  process.exitCode = 1;
});
