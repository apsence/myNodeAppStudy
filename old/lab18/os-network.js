// Лабораторная работа № 18 — Задание 3: сети и пользователь
const os = require('os');

const GROUP = 'ББМО-01-23';

// Маскирование MAC: AA:BB:CC:DD:EE:FF -> AA:BB:CC:**:**:**
function maskMac(mac) {
  if (!mac) return 'н/д';
  const parts = mac.toUpperCase().split(':');
  return parts.map((p, i) => (i < 3 ? p : '**')).join(':');
}

// ---------- Сетевые интерфейсы ----------
const interfaces = os.networkInterfaces();
const names = Object.keys(interfaces);
let primary = null;

console.log('=== Сетевые интерфейсы ===');
for (const name of names) {
  const addrs = interfaces[name] || [];
  console.log(`\nИнтерфейс: ${name}`);

  for (const a of addrs) {
    // family — строка 'IPv4' (в Node 18.0–18.3 было числом 4)
    const isV4 = a.family === 'IPv4' || a.family === 4;
    const label = isV4 ? 'IPv4' : 'IPv6';
    console.log(`${label}: ${a.address}`);

    // Основной интерфейс — первый внешний IPv4
    if (!primary && isV4 && !a.internal) {
      primary = { name, address: a.address };
    }
  }

  if (addrs.length) {
    console.log(`MAC: ${maskMac(addrs[0].mac)}`);
    console.log(`Внутренний: ${addrs[0].internal ? 'да' : 'нет'}`);
  }
}

console.log(`\nВсего интерфейсов: ${names.length}`);
console.log(
  primary
    ? `Основной интерфейс: ${primary.name} (${primary.address})`
    : 'Основной интерфейс: не найден'
);

// ---------- Пользователь ----------
const user = os.userInfo();

console.log('\n=== Информация о пользователе ===');
console.log(`Имя пользователя: ${user.username}`);
if (user.uid !== -1) {
  console.log(`UID: ${user.uid}`);
  console.log(`GID: ${user.gid}`);
} else {
  console.log('UID/GID: недоступны в Windows');
}
console.log(`Домашняя директория: ${user.homedir}`);
console.log(`Оболочка по умолчанию: ${user.shell || 'н/д (Windows)'}`);

console.log(`Группа: ${GROUP}`);

// Проверка root: UID 0 на UNIX, либо имя root/Administrator
const isRoot =
  user.uid === 0 || ['root', 'administrator'].includes(user.username.toLowerCase());
console.log(`Проверка root: ${isRoot ? 'да' : 'нет'}`);
if (isRoot) {
  console.log('⚠ Для группы ' + GROUP + ' запуск от root запрещён!');
  process.exitCode = 1;
}
