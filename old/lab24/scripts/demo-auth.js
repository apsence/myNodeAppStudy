'use strict';

/**
 * Прогон сценария из задания 4 (сервер должен быть запущен: npm run task4 или npm start).
 * Печатает «как в curl»: регистрация, вход, защищённый запрос, 401, 403, обновление токена, неверный пароль.
 * Для сценария администратора: npm run create-admin -- --email=admin@bbmo.example --password=AdminPass123
 */
const { baseUrl } = require('./_env');

async function call(method, path, { body, token } = {}) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(baseUrl + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = text; }
  const short = (v) => JSON.parse(JSON.stringify(v, (k, x) => (typeof x === 'string' && x.length > 40 && /^eyJ/.test(x) ? `${x.slice(0, 18)}…` : x)));
  console.log(`\n$ curl -X ${method} ${baseUrl}${path}${token ? ' -H "Authorization: Bearer eyJ…"' : ''}${body ? ` -d '${JSON.stringify({ ...body, password: body.password ? '***' : undefined })}'` : ''}`);
  console.log(`HTTP ${res.status}`);
  console.log(JSON.stringify(short(json), null, 2));
  return { status: res.status, json };
}

async function main() {
  const stamp = Date.now();
  const email = `ivan.${stamp}@example.com`;
  const reg = await call('POST', '/api/auth/register', { body: { name: 'Иван', email, password: 'secret123' } });
  const login = await call('POST', '/api/auth/login', { body: { email, password: 'secret123' } });
  const token = login.json.accessToken;

  await call('POST', '/api/users', { token, body: { name: 'Пётр', email: `petr.${stamp}@example.com`, group_name: 'ББМО-01-23', age: 20 } });
  await call('POST', '/api/users', { body: { name: 'Пётр', email: `x.${stamp}@example.com`, group_name: 'ББМО-01-23' } }); // 401
  await call('GET', '/api/admin/users', { token }); // 403
  await call('POST', '/api/auth/login', { body: { email, password: 'wrong-password' } }); // 401 Invalid credentials
  await call('POST', '/api/auth/login', { body: { email: { $ne: null }, password: { $ne: null } } }); // NoSQL-инъекция → 400
  await call('POST', '/api/auth/refresh', { body: { refreshToken: reg.json.refreshToken } });
  await call('POST', '/api/auth/refresh', { body: { refreshToken: reg.json.refreshToken } }); // повтор: токен уже отозван → 401
  console.log(`\nХэш пароля в БД: npm run show-hash -- --email=${email}`);
}

main().catch((err) => {
  console.error(`Не удалось выполнить запросы: ${err.message}. Сервер запущен?`);
  process.exitCode = 1;
});
