'use strict';

const { UnauthorizedError } = require('./errors');

/**
 * JWT: подпись HS256, payload { userId, email, role }.
 * Access — 15 минут, refresh — 7 дней (с jti для отзыва). Секреты берутся из конфигурации (.env).
 */
function createTokenService({ config, jwt = null }) {
  const lib = () => jwt || require('jsonwebtoken');
  const payloadOf = (user) => ({ userId: String(user._id), email: user.email, role: user.role || 'user' });

  function verify(token, secret, kind) {
    try {
      return lib().verify(token, secret, { algorithms: ['HS256'] }); // алгоритм зафиксирован: защита от alg=none
    } catch (err) {
      if (err && err.name === 'TokenExpiredError') {
        throw new UnauthorizedError('Token expired', {
          hint: kind === 'access' ? 'Access token expired: get a new one via POST /api/auth/refresh' : 'Refresh token expired: log in again via POST /api/auth/login',
        });
      }
      throw new UnauthorizedError('Invalid token');
    }
  }

  return {
    accessTtl: config.jwt.accessTtl,
    refreshTtl: config.jwt.refreshTtl,
    signAccess: (user) => lib().sign(payloadOf(user), config.jwt.accessSecret, { algorithm: 'HS256', expiresIn: config.jwt.accessTtl }),
    signRefresh: (user, jti) => lib().sign(payloadOf(user), config.jwt.refreshSecret, { algorithm: 'HS256', expiresIn: config.jwt.refreshTtl, jwtid: jti }),
    verifyAccess: (token) => verify(token, config.jwt.accessSecret, 'access'),
    verifyRefresh: (token) => verify(token, config.jwt.refreshSecret, 'refresh'),
  };
}

module.exports = { createTokenService };
