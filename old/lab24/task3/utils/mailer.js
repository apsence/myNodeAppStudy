'use strict';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Имитация отправки email (в задании 5 заменяется настоящим nodemailer). */
function createMailer({ delayMs = 5 } = {}) {
  return {
    async sendWelcome(user) {
      await sleep(delayMs);
      return { to: user.email, subject: 'Добро пожаловать!' };
    },
  };
}

module.exports = { createMailer };
