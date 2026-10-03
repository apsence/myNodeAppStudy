// Лабораторная работа № 19 — Задание 3: наследование от EventEmitter
const EventEmitter = require('events');

const GROUP = 'ББМО-01-23';
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

class DatabaseConnection extends EventEmitter {
  constructor(group = GROUP) {
    super();
    this.group = group;
    this.connected = false;
  }

  // connect() — эмитит connecting, затем connect при успехе
  async connect() {
    this.emit('connecting', this.group);
    await delay(50);
    this.connected = true;
    this.emit('connect', this.group);
  }

  // query(sql) — эмитит query с SQL-запросом и результатом
  async query(sql) {
    if (!this.connected) {
      this.error('Нет соединения с БД');
      return null;
    }
    await delay(50);
    const type = sql.trim().split(/\s+/)[0].toUpperCase();
    const result = type === 'SELECT' ? '50 записей' : '1 запись добавлена';
    this.emit('query', sql, result);
    return result;
  }

  // close() — эмитит closing и close
  async close() {
    this.emit('closing', this.group);
    await delay(50);
    this.connected = false;
    this.emit('close', this.group);
  }

  // error() — эмитит специальное событие 'error'
  error(message) {
    this.emit('error', new Error(message));
  }
}

const log = (msg) => console.log(`[EVENT] [${GROUP}] ${msg}`);

async function main() {
  console.log(`=== DatabaseConnection (группа ${GROUP}) ===`);

  const db = new DatabaseConnection();

  // Подписка на все события
  db.on('connecting', () => log('Подключение к БД...'));
  db.on('connect', () => log('Соединение установлено'));
  db.on('query', (sql, result) => {
    log(`Выполнение запроса: ${sql}`);
    log(`Результат: ${result}`);
  });
  db.on('closing', () => log('Закрытие соединения'));
  db.on('close', () => log('Соединение закрыто'));
  db.on('error', (err) => log(`Ошибка: ${err.message}`));

  // Последовательность операций
  await db.connect();
  await db.query('SELECT * FROM students');
  await db.query('INSERT INTO students');
  await db.close();

  // ---------- Паттерн "Ошибка как событие" ----------
  console.log('\n=== Демонстрация ошибки ===');

  // 1) С обработчиком error — ошибка обрабатывается корректно
  db.error('Connection timeout');

  // 2) Без обработчика error Node.js выбрасывает исключение
  const bare = new DatabaseConnection();
  if (process.argv.includes('--crash')) {
    console.log('Эмитим error без слушателя (процесс упадёт)...');
    bare.error('Connection timeout'); // необработанное исключение -> падение процесса
  } else {
    try {
      bare.error('Connection timeout');
    } catch (err) {
      console.log(`Без слушателя error выброшено исключение: ${err.message}`);
      console.log('(без try/catch процесс упал бы; запустите с флагом --crash, чтобы увидеть падение)');
    }
  }
}

main();
