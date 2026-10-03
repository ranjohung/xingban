const express = require('express');
const router = express.Router();
const db = require('../config/db');
const auth = require('../middleware/auth');
const { encryptJson, decryptJson, randomPublicId, randomToken, hashToken } = require('../services/sensitiveData');
const { writeAudit } = require('../services/audit');
const { requireRole } = require('../middleware/roles');
const { scanAuditAnomalies } = require('../services/auditMonitor');

const KINDS = new Set(['safety_plan', 'mental_health_profile', 'wandering_plan', 'medical_event', 'emergency_contacts']);
const SCOPES = new Set(['summary', 'risk', 'medical', 'safety']);
const validId = value => Number.isInteger(Number(value)) && Number(value) > 0;

function verifyChildOwner(userId, childId, callback) {
  db.query('SELECT id FROM children WHERE id = ? AND user_id = ?', [Number(childId), Number(userId)], (err, rows) => callback(err, rows && rows.length === 1));
}

router.use(auth);

router.get('/record/:kind/:childId', (req, res) => {
  if (!KINDS.has(req.params.kind) || !validId(req.params.childId)) return res.status(400).json({ error: '资源类型或儿童ID无效' });
  verifyChildOwner(req.user.id, req.params.childId, (ownerErr, allowed) => {
    if (ownerErr) return res.status(500).json({ error: '服务暂时不可用' });
    if (!allowed) { writeAudit(req, 'read', req.params.kind, req.params.childId, 'denied'); return res.status(404).json({ error: '资源不存在' }); }
    db.query('SELECT public_id, ciphertext, iv, auth_tag, version, updated_at FROM sensitive_records WHERE user_id = ? AND child_id = ? AND kind = ?', [req.user.id, Number(req.params.childId), req.params.kind], (err, rows) => {
      if (err) return res.status(500).json({ error: '服务暂时不可用' });
      if (!rows.length) return res.status(404).json({ error: '资源不存在' });
      try {
        const record = rows[0]; const data = decryptJson({ ciphertext: record.ciphertext, iv: record.iv, tag: record.auth_tag });
        writeAudit(req, 'read', req.params.kind, record.public_id);
        res.json({ success: true, resource: { id: record.public_id, kind: req.params.kind, data, version: record.version, updated_at: record.updated_at } });
      } catch (_) { writeAudit(req, 'read', req.params.kind, rows[0].public_id, 'decrypt_failed'); res.status(500).json({ error: '数据暂时无法读取' }); }
    });
  });
});

router.put('/record/:kind/:childId', (req, res) => {
  if (!KINDS.has(req.params.kind) || !validId(req.params.childId) || !req.body || typeof req.body.data !== 'object' || Array.isArray(req.body.data)) return res.status(400).json({ error: '请求数据无效' });
  if (Buffer.byteLength(JSON.stringify(req.body.data), 'utf8') > 32768) return res.status(413).json({ error: '敏感记录超过32KB限制' });
  verifyChildOwner(req.user.id, req.params.childId, (ownerErr, allowed) => {
    if (ownerErr) return res.status(500).json({ error: '服务暂时不可用' });
    if (!allowed) { writeAudit(req, 'write', req.params.kind, req.params.childId, 'denied'); return res.status(404).json({ error: '资源不存在' }); }
    let encrypted; try { encrypted = encryptJson(req.body.data); } catch (_) { return res.status(503).json({ error: '敏感数据加密服务未配置' }); }
    const publicId = randomPublicId();
    const sql = `INSERT INTO sensitive_records (public_id,user_id,child_id,kind,ciphertext,iv,auth_tag,version) VALUES (?,?,?,?,?,?,?,1)
      ON DUPLICATE KEY UPDATE ciphertext=VALUES(ciphertext),iv=VALUES(iv),auth_tag=VALUES(auth_tag),version=version+1,updated_at=CURRENT_TIMESTAMP`;
    db.query(sql, [publicId, req.user.id, Number(req.params.childId), req.params.kind, encrypted.ciphertext, encrypted.iv, encrypted.tag], err => {
      if (err) return res.status(500).json({ error: '保存失败' });
      writeAudit(req, 'write', req.params.kind, publicId);
      res.json({ success: true, id: publicId });
    });
  });
});

