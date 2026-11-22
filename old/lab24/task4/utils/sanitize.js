'use strict';

/**
 * Защита от NoSQL-инъекций: ключи, начинающиеся с "$" (операторы MongoDB) или содержащие ".",
 * в пользовательском вводе недопустимы. Возвращает путь к первому подозрительному ключу или null.
 */
function findForbiddenKey(value, path = '', depth = 0) {
  if (value === null || typeof value !== 'object' || depth > 10) return null;
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      const found = findForbiddenKey(value[i], `${path}[${i}]`, depth + 1);
      if (found) return found;
    }
    return null;
  }
  for (const key of Object.keys(value)) {
    const here = path ? `${path}.${key}` : key;
    if (key.startsWith('$') || key.includes('.')) return here;
    const found = findForbiddenKey(value[key], here, depth + 1);
    if (found) return found;
  }
  return null;
}

module.exports = { findForbiddenKey };
