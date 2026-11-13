'use strict';

const fs = require('node:fs');
const path = require('node:path');

// Корень проекта = папка с server.js (работает и из lab23/tests/, и если тесты лежат прямо в lab23/)
const ROOT = [__dirname, path.join(__dirname, '..')].find((d) => fs.existsSync(path.join(d, 'server.js')));
if (!ROOT) throw new Error('Не найден server.js: оставьте тесты в lab23/tests или lab23');

/** require() модуля проекта по относительному пути: load('utils/cache'). */
const load = (rel) => require(path.join(ROOT, rel));

module.exports = { ROOT, load };
