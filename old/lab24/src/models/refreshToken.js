'use strict';

/** Refresh-токены: хранится только jti (идентификатор), что позволяет отзывать токены (logout, ротация). */
class RefreshToken {
  static db = null;

  static init(db) {
    RefreshToken.db = db;
  }

  static get collection() {
    if (!RefreshToken.db) throw new Error('RefreshToken.init(db) не вызван');
    return RefreshToken.db.collection('refresh_tokens');
  }

  static async ensureIndexes() {
    await RefreshToken.collection.createIndex({ jti: 1 }, { unique: true, name: 'jti_unique' });
    // MongoDB сама удалит запись после expires_at (TTL-индекс)
    await RefreshToken.collection.createIndex({ expires_at: 1 }, { expireAfterSeconds: 0, name: 'expires_ttl' });
  }

  static async create({ jti, userId, expiresAt }) {
    await RefreshToken.collection.insertOne({ jti, user_id: String(userId), expires_at: expiresAt, revoked: false, created_at: new Date() });
  }

  static async findActive(jti) {
    if (typeof jti !== 'string') return null;
    return RefreshToken.collection.findOne({ jti, revoked: false });
  }

  static async revoke(jti) {
    if (typeof jti !== 'string') return false;
    return (await RefreshToken.collection.updateOne({ jti }, { $set: { revoked: true } })).modifiedCount === 1;
  }

  static async revokeAllForUser(userId) {
    await RefreshToken.collection.updateMany({ user_id: String(userId) }, { $set: { revoked: true } });
  }
}

module.exports = { RefreshToken };
