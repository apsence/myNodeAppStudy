'use strict';

const fs = require('node:fs');

/** Строки .env без комментариев; значения паролей/секретов заменены на ********. */
function maskEnvText(text) {
  return String(text)
    .split(/\r?\n/)
    .filter((l) => l.trim() && !l.trim().startsWith('#'))
    .map((l) => l.replace(/^(\s*[A-Z_]*(?:PASSWORD|SECRET|TOKEN)[A-Z_]*\s*=).*$/i, '$1********'));
}

function describeEnv(filePath) {
  return fs.existsSync(filePath) ? maskEnvText(fs.readFileSync(filePath, 'utf8')) : null;
}

module.exports = { maskEnvText, describeEnv };
