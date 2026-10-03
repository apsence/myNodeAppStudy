// Лабораторная работа № 18 — Задание 1: базовая информация об ОС
const os = require('os');

const GROUP = 'ББМО-01-23';

// Перевод секунд в формат "3 ч 25 мин 12 сек"
function formatUptime(totalSeconds) {
  const s = Math.floor(totalSeconds);
  const days = Math.floor(s / 86400);
  const hours = Math.floor((s % 86400) / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  const seconds = s % 60;
  const parts = [];
  if (days > 0) parts.push(`${days} д`);
  parts.push(`${hours} ч`, `${minutes} мин`, `${seconds} сек`);
  return parts.join(' ');
}

// Вывод о платформе (условный вывод)
function detectPlatform(platform) {
  switch (platform) {
    case 'win32':  return 'Вы работаете в Windows';
    case 'linux':  return 'Вы работаете в Linux';
    case 'darwin': return 'Вы работаете в macOS';
    default:       return 'Неизвестная платформа';
  }
}

const platform = os.platform();

console.log(`=== Информация о системе (группа ${GROUP}) ===`);
console.log(`Платформа: ${platform}`);
console.log(`Тип ОС: ${os.type()}`);
console.log(`Архитектура: ${os.arch()}`);
console.log(`Версия ОС: ${os.release()}`);
console.log(`Имя хоста: ${os.hostname()}`);
console.log(`Время работы: ${formatUptime(os.uptime())}`);
console.log(detectPlatform(platform));
