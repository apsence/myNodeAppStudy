'use strict';

/** Прогоняет все запросы REST API и печатает «как в curl» — удобно для скриншотов. Нужен Node 18+. */
require('dotenv').config({ path: require('node:path').join(__dirname, '..', '.env') });

const BASE = `http://localhost:${process.env.PORT || 3000}`;

async function call(method, path, body) {
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
  console.log(JSON.stringify(json, null, 2));
  return { status: res.status, json };
}

async function main() {
  const list = await call('GET', '/api/students?limit=3');
  await call('GET', '/api/students?limit=3'); // из кэша: X-Cache: HIT
  await call('GET', '/api/students?group_name=' + encodeURIComponent('ББМО-01-23') + '&course=2&sortBy=grade&order=desc&limit=3');

  await call('POST', '/api/students/batch', [
    { name: 'Анна Белова', group_name: 'ББМО-01-23', course: 2, grade: 4.7 },
    { name: 'Олег Громов', group_name: 'ББМО-01-23', course: 2, grade: 3.9 },
  ]);

  console.log('\n--- Откат транзакции: второй студент ссылается на несуществующую группу ---');
  await call('POST', '/api/students/batch', [
    { name: 'Игорь Дубов', group_name: 'ББМО-01-23', course: 1, grade: 3.5 },
    { name: 'Игорь Дубов-2', group_name: 'ББМО-99-99', course: 1, grade: 3.6 },
  ]);
  await call('GET', '/api/students?limit=1&sortBy=created_at&order=desc'); // «Игорь Дубов» не добавлен

  await call('GET', '/api/students/stats');
  await call('GET', '/api/groups');
  const group = await call('GET', '/api/groups'); // кэш groups:list
  const gid = group.json && group.json.data && group.json.data[0] && group.json.data[0].id;
  if (gid) await call('GET', `/api/groups/${gid}/students?limit=2`);
  await call('POST', '/api/groups', { name: 'ББМО-04-23', curator: 'Новиков Н.Н.' });
  await call('POST', '/api/groups', { name: 'ББМО-04-23' }); // 409 дубликат

  const id = list.json && list.json.data && list.json.data[0] && list.json.data[0].id;
  if (id) {
    await call('GET', `/api/students/${id}`);
    await call('PUT', `/api/students/${id}`, { grade: 5 });
  }
  await call('GET', '/api/students/999999'); // 404
  await call('POST', '/api/students', { name: 'X', group_name: 'не группа', course: 9 }); // 400

  await call('GET', '/api/cache/stats');
  await call('GET', '/api/metrics');
}

main().catch((err) => {
  console.error(`Не удалось выполнить запросы: ${err.message}. Сервер запущен (npm start)?`);
  process.exitCode = 1;
});
