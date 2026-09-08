const crypto = require('crypto');

const buckets = new Map();
function authRateLimit(req, res, next) {
  const key = `${req.ip}:${req.path}`;
  const now = Date.now();
  const current = buckets.get(key) || { start: now, count: 0 };
  if (now - current.start > 15 * 60 * 1000) { current.start = now; current.count = 0; }
  current.count += 1; buckets.set(key, current);
  if (current.count > 20) return res.status(429).json({ error: '尝试次数过多，请稍后再试' });
  next();
}

function securityHeaders(req, res, next) {
  req.requestId = req.get('X-Request-Id') || crypto.randomUUID();
  res.set('X-Request-Id', req.requestId);
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('X-Frame-Options', 'DENY');
  res.set('Referrer-Policy', 'no-referrer');
  res.set('Permissions-Policy', 'camera=(self), microphone=(self), geolocation=()');
  res.set('Cache-Control', req.path.startsWith('/api/') ? 'no-store' : 'no-cache');
  next();
}

module.exports = { authRateLimit, securityHeaders };
