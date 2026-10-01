'use strict';

// mysql2 may return JSON columns either as parsed values or strings depending on
// server/driver configuration. Normalise both without letting malformed legacy
// data terminate the Node process.
function parseDbJson(value, fallback) {
  if (value === null || value === undefined || value === '') return fallback;
  if (typeof value === 'object') return value;
  try { return JSON.parse(value); } catch (_) { return fallback; }
}

module.exports = { parseDbJson };
