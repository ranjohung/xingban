const jwt = require('jsonwebtoken');

const auth = (req, res, next) => {
  const header = req.header('Authorization') || '';
  const match = header.match(/^Bearer\s+([^\s]+)$/);
  const token = match && match[1];
  
  if (!token) {
    return res.status(401).json({ error: '访问被拒绝，请先登录' });
  }

  try {
    if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) return res.status(503).json({ error: '认证服务未正确配置' });
    const decoded = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
    if (!Number.isInteger(Number(decoded.id)) || !['parent','therapist','admin'].includes(decoded.role)) throw new Error('invalid claims');
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ error: '无效的token，请重新登录' });
  }
};

module.exports = auth;
