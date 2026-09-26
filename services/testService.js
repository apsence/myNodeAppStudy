'use strict';

/**
 * Имитация запуска юнит- и интеграционных тестов проекта.
 * В реальном приложении здесь был бы вызов Jest/Mocha через child_process.
 */
function run() {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve({ passed: 15, total: 15, coverage: 87 });
    }, 300);
  });
}

module.exports = { run };
