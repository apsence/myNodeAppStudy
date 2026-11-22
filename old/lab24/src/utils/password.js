'use strict';

/** Хэширование паролей: bcrypt (bcryptjs — чистый JS, без нативной сборки), по умолчанию 10 раундов. */
function createHasher({ rounds = 10, bcrypt = null } = {}) {
  const lib = () => bcrypt || require('bcryptjs');
  return {
    rounds,
    hash: (plain) => lib().hash(plain, rounds),
    compare: (plain, hash) => lib().compare(plain, hash),
  };
}

module.exports = { createHasher };
