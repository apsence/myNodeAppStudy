'use strict';
const { GROUP } = require('./config');

function createMetrics() {
  const startedAt = Date.now();
  const state = { total: 0, byMethod: {}, byStatus: {}, byProtocol: { http: 0, https: 0 } };
  const bump = (obj, key) => {
    obj[key] = (obj[key] || 0) + 1;
  };

  return {
    record(method, status, protocol) {
      state.total++;
      bump(state.byMethod, method);
      bump(state.byStatus, String(status));
      bump(state.byProtocol, protocol);
    },
    // Некорректные запросы, не дошедшие до middleware (событие clientError)
    recordClientError() {
      state.total++;
      bump(state.byStatus, '400');
    },
    snapshot(extra = {}) {
      return {
        group: GROUP,
        total: state.total,
        byMethod: state.byMethod,
        byStatus: state.byStatus,
        byProtocol: state.byProtocol,
        uptime: Math.floor((Date.now() - startedAt) / 1000),
        ...extra,
      };
    },
  };
}

module.exports = { createMetrics };
