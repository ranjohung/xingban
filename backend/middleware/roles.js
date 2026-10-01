'use strict';

function requireRole(...allowedRoles) {
  const allowed = new Set(allowedRoles);
  return (req, res, next) => {
    if (!req.user || !allowed.has(req.user.role)) {
      return res.status(403).json({ error: '当前账号无权执行此操作' });
    }
    next();
  };
}

module.exports = { requireRole };