router.delete('/record/:kind/:childId', (req, res) => {
  if (!KINDS.has(req.params.kind) || !validId(req.params.childId)) return res.status(400).json({ error: '请求无效' });
  db.query('DELETE FROM sensitive_records WHERE user_id = ? AND child_id = ? AND kind = ?', [req.user.id, Number(req.params.childId), req.params.kind], (err, result) => {
    if (err) return res.status(500).json({ error: '删除失败' });
    writeAudit(req, 'delete', req.params.kind, req.params.childId, result.affectedRows ? 'success' : 'not_found');
    res.json({ success: true, deleted: result.affectedRows || 0 });
  });
});

router.post('/share/create', (req, res) => {
  const { resource_id, recipient_user_id, scopes = ['summary'], expires_days = 7 } = req.body || {};
  if (!resource_id || !validId(recipient_user_id) || !Array.isArray(scopes) || !scopes.length || scopes.some(x => !SCOPES.has(x)) || ![1, 7, 30].includes(Number(expires_days))) return res.status(400).json({ error: '分享参数无效' });
  db.query('SELECT public_id FROM sensitive_records WHERE public_id = ? AND user_id = ?', [String(resource_id), req.user.id], (err, rows) => {
    if (err) return res.status(500).json({ error: '分享失败' });
    if (!rows.length) return res.status(404).json({ error: '资源不存在' });
    const token = randomToken(); const publicId = randomPublicId(); const expiresAt = new Date(Date.now() + Number(expires_days) * 86400000);
    db.query('INSERT INTO data_shares (public_id,owner_user_id,recipient_user_id,resource_public_id,token_hash,scopes,expires_at) VALUES (?,?,?,?,?,?,?)', [publicId, req.user.id, Number(recipient_user_id), String(resource_id), hashToken(token), JSON.stringify(scopes), expiresAt], insertErr => {
      if (insertErr) return res.status(500).json({ error: '分享失败' });
      writeAudit(req, 'share_create', 'sensitive_record', resource_id, 'success', { share_id: publicId, scopes, expires_days: Number(expires_days) });
      res.status(201).json({ success: true, share: { id: publicId, token, scopes, expires_at: expiresAt.toISOString() } });
    });
  });
});

router.delete('/share/:shareId', (req, res) => {
  db.query('UPDATE data_shares SET revoked_at = CURRENT_TIMESTAMP WHERE public_id = ? AND owner_user_id = ? AND revoked_at IS NULL', [req.params.shareId, req.user.id], (err, result) => {
    if (err) return res.status(500).json({ error: '撤销失败' });
    writeAudit(req, 'share_revoke', 'data_share', req.params.shareId, result.affectedRows ? 'success' : 'not_found');
    if (!result.affectedRows) return res.status(404).json({ error: '分享不存在或已撤销' });
    res.json({ success: true });
  });
});

router.get('/share/mine', (req, res) => {
  db.query(
    'SELECT public_id,recipient_user_id,resource_public_id,scopes,expires_at,revoked_at,created_at FROM data_shares WHERE owner_user_id = ? ORDER BY created_at DESC LIMIT 100',
    [req.user.id],
    (err, rows) => {
      if (err) return res.status(500).json({ error: '读取授权记录失败' });
      const shares = rows.map(row => {
        let scopes = [];
        try { scopes = typeof row.scopes === 'string' ? JSON.parse(row.scopes) : (row.scopes || []); } catch (_) { scopes = []; }
        return {
          id: row.public_id,
          recipient_user_id: row.recipient_user_id,
          resource_id: row.resource_public_id,
          scopes,
          expires_at: row.expires_at,
          revoked_at: row.revoked_at,
          created_at: row.created_at,
          status: row.revoked_at ? 'revoked' : (new Date(row.expires_at).getTime() <= Date.now() ? 'expired' : 'active')
        };
      });
      res.json({ success: true, shares });
    }
  );
});

router.get('/audit/mine', (req, res) => {
  db.query('SELECT action,resource_type,resource_public_id,outcome,created_at FROM audit_logs WHERE actor_user_id = ? ORDER BY created_at DESC LIMIT 100', [req.user.id], (err, rows) => {
    if (err) return res.status(500).json({ error: '读取审计记录失败' });
    res.json({ success: true, audit_logs: rows });
  });
});

const deletionRequestView = (row, includeRequester = false) => ({
  id: row.public_id,
  ...(includeRequester ? { requester_user_id: row.requester_user_id === null ? null : Number(row.requester_user_id) } : {}),
  scope: row.scope,
  child_id: row.child_id === null ? null : Number(row.child_id),
  reason: row.reason || '',
  status: row.status,
  due_at: row.due_at,
  processed_at: row.processed_at,
  resolution_note: row.resolution_note || '',
  created_at: row.created_at,
  updated_at: row.updated_at
});

