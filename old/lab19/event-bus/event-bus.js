'use strict';
// Лабораторная работа № 19 — Задание 5: EventBus
// Запуск: node event-bus.js            (демо + HTTP-сервер + мониторинг os)
//         node event-bus.js --demo-only (только демонстрация, без сервера)
const EventBus = require('./src/EventBus');
const { createServer } = require('./src/server');
const { startSystemMonitor } = require('./src/system-monitor');

const GROUP = 'ББМО-01-23';
const PORT = Number(process.env.PORT) || 3000;

function plural(n, one, few, many) {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && !(m100 >= 12 && m100 <= 14)) return few;
  return many;
}

async function main() {
  const bus = new EventBus({ group: GROUP });

  console.log(`=== EventBus (группа ${GROUP}) ===`);

  // ---------- Приоритеты ----------
  console.log('--- Приоритеты ---');
  bus.on('prio', () => console.log('[priority 0] Низкий приоритет (добавлен первым)'));
  bus.on('prio', () => console.log('[priority 10] Высокий приоритет'), 10);
  bus.on('prio', () => console.log('[priority 5] Средний приоритет'), 5);
  bus.on('prio', () => console.log('[priority 0] Низкий приоритет (добавлен последним)'));
  bus.emit('prio');
  bus.removeAllListeners('prio');

  // ---------- Wildcard ----------
  console.log('--- Wildcard ---');
  const spy = (event, ...args) =>
    console.log(`[onAny] Событие "${event}" с аргументами: ${JSON.stringify(args)}`);
  bus.onAny(spy);
  bus.on('greet', (name) => console.log(`[greet] Привет, ${name}!`));
  bus.emit('greet', 'Иван');
  bus.emit('greet', 'Мария');
  bus.emit('info', GROUP);
  bus.offAny(spy);

  // ---------- Once-кэш ----------
  console.log('--- Once-кэш ---');
  let onceCalls = 0;
  let tickNo = 0;
  bus.once('tick', () => {
    onceCalls++;
    console.log('[once] once-слушатель сработал');
  });
  bus.on('tick', () => console.log(`[tick] Вызов ${++tickNo}`));
  bus.emit('tick');
  bus.emit('tick');
  bus.emit('tick');
  console.log(`once-слушатель вызван: ${onceCalls} ${plural(onceCalls, 'раз', 'раза', 'раз')}`);

  // ---------- Обработка ошибок ----------
  console.log('--- Обработка ошибок ---');
  bus.on('test', (mode) => {
    if (mode === 'bad') throw new Error('сбой в слушателе test');
    console.log('[test] выполнено без ошибок');
  });
  bus.on('test2', () => {
    throw new Error('сбой в слушателе test2');
  });
  bus.on('safe', () => {
    try {
      JSON.parse('{bad json');
    } catch (err) {
      console.log(`[safe] Ошибка перехвачена try/catch внутри слушателя: ${err.message}`);
    }
  });
  bus.on('async-test', async () => {
    throw new Error('сбой в async-слушателе');
  });

  bus.emit('test', 'bad');
  bus.emit('test', 'ok');
  bus.emit('test2');
  bus.emit('safe');
  bus.emit('async-test');
  await new Promise((resolve) => setImmediate(resolve)); // дождаться async-ошибки

  // ---------- Метрики ----------
  console.log('--- Метрики ---');
  const metrics = bus.getMetrics();
  for (const [name, count] of Object.entries(metrics.events)) {
    const errors = metrics.errors[name];
    const errText = errors ? ` (${errors} ${plural(errors, 'ошибка', 'ошибки', 'ошибок')})` : '';
    console.log(`${name}: ${count} ${plural(count, 'вызов', 'вызова', 'вызовов')}${errText}`);
  }
  console.log(`Всего событий: ${metrics.total}`);
  console.log(`Последний вызов "tick": ${metrics.lastCalled.tick}`);

  if (process.argv.includes('--demo-only')) return;

  // ---------- Интеграция с os и http ----------
  console.log('\n--- Интеграция с os и http ---');

  bus.on('system:cpu', ({ cores, loadPercent }) =>
    console.log(`[os] CPU: ${loadPercent}% (ядер: ${cores})`)
  );
  bus.on('system:memory', ({ usedPercent, freeGB }) =>
    console.log(`[os] RAM: ${usedPercent}% использовано, ${freeGB} ГБ свободно`)
  );
  bus.on('request', ({ method, url }) => console.log(`[http] ${method} ${url}`));

  const stopMonitor = startSystemMonitor(bus, 5000);
  const server = createServer(bus);

  server.listen(PORT, () => {
    console.log(`HTTP-сервер запущен: http://localhost:${PORT}/metrics (Ctrl+C для выхода)`);
  });

  process.on('SIGINT', () => {
    stopMonitor();
    server.close(() => {
      console.log(`\nСервер остановлен. Всего событий: ${bus.getMetrics().total}`);
      process.exit(0);
    });
  });
}

main();
