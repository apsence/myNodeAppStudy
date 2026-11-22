'use strict';

/**
 * Email-уведомления (nodemailer). Без SMTP_HOST письма не уходят в сеть: используется jsonTransport,
 * сообщение формируется и попадает в лог — удобно для разработки и тестов.
 * Сбой отправки не должен ломать основную операцию (регистрацию), поэтому ошибки только логируются.
 */
function createMailService({ config, logger, nodemailer = null }) {
  const lib = nodemailer || require('nodemailer');
  const transport = config.smtp
    ? lib.createTransport({
        host: config.smtp.host,
        port: config.smtp.port,
        secure: config.smtp.port === 465,
        auth: config.smtp.user ? { user: config.smtp.user, pass: config.smtp.pass } : undefined,
      })
    : lib.createTransport({ jsonTransport: true });

  return {
    transport,
    async sendWelcome(user) {
      try {
        const info = await transport.sendMail({
          from: config.mailFrom,
          to: user.email,
          subject: 'Добро пожаловать в BBMO',
          text: `Здравствуйте, ${user.name}!\n\nВаша учётная запись (${user.email}) создана.`,
        });
        logger.service(`Email отправлен: ${user.email}`, { messageId: info && info.messageId });
        return { delivered: true };
      } catch (err) {
        logger.error(`Не удалось отправить email ${user.email}: ${err.message}`);
        return { delivered: false };
      }
    },
  };
}

module.exports = { createMailService };
