'use strict';

/**
 * Имитация развёртывания проекта в указанное окружение.
 */
function deploy(env) {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve({ env, url: 'https://my-app.example.com' });
    }, 400);
  });
}

module.exports = { deploy };
