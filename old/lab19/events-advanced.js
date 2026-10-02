// Лабораторная работа № 19 — Задание 4: newListener, removeListener, плагины, утечки, async
const EventEmitter = require('events');

const GROUP = 'ББМО-01-23';
const PREFIX = '[BBMO-01-23]';
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// ---------- Система плагинов ----------
class PluginManager extends EventEmitter {
  constructor() {
    super();
    this.plugins = new Map();

    // newListener срабатывает ДО добавления любого слушателя
    this.on('newListener', (event) => {
      if (event === 'newListener' || event === 'removeListener') return; // служебные не логируем
      console.log(`[newListener] Добавлен слушатель "${event}"`);
    });

    // removeListener срабатывает ПОСЛЕ удаления слушателя
    this.on('removeListener', (event, listener) => {
      console.log(`[removeListener] Удалён слушатель "${event}"`);
      // Очистка ресурсов, привязанных к слушателю
      if (typeof listener.cleanup === 'function') listener.cleanup();
    });
  }

  register(plugin) {
    this.plugins.set(plugin.name, plugin);
    for (const [event, handler] of Object.entries(plugin.handlers)) {
      this.on(event, handler);
    }
    this.emit('plugin:registered', plugin.name);
  }

  unregister(name) {
    const plugin = this.plugins.get(name);
    if (!plugin) return;
    for (const [event, handler] of Object.entries(plugin.handlers)) {
      this.removeListener(event, handler);
    }
    this.plugins.delete(name);
    this.emit('plugin:removed', name);
  }
}

function pluginSystemDemo() {
  console.log(`=== Система плагинов (группа ${GROUP}) ===`);
  const manager = new PluginManager();

  manager.on('plugin:registered', (name) => console.log(`[PLUGIN] Зарегистрирован: ${name}`));
  manager.on('plugin:removed', (name) => console.log(`[PLUGIN] Удалён: ${name}`));

  const logHandler = (msg) => console.log(`[LoggerPlugin] ${msg}`);
  logHandler.cleanup = () => console.log('[cleanup] LoggerPlugin: ресурсы освобождены');

  const loggerPlugin = { name: 'LoggerPlugin', handlers: { log: logHandler } };
  const alertPlugin = {
    name: 'AlertPlugin',
    handlers: { alert: (msg) => console.log(`[AlertPlugin] ВНИМАНИЕ: ${msg}`) },
  };

  manager.register(loggerPlugin);
  manager.register(alertPlugin);

  manager.emit('log', 'Тестовое сообщение');
  manager.emit('alert', 'Тестовое предупреждение');

  manager.unregister('LoggerPlugin');
  console.log(`emit("log") после удаления плагина вернул: ${manager.emit('log', 'ещё одно')}`);
}

// ---------- Утечка памяти ----------
function leakDemo() {
  console.log('\n=== Демонстрация утечки ===');
  const emitter = new EventEmitter();
  // Отключаем предупреждение MaxListenersExceededWarning, чтобы вывод был чистым
  emitter.setMaxListeners(0);

  for (let i = 0; i < 10; i++) emitter.on('data', function base() {});
  console.log(`Слушателей до: ${emitter.listenerCount('data')}`);

  // "Утечка": слушатели добавляются и никогда не удаляются
  const leaked = [];
  for (let i = 0; i < 1000; i++) {
    const handler = () => {};
    leaked.push(handler);
    emitter.on('data', handler);
  }
  console.log(`Слушателей после добавления 1000: ${emitter.listenerCount('data')}`);

  // Решение: удалять слушатели через removeListener
  for (const handler of leaked) emitter.removeListener('data', handler);
  console.log(`Слушателей после removeListener (1000 шт.): ${emitter.listenerCount('data')}`);

  emitter.removeAllListeners('data');
  console.log(`Слушателей после removeAllListeners: ${emitter.listenerCount('data')}`);
}

// ---------- Асинхронные слушатели ----------
async function asyncDemo() {
  console.log('\n=== Асинхронные слушатели ===');
  const emitter = new EventEmitter();

  emitter.on('work', async () => {
    await sleep(100);
    console.log(`${PREFIX} async-слушатель завершён через 100ms`);
  });
  emitter.on('work', () => {
    // отложенное выполнение: сработает после текущей синхронной части
    setImmediate(() => console.log(`${PREFIX} setImmediate: отложенное выполнение`));
  });

  emitter.emit('work');
  // emit() не ждёт async-слушателя — управление возвращается сразу
  console.log(`${PREFIX} emit вызван (не ждёт async-слушатель)`);

  await sleep(200);

  // Ошибки в async-слушателях: captureRejections направляет reject в событие 'error'
  const safe = new EventEmitter({ captureRejections: true });
  safe.on('boom', async () => {
    throw new Error('ошибка в async-слушателе');
  });
  safe.on('error', (err) => console.log(`${PREFIX} перехвачено через captureRejections: ${err.message}`));
  safe.emit('boom');
  await sleep(50);
}

async function main() {
  pluginSystemDemo();
  leakDemo();
  await asyncDemo();
}

main();
