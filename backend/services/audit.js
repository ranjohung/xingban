const db = require('../config/db');

function writeAudit(req, action, resourceType, resourceId, outcome = 'success', metadata = {}) {
  const actorId = req.user?.id || null;
  const actorRole = req.user?.role || 'anonymous';
  const requestId = req.requestId || null;
  const safeMetadata = JSON.stringify(metadata);
  db.query('INSERT INTO audit_logs (actor_user_id, actor_role, action, resource_type, resource_public_id, outcome, request_id, metadata) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [actorId, actorRole, action, resourceType, String(resourceId || ''), outcome, requestId, safeMetadata],
    err => { if (err && process.env.NODE_ENV !== 'test') console.error('审计日志写入失败'); });
}

module.exports = { writeAudit };
