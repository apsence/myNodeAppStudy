'use strict';
// Интеграция с модулем os: данные о системе публикуются как события EventBus
const os = require('os');

function sampleCpu() {
  let idle = 0;
  let total = 0;
  for (const { times } of os.cpus()) {
    idle += times.idle;
    total += times.user + times.nice + times.sys + times.idle + times.irq;
  }
  return { idle, total };
}

function cpuLoad(prev, curr) {
  const totalDiff = curr.total - prev.total;
  if (totalDiff <= 0) return 0;
  const busyDiff = totalDiff - (curr.idle - prev.idle);
  return (busyDiff / totalDiff) * 100;
}

function startSystemMonitor(bus, intervalMs = 5000) {
  let prev = sampleCpu();

  const tick = () => {
    const total = os.totalmem();
    const free = os.freemem();
    const curr = sampleCpu();

    bus.emit('system:cpu', {
      cores: os.cpus().length,
      loadPercent: +cpuLoad(prev, curr).toFixed(1),
    });
    prev = curr;

    bus.emit('system:memory', {
      totalGB: +(total / 1024 ** 3).toFixed(2),
      freeGB: +(free / 1024 ** 3).toFixed(2),
      usedPercent: +(((total - free) / total) * 100).toFixed(1),
    });
  };

  tick();
  const timer = setInterval(tick, intervalMs);
  return () => clearInterval(timer);
}

module.exports = { startSystemMonitor };
