'use strict';

const TYPE_LABELS = {
  web: 'Web-приложение',
  cli: 'CLI-утилита',
  lib: 'Библиотека',
  microservice: 'Микросервис',
};

const FEATURE_LABELS = {
  typescript: 'TypeScript',
  eslint: 'ESLint',
  prettier: 'Prettier',
  jest: 'Jest',
};

/**
 * Инициализировать проект на основе собранных ответов
 * (из интерактивного диалога или из флагов командной строки).
 */
function init({ name, type, features = [], git }) {
  if (!name) {
    throw new Error('не указано имя проекта');
  }
  if (!type) {
    throw new Error('не указан тип проекта');
  }
  return { name, type, features, git: !!git };
}

function typeLabel(type) {
  return TYPE_LABELS[type] || type;
}

function featureLabel(feature) {
  return FEATURE_LABELS[feature] || feature;
}

module.exports = { init, typeLabel, featureLabel, TYPE_LABELS, FEATURE_LABELS };
