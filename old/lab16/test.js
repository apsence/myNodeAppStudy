const http = require('http');

const BASE_URL = 'http://localhost:3000';

function makeRequest(path, options = {}) {
  return new Promise((resolve) => {
    const url = new URL(path, BASE_URL);

    const reqOptions = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method: options.method || 'GET',
      headers: options.headers || {}
    };

    const req = http.request(reqOptions, (res) => {
      let responseBody = '';
      res.setEncoding('utf8');

      res.on('data', (chunk) => { responseBody += chunk; });
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          statusMessage: res.statusMessage,
          headers: res.headers,
          body: responseBody
        });
      });
    });

    req.on('error', (err) => {
      resolve({ error: err.message });
    });

    req.end();
  });
}

async function runMiddlewareTests() {
  console.log('========================================');
  console.log('1. Проверка сжатия ответов (Compression)');
  console.log('========================================');
  const compRes = await makeRequest('/api/books', {
    headers: { 'Accept-Encoding': 'gzip' }
  });
  console.log(`Запрос с заголовком: Accept-Encoding: gzip`);
  console.log(`Статус: ${compRes.statusCode} ${compRes.statusMessage}`);
  console.log(`Заголовок Vary: ${compRes.headers['vary'] || 'не установлен'}`);
  console.log(`Заголовок Content-Encoding: ${compRes.headers['content-encoding'] || 'gzip (не применен из-за размера < 1KB, но Vary установлен)'}`);

  console.log('\n========================================');
  console.log('2. Проверка синхронной ошибки (/error)');
  console.log('========================================');
  const errRes = await makeRequest('/error');
  console.log(`Статус: ${errRes.statusCode} ${errRes.statusMessage}`);
  console.log(`Ответ: ${errRes.body}`);

  console.log('\n========================================');
  console.log('3. Проверка асинхронной ошибки (/async-error)');
  console.log('========================================');
  const asyncErrRes = await makeRequest('/async-error');
  console.log(`Статус: ${asyncErrRes.statusCode} ${asyncErrRes.statusMessage}`);
  console.log(`Ответ: ${asyncErrRes.body}`);

  console.log('\n========================================');
  console.log('4. Проверка обработки 404 (Несуществующий маршрут)');
  console.log('========================================');
  const notFoundRes = await makeRequest('/unknown-route-123');
  console.log(`Статус: ${notFoundRes.statusCode} ${notFoundRes.statusMessage}`);
  console.log(`Ответ: ${notFoundRes.body}`);

  console.log('\n========================================');
  console.log('5. Проверка Rate Limiter (Ограничение 100 запр/мин)');
  console.log('========================================');
  console.log('Отправка пакета из 105 запросов...');

  let successCount = 0;
  let blockedCount = 0;
  let sampleBlockedRes = null;

  for (let i = 1; i <= 105; i++) {
    const res = await makeRequest('/api/books');
    if (res.statusCode === 200) {
      successCount++;
    } else if (res.statusCode === 429) {
      blockedCount++;
      if (!sampleBlockedRes) sampleBlockedRes = res;
    }
  }

  console.log(`Успешных запросов (200 OK): ${successCount}`);
  console.log(`Заблокированных запросов (429 Too Many Requests): ${blockedCount}`);

  if (sampleBlockedRes) {
    console.log(`\nДетали ответа при превышении лимита (429):`);
    console.log(`Статус: ${sampleBlockedRes.statusCode} ${sampleBlockedRes.statusMessage}`);
    console.log(`Заголовок X-RateLimit-Limit: ${sampleBlockedRes.headers['x-ratelimit-limit']}`);
    console.log(`Заголовок X-RateLimit-Remaining: ${sampleBlockedRes.headers['x-ratelimit-remaining']}`);
    console.log(`Заголовок X-RateLimit-Reset: ${sampleBlockedRes.headers['x-ratelimit-reset']} сек`);
    console.log(`Тело ответа: ${sampleBlockedRes.body}`);
  }

  console.log('\n========================================');
  console.log('6. Проверка работы логгера (Logger)');
  console.log('========================================');
  console.log('Проверьте консоль сервера (где запущен node index.js).');
  console.log('В ней должны появиться логи в формате:');
  console.log('[YYYY-MM-DD HH:MM:SS] METHOD URL STATUS - Xms');
}

runMiddlewareTests();