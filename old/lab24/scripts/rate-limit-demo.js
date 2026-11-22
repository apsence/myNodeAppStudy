'use strict';

/** Отправляет 105 запросов подряд: первые 100 проходят, остальные получают 429. npm run demo:rate-limit */
const { baseUrl, arg } = require('./_env');

async function main() {
  const total = Number(arg('count', 105));
  const counts = {};
  let first429 = null;
  for (let i = 1; i <= total; i++) {
    const res = await fetch(`${baseUrl}/api/users?limit=1`);
    counts[res.status] = (counts[res.status] || 0) + 1;
    if (res.status === 429 && !first429) {
      first429 = { n: i, retryAfter: res.headers.get('retry-after'), body: await res.json() };
    }
    if (i === 1 || i === total) console.log(`запрос ${String(i).padStart(3)}: HTTP ${res.status}, X-RateLimit-Remaining=${res.headers.get('x-ratelimit-remaining')}`);
  }
  console.log('\nИтог по статусам:', counts);
  if (first429) {
    console.log(`Первый 429 на запросе №${first429.n}, Retry-After=${first429.retryAfter} с`);
    console.log(JSON.stringify(first429.body));
  } else console.log('429 не получен: лимит не достигнут (проверьте RATE_LIMIT_MAX)');
}

main().catch((err) => {
  console.error(`Не удалось выполнить запросы: ${err.message}. Сервер запущен?`);
  process.exitCode = 1;
});
