'use strict';

const { ValidationError } = require('../utils/errors');
const { formatDetails } = require('../utils/joiMessages');

const JOI_OPTIONS = { abortEarly: false, convert: true, stripUnknown: false };

/**
 * validationMiddleware(schema, source): проверяет ctx.request.body ('body') или ctx.query ('query') по Joi-схеме.
 * Нормализованные данные кладёт в ctx.state.validated[source]; ошибки → 400 с details [{ field, message }].
 */
function validationMiddleware(schema, source = 'body') {
  return async function validate(ctx, next) {
    const input = source === 'body' ? ctx.request.body : ctx.query;
    const { error, value } = schema.validate(input, JOI_OPTIONS);
    if (error) throw new ValidationError(formatDetails(error.details));
    ctx.state.validated = { ...(ctx.state.validated || {}), [source]: value };
    await next();
  };
}

module.exports = { validationMiddleware, JOI_OPTIONS };
