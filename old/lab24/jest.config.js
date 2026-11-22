'use strict';

module.exports = {
  testEnvironment: 'node',
  testMatch: ['<rootDir>/tests/unit/**/*.test.js', '<rootDir>/tests/integration/**/*.test.js', '<rootDir>/tests/e2e/**/*.test.js'],
  collectCoverageFrom: ['src/**/*.js', '!src/server.js', '!src/docs/**'],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'text-summary', 'lcov'],
  coverageThreshold: { global: { statements: 80, lines: 80, functions: 80, branches: 65 } },
  testTimeout: 30000,
};