router.post('/deletion-requests', (req, res) => {
  const scope = String(req.body?.scope || '');
  const childId = req.body?.child_id === undefined || req.body?.child_id === null ? null : Number(req.body.child_id);
  const reason = String(req.body?.reason || '').trim().slice(0, 500);
  const clientRequestId = String(req.body?.client_request_id || '').trim();
  if (!['child', 'account'].includes(scope) || req.body?.confirmation !== 'DELETE') return res.status(400).json({ error: '请明确选择删除范围并输入 DELETE 确认' });
  if (clientRequestId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(clientRequestId)) return res.status(400).json({ error: '请求标识无效' });
  if (scope === 'child' && !validId(childId)) return res.status(400).json({ error: '儿童档案编号无效' });
  if (scope === 'account' && childId !== null) return res.status(400).json({ error: '账号级删除不接受儿童编号' });

  const create = async () => {
    if (clientRequestId) {
      const replay = await new Promise(resolve => db.query('SELECT public_id,scope,child_id,status,due_at,created_at FROM data_deletion_requests WHERE requester_user_id=? AND client_request_id=?', [req.user.id, clientRequestId], (error, rows) => resolve(error ? null : rows)));
      if (replay === null) return res.status(500).json({ error: '删除申请状态暂时无法确认，请勿重复提交并稍后重试' });
      if (replay.length) return res.json({ success: true, replayed: true, request: deletionRequestView(replay[0]), shares_revoked: true });
    }
    const duplicateSql = `SELECT public_id FROM data_deletion_requests
      WHERE requester_user_id=? AND scope=? AND (child_id <=> ?) AND status IN ('pending','processing') LIMIT 1`;
    const existing = await new Promise(resolve => db.query(duplicateSql, [req.user.id, scope, childId], (error, rows) => resolve(error ? null : rows)));
    if (existing === null) return res.status(500).json({ error: '暂时无法创建删除申请' });
    if (existing.length) return res.status(409).json({ error: '相同范围已有待处理申请', request_id: existing[0].public_id });
    const publicId = randomPublicId();
    const days = Math.min(90, Math.max(1, Number(process.env.DATA_DELETION_SLA_DAYS || 30)));
    const dueAt = new Date(Date.now() + days * 86400000);
    try {
      await db.withTransaction(async tx => {
        await tx.query('INSERT INTO data_deletion_requests (public_id,requester_user_id,client_request_id,scope,child_id,reason,due_at) VALUES (?,?,?,?,?,?,?)', [publicId,req.user.id,clientRequestId||null,scope,childId,reason||null,dueAt]);
        await tx.query('UPDATE data_shares SET revoked_at=COALESCE(revoked_at,CURRENT_TIMESTAMP) WHERE owner_user_id=?', [req.user.id]);
        await tx.query('UPDATE report_shares SET revoked_at=COALESCE(revoked_at,CURRENT_TIMESTAMP) WHERE owner_user_id=?', [req.user.id]);
      });
      writeAudit(req, 'deletion_requested', scope, publicId, 'success', { child_id: childId, due_at: dueAt.toISOString() });
      res.status(201).json({ success:true,replayed:false,request:{id:publicId,scope,child_id:childId,status:'pending',due_at:dueAt.toISOString(),created_at:new Date().toISOString()},shares_revoked:true });
    } catch (error) {
      if (error?.code === 'ER_DUP_ENTRY' && clientRequestId) return db.query('SELECT public_id,scope,child_id,status,due_at,created_at FROM data_deletion_requests WHERE requester_user_id=? AND client_request_id=?',[req.user.id,clientRequestId],(readError,rows)=>readError||!rows.length?res.status(500).json({error:'删除申请状态暂时无法确认，请勿重复提交'}):res.json({success:true,replayed:true,request:deletionRequestView(rows[0]),shares_revoked:true}));
      res.status(503).json({ error:'删除申请与分享撤销未能完整执行，本次操作已回滚，请保留当前页面后重试',shares_revoked:false });
    }
  };
  if (scope === 'child') {
    return verifyChildOwner(req.user.id, childId, (error, allowed) => {
      if (error) return res.status(500).json({ error: '暂时无法核验儿童档案' });
      if (!allowed) return res.status(404).json({ error: '儿童档案不存在' });
      create();
    });
  }
  create();
});

