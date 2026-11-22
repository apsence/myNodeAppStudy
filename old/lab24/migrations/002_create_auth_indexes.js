'use strict';

module.exports = {
  name: '002_create_auth_indexes',
  async up(db) {
    const tokens = db.collection('refresh_tokens');
    await tokens.createIndex({ jti: 1 }, { unique: true, name: 'jti_unique' });
    await tokens.createIndex({ expires_at: 1 }, { expireAfterSeconds: 0, name: 'expires_ttl' }); // TTL: Mongo сам удаляет истёкшие токены
  },
  async down(db) {
    const tokens = db.collection('refresh_tokens');
    for (const name of ['jti_unique', 'expires_ttl']) await tokens.dropIndex(name).catch(() => {});
  },
};
