'use strict';

/** Склонение: 1 символ, 2 символа, 5 символов. */
function plural(n, one, few, many) {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return few;
  return many;
}

/**
 * Ошибки Joi (error.details) → [{ field, message }] на русском.
 * Чистая функция: работает с обычными объектами { type, path, context, message }.
 */
function formatDetails(details) {
  return details.map((d) => {
    const field = (d.path && d.path.length ? d.path.join('.') : '_body');
    const ctx = d.context || {};
    const limit = ctx.limit;
    let message;
    switch (d.type) {
      case 'any.required': message = 'обязательное поле'; break;
      case 'string.empty': message = 'не может быть пустым'; break;
      case 'string.base': message = 'должно быть строкой'; break;
      case 'string.min': message = `минимум ${limit} ${plural(limit, 'символ', 'символа', 'символов')}`; break;
      case 'string.max': message = `максимум ${limit} ${plural(limit, 'символ', 'символа', 'символов')}`; break;
      case 'string.email': message = 'неверный формат'; break;
      case 'string.pattern.base':
      case 'string.pattern.name':
        message = field === 'group_name' ? 'неверный формат (ожидается ББМО-XX-XX)' : 'неверный формат';
        break;
      case 'number.base': message = 'должно быть числом'; break;
      case 'number.integer': message = 'должно быть целым числом'; break;
      case 'number.positive': message = 'должно быть больше 0'; break;
      case 'number.greater': message = `должно быть больше ${limit}`; break;
      case 'number.min': message = `не меньше ${limit}`; break;
      case 'number.max': message = `не больше ${limit}`; break;
      case 'any.only': message = `допустимые значения: ${(ctx.valids || []).join(', ')}`; break;
      case 'object.unknown': message = 'неизвестное поле'; break;
      case 'object.base': message = 'тело запроса должно быть объектом'; break;
      case 'object.min': message = 'нет полей для обновления'; break;
      default: message = d.message || 'некорректное значение';
    }
    return { field, message };
  });
}

module.exports = { formatDetails, plural };
