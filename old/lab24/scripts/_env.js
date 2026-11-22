'use strict';

const path = require('node:path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const arg = (name, def) => {
  const a = process.argv.find((x) => x.startsWith(`--${name}=`));
  return a ? a.slice(name.length + 3) : def;
};

module.exports = {
  arg,
  mongoUri: process.env.MONGODB_URI || 'mongodb://localhost:27017/bbmo_01_23',
  dbName: process.env.DB_NAME || 'bbmo_01_23',
  baseUrl: process.env.BASE_URL || `http://localhost:${process.env.PORT || 3000}`,
  rounds: Number(process.env.BCRYPT_ROUNDS) || 10,
};
