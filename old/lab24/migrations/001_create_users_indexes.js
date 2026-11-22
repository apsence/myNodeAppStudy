'use strict';

module.exports = {
  name: '001_create_users_indexes',
  async up(db) {
    const users = db.collection('users');
    await users.createIndex({ email: 1 }, { unique: true, name: 'email_unique' });
    await users.createIndex({ name: 'text', email: 'text' }, { name: 'users_text', default_language: 'russian', weights: { name: 10, email: 5 } });
    await users.createIndex({ group_name: 1, course: 1 }, { name: 'group_course' });
    await users.createIndex({ deleted_at: 1 }, { name: 'deleted_at', sparse: true });
  },
  async down(db) {
    const users = db.collection('users');
    for (const name of ['email_unique', 'users_text', 'group_course', 'deleted_at']) await users.dropIndex(name).catch(() => {});
  },
};