router.get('/deletion-requests/mine', (req, res) => {
  db.query('SELECT public_id,scope,child_id,reason,status,due_at,processed_at,resolution_note,created_at,updated_at FROM data_deletion_requests WHERE requester_user_id=? ORDER BY created_at DESC LIMIT 100', [req.user.id], (error, rows) => {
    if (error) return res.status(500).json({ error: '读取删除申请失败' });
    res.json({ success: true, requests: rows.map(deletionRequestView) });
  });
});

router.delete('/deletion-requests/:requestId', (req, res) => {
  db.query("UPDATE data_deletion_requests SET status='cancelled',processed_at=CURRENT_TIMESTAMP WHERE public_id=? AND requester_user_id=? AND status='pending'", [req.params.requestId, req.user.id], (error, result) => {
    if (error) return res.status(500).json({ error: '撤销删除申请失败' });
    if (!result.affectedRows) return res.status(409).json({ error: '申请不存在、已开始处理或已结束' });
    writeAudit(req, 'deletion_cancelled', 'deletion_request', req.params.requestId);
    res.json({ success: true, status: 'cancelled' });
  });
});

router.get('/admin/deletion-requests', requireRole('admin'), (req, res) => {
  const status = String(req.query.status || 'pending');
  const view = String(req.query.view || '');
  if (view && !['active','history'].includes(view)) return res.status(400).json({ error: '队列视图无效' });
  if (status !== 'all' && !['pending','processing','completed','rejected','cancelled'].includes(status)) return res.status(400).json({ error: '状态参数无效' });
  const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
  const limit = Math.max(1, Math.min(100, Number.parseInt(req.query.limit, 10) || 20));
  const offset = (page - 1) * limit;
  const statuses = view === 'active' ? ['pending','processing'] : view === 'history' ? ['completed','rejected','cancelled'] : status === 'all' ? [] : [status];
  const where = statuses.length ? ` WHERE status IN (${statuses.map(() => '?').join(',')})` : '';
  const params = [...statuses, limit, offset];
  db.query(`SELECT public_id,requester_user_id,scope,child_id,reason,status,due_at,processed_at,resolution_note,created_at,updated_at FROM data_deletion_requests${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`, params, (error, rows) => {
    if (error) return res.status(500).json({ error: '读取删除申请队列失败' });
    db.query(`SELECT COUNT(*) total FROM data_deletion_requests${where}`, statuses, (countError, totals) => countError
      ? res.status(500).json({ error: '读取删除申请队列失败' })
      : res.json({ success: true, requests: rows.map(row => deletionRequestView(row, true)), total: Number(totals[0]?.total || 0), page, limit }));
  });
});

router.patch('/admin/deletion-requests/:requestId', requireRole('admin'), async (req, res, next) => {
  const status = String(req.body?.status || '');
  const note = String(req.body?.resolution_note || '').trim().slice(0, 1000);
  if (!['processing','completed','rejected'].includes(status)) return res.status(400).json({ error: '处理状态无效' });
  if (status === 'rejected' && note.length < 5) return res.status(400).json({ error: '拒绝申请必须说明具体原因' });
  try {
    if (status !== 'completed') {
      const result = await new Promise((resolve, reject) => db.query(
        `UPDATE data_deletion_requests SET status=?,processed_by_user_id=?,processed_at=${status === 'rejected' ? 'CURRENT_TIMESTAMP' : 'NULL'},resolution_note=? WHERE public_id=? AND status IN ('pending','processing')`,
        [status, req.user.id, note || null, req.params.requestId],
        (error, value) => error ? reject(error) : resolve(value)
      ));
      if (!result.affectedRows) return res.status(409).json({ error: '申请不存在或已结束' });
      writeAudit(req, `deletion_${status}`, 'deletion_request', req.params.requestId, 'success', { note_present: !!note });
      return res.json({ success: true, status });
    }
    const completed = await db.withTransaction(async tx => {
      const rows = await tx.query('SELECT requester_user_id,scope,child_id,status FROM data_deletion_requests WHERE public_id=? FOR UPDATE', [req.params.requestId]);
      const item = rows[0];
      if (!item || !['pending','processing'].includes(item.status)) return { conflict: true };
      if (!item.requester_user_id) return { conflict: true };
      if (item.scope === 'child') {
        await tx.query('DELETE FROM children WHERE id=? AND user_id=?', [item.child_id, item.requester_user_id]);
      } else {
        await tx.query('DELETE FROM users WHERE id=?', [item.requester_user_id]);
      }
      await tx.query("UPDATE data_deletion_requests SET status='completed',processed_by_user_id=?,processed_at=CURRENT_TIMESTAMP,resolution_note=? WHERE public_id=?", [req.user.id, note || null, req.params.requestId]);
      return { conflict: false, scope: item.scope };
    });
    if (completed.conflict) return res.status(409).json({ error: '申请不存在或已结束' });
    writeAudit(req, 'deletion_completed', completed.scope, req.params.requestId, 'success', { note_present: !!note });
    res.json({ success: true, status: 'completed', scope: completed.scope });
  } catch (error) { next(error); }
});

