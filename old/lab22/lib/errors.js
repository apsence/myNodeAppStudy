'use strict';

/**
 * Категории ошибок MySQL и их перевод в HTTP-статусы.
 * Чистые функции — подключать драйвер не нужно.
 */

const CATEGORIES = {
  network: ['ECONNREFUSED', 'ETIMEDOUT', 'PROTOCOL_CONNECTION_LOST', 'ECONNRESET', 'ENOTFOUND', 'EPIPE', 'POOL_CLOSED', 'PROTOCOL_ENQUEUE_AFTER_FATAL_ERROR', 'ER_CONNECTION_KILLED', 'ER_QUERY_INTERRUPTED', 'ER_SERVER_SHUTDOWN'],
  auth: ['ER_ACCESS_DENIED_ERROR', 'ER_DBACCESS_DENIED_ERROR', 'ER_ACCESS_DENIED_NO_PASSWORD_ERROR'],
  syntax: ['ER_PARSE_ERROR', 'ER_BAD_FIELD_ERROR', 'ER_NO_SUCH_TABLE', 'ER_BAD_TABLE_ERROR'],
  conflict: ['ER_DUP_ENTRY', 'ER_LOCK_DEADLOCK', 'ER_ROW_IS_REFERENCED', 'ER_ROW_IS_REFERENCED_2'],
  constraint: ['ER_NO_REFERENCED_ROW', 'ER_NO_REFERENCED_ROW_2', 'ER_BAD_NULL_ERROR', 'ER_DATA_TOO_LONG', 'ER_TRUNCATED_WRONG_VALUE', 'ER_WARN_DATA_OUT_OF_RANGE'],
};

const CATEGORY_TITLES = {
  network: 'Сетевая ошибка',
  auth: 'Ошибка аутентификации',
  syntax: 'Ошибка синтаксиса / схемы',
  conflict: 'Конфликт данных',
  constraint: 'Нарушение ограничения',
  unknown: 'Прочая ошибка',
};

// Ошибки, после которых пул лучше пересоздать
const CRITICAL = new Set(['PROTOCOL_CONNECTION_LOST', 'ECONNRESET', 'EPIPE', 'POOL_CLOSED', 'PROTOCOL_ENQUEUE_AFTER_FATAL_ERROR', 'ER_SERVER_SHUTDOWN', 'ER_CONNECTION_KILLED', 'ER_QUERY_INTERRUPTED']);

const codeOf = (err) => (err && (err.code || (/Pool is closed/i.test(err.message || '') ? 'POOL_CLOSED' : null))) || 'UNKNOWN';

function classifyError(err) {
  const code = codeOf(err);
  let category = 'unknown';
  for (const [name, codes] of Object.entries(CATEGORIES)) {
    if (codes.includes(code)) category = name;
  }
  return { code, category, title: CATEGORY_TITLES[category], critical: CRITICAL.has(code) };
}

const isCriticalError = (err) => classifyError(err).critical;

/** Ошибка MySQL → { status, error, ... } для REST-ответа. */
function mapMysqlError(err) {
  const { code } = classifyError(err);
  switch (code) {
    case 'ER_DUP_ENTRY':
      return { status: 409, error: 'Запись с таким уникальным значением уже существует', code };
    case 'ER_NO_REFERENCED_ROW':
    case 'ER_NO_REFERENCED_ROW_2':
      return { status: 400, error: 'Ссылка на несуществующую запись (например, группа не найдена)', code };
    case 'ER_ROW_IS_REFERENCED':
    case 'ER_ROW_IS_REFERENCED_2':
      return { status: 409, error: 'Запись используется в другой таблице и не может быть удалена', code };
    case 'ER_BAD_NULL_ERROR':
      return { status: 400, error: 'Обязательное поле не может быть NULL', code };
    case 'ER_DATA_TOO_LONG':
    case 'ER_TRUNCATED_WRONG_VALUE':
    case 'ER_WARN_DATA_OUT_OF_RANGE':
      return { status: 400, error: 'Некорректное значение поля', code };
    case 'ER_LOCK_DEADLOCK':
      return { status: 409, error: 'Взаимная блокировка транзакций, повторите запрос', code };
    case 'ECONNREFUSED':
    case 'ETIMEDOUT':
    case 'ENOTFOUND':
    case 'ECONNRESET':
    case 'EPIPE':
    case 'PROTOCOL_CONNECTION_LOST':
    case 'POOL_CLOSED':
    case 'ER_CON_COUNT_ERROR':
      return { status: 503, error: 'База данных недоступна', code };
    default:
      return null;
  }
}

/** Подсказка по частым причинам ошибок подключения. */
function connectionHint(err) {
  switch (codeOf(err)) {
    case 'ECONNREFUSED': return 'Сервер MySQL не запущен или указан неверный DB_HOST/DB_PORT в .env.';
    case 'ER_ACCESS_DENIED_ERROR': return 'Неверный логин или пароль: проверьте DB_USER/DB_PASSWORD в .env (пользователь создаётся командой npm run setup-db).';
    case 'ER_BAD_DB_ERROR': return 'База данных не существует: создайте её командой npm run setup-db.';
    case 'ETIMEDOUT': return 'Сервер не ответил за отведённое время (файрвол или неверный адрес).';
    case 'ENOTFOUND': return 'Хост не найден: проверьте DB_HOST.';
    default: return null;
  }
}

module.exports = { CATEGORIES, classifyError, isCriticalError, mapMysqlError, connectionHint };
