// Лабораторная работа № 19 — Задание 2: on, once, addListener, управление подписками
const EventEmitter = require('events');

const GROUP = 'ББМО-01-23';

// Склонение: 1 раз, 3 раза, 5 раз
function plural(n, one, few, many) {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && !(m100 >= 12 && m100 <= 14)) return few;
  return many;
}

// ---------- 1. Сравнение on и once ----------
console.log('=== Сравнение on и once ===');

const emitter = new EventEmitter();
let tickNo = 0;
let onCalls = 0;
let onceCalls = 0;

emitter.on('tick', () => {
  onCalls++;
  console.log(`[tick #${tickNo}] on-слушатель`);
});
emitter.once('tick', () => {
  onceCalls++;
  console.log(`[tick #${tickNo}] once-слушатель`);
});

for (let i = 0; i < 3; i++) {
  tickNo++;
  emitter.emit('tick');
}

console.log(`on-слушатель вызван: ${onCalls} ${plural(onCalls, 'раз', 'раза', 'раз')}`);
console.log(`once-слушатель вызван: ${onceCalls} ${plural(onceCalls, 'раз', 'раза', 'раз')}`);
console.log(`Слушателей "tick" осталось: ${emitter.listenerCount('tick')} (once удалён автоматически)`);

// ---------- 2. Управление подписками ----------
console.log('\n=== Управление подписками ===');

function listenerA() {}
function listenerB() {}
function listenerC() {}

const mgr = new EventEmitter();
mgr.on('data', listenerA);          // on
mgr.addListener('data', listenerB); // addListener — синоним on
mgr.once('data', listenerC);        // once

console.log(`Слушателей до удаления: ${mgr.listenerCount('data')}`);
console.log('listeners():', mgr.listeners('data').map((fn) => fn.name));
console.log('eventNames():', mgr.eventNames());

mgr.removeListener('data', listenerB);
console.log(`Слушателей после удаления одного: ${mgr.listenerCount('data')}`);
console.log('listeners():', mgr.listeners('data').map((fn) => fn.name));

mgr.removeAllListeners('data');
console.log(`Слушателей после removeAllListeners: ${mgr.listenerCount('data')}`);

// ---------- 3. Порядок вызова ----------
console.log('\n=== Порядок вызова ===');

const order = new EventEmitter();
order.on('order', () => console.log(`1. Первый слушатель (группа ${GROUP})`));
order.on('order', () => console.log('2. Второй слушатель'));
order.on('order', () => console.log('3. Третий слушатель'));
order.emit('order');

// Бонус: prependListener ставит слушатель в начало очереди
order.prependListener('order', () => console.log('0. prependListener — встаёт в начало очереди'));
console.log('--- после prependListener ---');
order.emit('order');