const alertView = row => {
  let evidence = {};
  try { evidence = typeof row.evidence === 'string' ? JSON.parse(row.evidence) : (row.evidence || {}); } catch (_) {}
  return {
    id: row.public_id,
    rule: row.rule_key,
    subject_user_id: row.subject_user_id === null ? null : Number(row.subject_user_id),
    severity: row.severity,
    status: row.status,
    occurrence_count: Number(row.occurrence_count),
    window_started_at: row.window_started_at,
    last_seen_at: row.last_seen_at,
    summary: row.summary,
    evidence,
    handled_at: row.handled_at,
    resolution_note: row.resolution_note || '',
    created_at: row.created_at
  };
};

router.post('/admin/security-alerts/scan', requireRole('admin'), async (req, res, next) => {
  try {
    const result = await scanAuditAnomalies(req.body?.window_minutes);
    writeAudit(req, 'security_alert_scan', 'security_alert', 'batch', 'success', result);
    res.json({ success: true, ...result });
  } catch (error) { next(error); }
});

router.get('/admin/security-alerts', requireRole('admin'), (req, res) => {
  const status = String(req.query.status || 'open');
  const view = String(req.query.view || '');
  if (view && !['active','history'].includes(view)) return res.status(400).json({ error: '告警视图无效' });
  if (status !== 'all' && !['open','acknowledged','resolved'].includes(status)) return res.status(400).json({ error: '告警状态无效' });
  const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
  const limit = Math.max(1, Math.min(100, Number.parseInt(req.query.limit, 10) || 20));
  const offset = (page - 1) * limit;
  const statuses = view === 'active' ? ['open','acknowledged'] : view === 'history' ? ['resolved'] : status === 'all' ? [] : [status];
  const where = statuses.length ? ` WHERE status IN (${statuses.map(() => '?').join(',')})` : '';
  const params = [...statuses, limit, offset];
  db.query(`SELECT public_id,rule_key,subject_user_id,severity,status,occurrence_count,window_started_at,last_seen_at,summary,evidence,handled_at,resolution_note,created_at FROM security_alerts${where} ORDER BY FIELD(severity,'critical','high','medium'),last_seen_at DESC LIMIT ? OFFSET ?`, params, (error, rows) => {
    if (error) return res.status(500).json({ error: '读取安全告警失败' });
    db.query(`SELECT COUNT(*) total FROM security_alerts${where}`, statuses, (countError, totals) => countError
      ? res.status(500).json({ error: '读取安全告警失败' })
      : res.json({ success: true, alerts: rows.map(alertView), total: Number(totals[0]?.total || 0), page, limit }));
  });
});

router.patch('/admin/security-alerts/:alertId', requireRole('admin'), (req, res) => {
  const status = String(req.body?.status || '');
  const note = String(req.body?.resolution_note || '').trim().slice(0, 1000);
  if (!['acknowledged','resolved'].includes(status)) return res.status(400).json({ error: '告警处理状态无效' });
  if (note.length < 5) return res.status(400).json({ error: '请填写至少5字的核查或解决说明' });
  const activeKeySql = status === 'resolved' ? ',active_key=NULL' : '';
  db.query(`UPDATE security_alerts SET status=?,handled_by_user_id=?,handled_at=CURRENT_TIMESTAMP,resolution_note=?${activeKeySql} WHERE public_id=? AND status IN ('open','acknowledged')`, [status, req.user.id, note, req.params.alertId], (error, result) => {
    if (error) return res.status(500).json({ error: '更新安全告警失败' });
    if (!result.affectedRows) return res.status(409).json({ error: '告警不存在或已经解决' });
    writeAudit(req, `security_alert_${status}`, 'security_alert', req.params.alertId, 'success', { note_present: true });
    res.json({ success: true, status });
  });
});

module.exports = router;
