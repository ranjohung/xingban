const jwt = require('jsonwebtoken');
const cache = require('../services/cache');
const { SESSION_COOKIE, parseCookies } = require('./session');

const auth = async (req, res, next) => {
  const cookieToken = parseCookies(req)[SESSION_COOKIE];
  const header = req.header('Authorization') || '';
  const match = header.match(/^Bearer\s+([^\s]+)$/);
  const bearerAllowed = process.env.NODE_ENV !== 'production' || process.env.ALLOW_BEARER_AUTH === 'true';
  const token = cookieToken || (bearerAllowed && match && match[1]);
  
  if (!token) {
    return res.status(401).json({ error: '访问被拒绝，请先登录' });
  }

  try {
    if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) return res.status(503).json({ error: '认证服务未正确配置' });
    const decoded = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
    if (!Number.isInteger(Number(decoded.id)) || !decoded.jti || !['parent','therapist','admin'].includes(decoded.role)) throw new Error('invalid claims');
    if (await cache.isSessionRevoked(decoded.jti)) throw new Error('revoked session');
    req.user = decoded;
    req.authMode = cookieToken ? 'cookie' : 'bearer';
    next();
  } catch (error) {
    return res.status(401).json({ error: '无效的token，请重新登录' });
  }
};

module.exports = auth;
