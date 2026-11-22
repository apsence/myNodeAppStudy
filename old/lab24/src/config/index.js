'use strict';

const int = (v, d) => {
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) && n > 0 ? n : d;
};

/**
 * Конфигурация приложения из переменных окружения (секреты — только через env).
 * Секреты JWT проверяются при старте: слабые или одинаковые — отказ запуска.
 */
function loadConfig(env = process.env) {
  const problems = [];
  const access = env.JWT_ACCESS_SECRET || '';
  const refresh = env.JWT_REFRESH_SECRET || '';
  if (access.length < 32) problems.push('JWT_ACCESS_SECRET должен быть не короче 32 символов');
  if (refresh.length < 32) problems.push('JWT_REFRESH_SECRET должен быть не короче 32 символов');
  if (access && access === refresh) problems.push('JWT_ACCESS_SECRET и JWT_REFRESH_SECRET должны отличаться');
  if (env.NODE_ENV === 'production' && (/^change-me/.test(access) || /^change-me/.test(refresh))) {
    problems.push('в production нельзя использовать секреты-заглушки change-me*');
  }
  if (problems.length) throw new Error(`Некорректная конфигурация: ${problems.join('; ')}`);

  return {
    env: env.NODE_ENV || 'development',
    isProduction: env.NODE_ENV === 'production',
    port: int(env.PORT, 3000),
    mongoUri: env.MONGODB_URI || 'mongodb://localhost:27017/bbmo_01_23',
    dbName: env.DB_NAME || 'bbmo_01_23',
    defaultGroup: 'ББМО-01-23',
    logLevel: env.LOG_LEVEL || 'info',
    jwt: {
      accessSecret: access,
      refreshSecret: refresh,
      accessTtl: int(env.ACCESS_TTL_SECONDS, 900),
      refreshTtl: int(env.REFRESH_TTL_SECONDS, 7 * 24 * 3600),
    },
    bcryptRounds: int(env.BCRYPT_ROUNDS, 10),
    corsOrigins: String(env.CORS_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean),
    rateLimit: { limit: int(env.RATE_LIMIT_MAX, 100), windowMs: int(env.RATE_LIMIT_WINDOW_SECONDS, 60) * 1000 },
    trustProxy: env.TRUST_PROXY === 'true',
    uploadDir: env.UPLOAD_DIR || 'uploads',
    smtp: env.SMTP_HOST
      ? { host: env.SMTP_HOST, port: int(env.SMTP_PORT, 587), user: env.SMTP_USER || '', pass: env.SMTP_PASS || '' }
      : null,
    mailFrom: env.MAIL_FROM || 'BBMO <noreply@bbmo.example>',
    tls: env.TLS_KEY && env.TLS_CERT ? { key: env.TLS_KEY, cert: env.TLS_CERT } : null,
  };
}

module.exports = { loadConfig };
