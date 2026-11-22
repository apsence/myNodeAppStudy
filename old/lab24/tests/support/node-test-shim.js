'use strict';

/**
 * Позволяет запускать Jest-совместимые тесты (tests/unit) обычным `node --test`:
 *   node --require ./tests/support/node-test-shim.js --test "tests/unit/*.test.js"
 * Под Jest этот файл не нужен — там describe/it/beforeEach — глобальные.
 */
const t = require('node:test');

Object.assign(globalThis, {
  describe: t.describe, it: t.it, test: t.test,
  beforeEach: t.beforeEach, afterEach: t.afterEach, beforeAll: t.before, afterAll: t.after,
});
