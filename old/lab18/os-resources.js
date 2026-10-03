// Лабораторная работа № 18 — Задание 2: процессор и память
const os = require('os');

const GROUP = 'ББМО-01-23';
const BYTES_IN_GB = 1024 ** 3;
const toGB = (bytes) => bytes / BYTES_IN_GB;

// ---------- Процессор ----------
const cpus = os.cpus();
const model = cpus.length ? cpus[0].model : 'неизвестно';
const speeds = cpus.map((c) => c.speed);
const avgSpeed = speeds.length
  ? speeds.reduce((a, b) => a + b, 0) / speeds.length
  : 0;

console.log('=== Информация о процессоре ===');
console.log(`Количество логических ядер: ${cpus.length}`);
console.log(`Модель процессора: ${model}`);
console.log('Частота каждого ядра:');
cpus.forEach((c, i) => {
  console.log(`  Ядро ${i}: ${c.speed ? c.speed + ' МГц' : 'н/д'}`);
});
console.log(
  `Средняя частота: ${avgSpeed ? Math.round(avgSpeed) + ' МГц' : 'недоступна на этой платформе'}`
);

// ---------- Память ----------
const total = os.totalmem();
const free = os.freemem();
const used = total - free;
const usedPercent = (used / total) * 100;
const freePercent = (free / total) * 100;

console.log('\n=== Информация о памяти ===');
console.log(`Общий объём: ${toGB(total).toFixed(2)} ГБ`);
console.log(`Свободно: ${toGB(free).toFixed(2)} ГБ`);
console.log(`Использовано: ${toGB(used).toFixed(2)} ГБ (${usedPercent.toFixed(1)}%)`);

// ---------- Средняя загрузка ----------
console.log('\n=== Средняя загрузка системы ===');
if (os.platform() === 'win32') {
  console.log('Недоступно в Windows (os.loadavg() возвращает нули)');
} else {
  const [l1, l5, l15] = os.loadavg();
  console.log(`За 1 минуту:   ${l1.toFixed(2)}`);
  console.log(`За 5 минут:    ${l5.toFixed(2)}`);
  console.log(`За 15 минут:   ${l15.toFixed(2)}`);
}

// ---------- Адаптивный вывод ----------
console.log('');
console.log(`Группа: ${GROUP}`);

// Для проверки предупреждения: node os-resources.js --fake-low
// (имитирует нехватку памяти, чтобы сделать скриншот)
const fakeLow = process.argv.includes('--fake-low');
if (freePercent < 20 || fakeLow) {
  console.log(
    `⚠ ВНИМАНИЕ: свободной памяти мало (${(fakeLow ? 12.5 : freePercent).toFixed(1)}% < 20%)${fakeLow ? ' [тестовый режим]' : ''}`
  );
} else {
  console.log('Память в норме');
}
