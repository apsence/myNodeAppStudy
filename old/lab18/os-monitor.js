// Лабораторная работа № 18 — Задание 4: мониторинг в реальном времени
const os = require('os');
const fs = require('fs');
const path = require('path');

const GROUP = 'ББМО-01-23';
const INTERVAL_MS = 2000;
const LOG_FILE = path.join(__dirname, 'monitor.log');
const BYTES_IN_GB = 1024 ** 3;

// ---------- Вспомогательные функции ----------
const toGB = (b) => b / BYTES_IN_GB;
const pad = (n) => String(n).padStart(2, '0');

function timestamp(d = new Date()) {
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
    `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  );
}

// Запись аномалии в monitor.log
function logWarning(message) {
  const line = `[${timestamp()}] [${GROUP}] Предупреждение: ${message}\n`;
  fs.appendFileSync(LOG_FILE, line, 'utf8');
}

// ---------- 1. Первичный сбор данных ("слепок" системы) ----------
function collectSnapshot() {
  const cpus = os.cpus();
  const total = os.totalmem();
  const free = os.freemem();
  const user = os.userInfo();

  const nets = {};
  for (const [name, addrs] of Object.entries(os.networkInterfaces())) {
    nets[name] = (addrs || []).map((a) => ({
      family: a.family,
      address: a.address,
      mac: a.mac.split(':').map((p, i) => (i < 3 ? p.toUpperCase() : '**')).join(':'),
      internal: a.internal,
    }));
  }

  return {
    timestamp: timestamp(),
    group: GROUP,
    system: {
      platform: os.platform(),
      type: os.type(),
      arch: os.arch(),
      release: os.release(),
      hostname: os.hostname(),
      uptimeSec: Math.floor(os.uptime()),
    },
    cpu: {
      cores: cpus.length,
      model: cpus[0] ? cpus[0].model : 'н/д',
      avgSpeedMHz: cpus.length
        ? Math.round(cpus.reduce((s, c) => s + c.speed, 0) / cpus.length)
        : 0,
      loadavg: os.platform() === 'win32' ? 'недоступно в Windows' : os.loadavg(),
    },
    memory: {
      totalGB: +toGB(total).toFixed(2),
      freeGB: +toGB(free).toFixed(2),
      usedPercent: +(((total - free) / total) * 100).toFixed(1),
    },
    network: nets,
    user: {
      username: user.username,
      uid: user.uid,
      gid: user.gid,
      homedir: user.homedir,
      shell: user.shell,
    },
  };
}

// ---------- 2. Расчёт загрузки CPU за интервал ----------
// Один "замер" — суммарные счётчики времени по всем ядрам
function sampleCpu() {
  let idle = 0;
  let total = 0;
  for (const cpu of os.cpus()) {
    const t = cpu.times;
    idle += t.idle;
    total += t.user + t.nice + t.sys + t.idle + t.irq;
  }
  return { idle, total };
}

// загрузка = busy_diff / total_diff * 100
function cpuLoad(prev, curr) {
  const totalDiff = curr.total - prev.total;
  const idleDiff = curr.idle - prev.idle;
  const busyDiff = totalDiff - idleDiff;
  if (totalDiff <= 0) return 0;
  return (busyDiff / totalDiff) * 100;
}

// ---------- Запуск ----------
const snapshot = collectSnapshot();
console.log('=== Первичный слепок системы ===');
console.log(JSON.stringify(snapshot, null, 2));
console.log('');
console.log(`Мониторинг (группа ${GROUP}). Ctrl+C для выхода.`);

let prevSample = sampleCpu();
let warningCount = 0;

function tick() {
  const currSample = sampleCpu();
  const cpu = cpuLoad(prevSample, currSample);
  prevSample = currSample;

  const total = os.totalmem();
  const free = os.freemem();
  const usedPercent = ((total - free) / total) * 100;
  const freePercent = (free / total) * 100;

  // 4. Адаптивное поведение
  let mark = '';
  const warnings = [];

  if (cpu > 80) {
    mark = ' ⚠⚠';
    warnings.push(`CPU критично: ${cpu.toFixed(1)}%`);
  } else if (cpu > 50) {
    mark = ' ⚠';
    warnings.push(`CPU повышен: ${cpu.toFixed(1)}%`);
  }
  if (freePercent < 10) {
    mark += mark ? '' : ' ⚠';
    warnings.push(`мало свободной памяти: ${freePercent.toFixed(1)}%`);
  }

  // 5. Логирование аномалий
  for (const w of warnings) {
    logWarning(w);
    warningCount++;
  }

  const line =
    `CPU: ${cpu.toFixed(1)}% | RAM: ${usedPercent.toFixed(1)}% ` +
    `(${toGB(free).toFixed(2)} ГБ свободно)${mark}`;

  // Перерисовка строки через \r (pad затирает остатки прошлой строки)
  process.stdout.write('\r' + line.padEnd(80));
}

const timer = setInterval(tick, INTERVAL_MS);

// Корректное завершение по Ctrl+C
process.on('SIGINT', () => {
  clearInterval(timer);
  console.log(`\nМониторинг остановлен. Предупреждений: ${warningCount}`);
  process.exit(0);
});
