// Лабораторная работа № 19 — Задание 1: простой EventEmitter
const EventEmitter = require('events');

const GROUP = 'ББМО-01-23';

const emitter = new EventEmitter();

// Регистрация слушателей
emitter.on('greet', (name) => console.log(`[greet] Привет, ${name}!`));
emitter.on('info', (group) => console.log(`[info] Группа: ${group}`));
emitter.on('bye', () => console.log('[bye] До свидания!'));

console.log('=== Демонстрация EventEmitter ===');

// События эмитятся по очереди
emitter.emit('greet', 'Иван');
emitter.emit('info', GROUP);
emitter.emit('bye');

// emit() возвращает true, если у события были слушатели, иначе false
const unknownResult = emitter.emit('unknown');
console.log(`Событие "unknown" без слушателей: ${unknownResult}`);

const greetResult = emitter.emit('greet', 'Мария');
console.log(`Событие "greet" со слушателями: ${greetResult}`);
