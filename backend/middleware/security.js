const crypto = require('crypto');
const cache = require('../services/cache');

async function authRateLimit(req, res, next) {
  const key = `${req.ip}:${req.path}`;
  try {
    const result = await cache.consumeRateLimit(`auth:${key}`, 20, 15 * 60);
    if (!result.allowed) return res.status(429).json({ error: '尝试次数过多，请稍后再试' });
    next();
  } catch (error) {
    next(error);
  }
}

function securityHeaders(req, res, next) {
  req.requestId = req.get('X-Request-Id') || crypto.randomUUID();
  res.set('X-Request-Id', req.requestId);
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('X-Frame-Options', 'DENY');
  res.set('Referrer-Policy', 'no-referrer');
  res.set('Permissions-Policy', 'camera=(self), microphone=(self), geolocation=()');
  res.set('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'");
  res.set('Cross-Origin-Opener-Policy', 'same-origin');
  if (process.env.NODE_ENV === 'production') {
    res.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  res.set('Cache-Control', req.path.startsWith('/api/') ? 'no-store' : 'no-cache');
  next();
}

module.exports = { authRateLimit, securityHeaders };
