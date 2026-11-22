'use strict';

const { User } = require('./models/user');
const { RefreshToken } = require('./models/refreshToken');
const { UserService } = require('./services/userService');
const { AuthService } = require('./services/authService');
const { createMailService } = require('./services/mailService');
const { createUploadStore } = require('./services/uploadStore');
const { createHasher } = require('./utils/password');
const { createTokenService } = require('./utils/tokens');

/** Собирает сервисы приложения вокруг подключения к MongoDB. */
function buildServices({ db, config, logger, bus }) {
  User.init(db, { log: logger.model });
  RefreshToken.init(db);

  const hasher = createHasher({ rounds: config.bcryptRounds });
  const tokens = createTokenService({ config });
  const uploads = createUploadStore({ dir: config.uploadDir });
  const mailer = createMailService({ config, logger });

  const userService = new UserService({
    User, mailer, hasher, logger, bus, uploads,
    revokeSessions: (userId) => RefreshToken.revokeAllForUser(userId), // удалённый пользователь теряет все refresh-токены
  });
  const authService = new AuthService({ User, RefreshToken, tokens, hasher, logger, config });

  return {
    services: { userService, authService },
    tokens,
    uploads,
    isDbUp: async () => {
      try {
        await db.command({ ping: 1 });
        return true;
      } catch {
        return false;
      }
    },
    async ensureIndexes() {
      await User.ensureIndexes();
      await RefreshToken.ensureIndexes();
    },
  };
}

module.exports = { buildServices };
