const express = require('express');
const router = express.Router();
const db = require('../config/db');
const auth = require('../middleware/auth');
const { encryptJson, decryptJson, randomPublicId, randomToken, hashToken } = require('../services/sensitiveData');
const { writeAudit } = require('../services/audit');

const KINDS = new Set(['safety_plan', 'mental_health_profile', 'wandering_plan', 'medical_event']);
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

module.exports = router;
