const express = require('express');
const router = express.Router();
const db = require('../config/db');
const auth = require('../middleware/auth');
const { randomPublicId, randomToken, hashToken } = require('../services/sensitiveData');
const { writeAudit } = require('../services/audit');
const { parseDbJson } = require('../utils/json');

const PERMISSIONS = new Set(['profile_summary','behavior_records','weekly_reports','safety_plan']);
const cleanPhone = value => String(value || '').replace(/\D/g, '').slice(0, 20);
const validPermissions = value => Array.isArray(value) ? [...new Set(value.filter(item => PERMISSIONS.has(item)))] : [];

router.use(auth);

router.post('/caregivers/invitations', (req, res) => {
  const childId = Number(req.body?.child_id); const phone = cleanPhone(req.body?.phone); const permissions = validPermissions(req.body?.permissions);
  if (!Number.isInteger(childId) || childId <= 0 || phone.length < 6 || !permissions.length) return res.status(400).json({ error: '儿童、手机号或授权范围无效' });
  db.query('SELECT c.id,u.phone FROM children c JOIN users u ON u.id=c.user_id WHERE c.id=? AND c.user_id=?', [childId, req.user.id], (error, rows) => {
    if (error) return res.status(500).json({ error: '邀请服务暂时不可用' });
    if (!rows.length) return res.status(404).json({ error: '儿童档案不存在' });
    if (cleanPhone(rows[0].phone) === phone) return res.status(400).json({ error: '不能邀请自己的账号' });
    const token = randomToken(); const publicId = randomPublicId();
    db.query(`INSERT INTO caregiver_invitations (public_id,owner_user_id,child_id,invitee_phone,token_hash,permissions,expires_at)
      VALUES (?,?,?,?,?,?,DATE_ADD(NOW(),INTERVAL 7 DAY))`, [publicId, req.user.id, childId, phone, hashToken(token), JSON.stringify(permissions)], (insertError) => {
      if (insertError) return res.status(500).json({ error: '创建邀请失败' });
      writeAudit(req, 'caregiver_invitation_created', 'child', String(childId), 'success', { invitation_id: publicId, permissions });
      res.status(201).json({ success: true, invitation: { id: publicId, child_id: childId, permissions, expires_in_days: 7 }, invitation_code: token, delivery: 'manual' });
    });
  });
});

router.post('/caregivers/invitations/accept', (req, res) => {
  const token = String(req.body?.invitation_code || '').trim();
  if (token.length < 20) return res.status(400).json({ error: '邀请码无效' });
  db.query(`SELECT i.*,u.phone current_phone FROM caregiver_invitations i JOIN users u ON u.id=?
    WHERE i.token_hash=? AND i.status='pending' AND i.expires_at>NOW()`, [req.user.id, hashToken(token)], (error, rows) => {
    if (error) return res.status(500).json({ error: '接受邀请失败' });
    const invite = rows[0]; if (!invite) return res.status(404).json({ error: '邀请不存在、已处理或已过期' });
    if (cleanPhone(invite.current_phone) !== cleanPhone(invite.invitee_phone)) return res.status(403).json({ error: '该邀请不属于当前登录手机号' });
    db.withTransaction(async tx => {
      await tx.query(`INSERT INTO child_caregivers (child_id,owner_user_id,caregiver_user_id,permissions,status,accepted_at)
        VALUES (?,?,?,?, 'active',NOW()) ON DUPLICATE KEY UPDATE owner_user_id=VALUES(owner_user_id),permissions=VALUES(permissions),status='active',accepted_at=NOW(),revoked_at=NULL`, [invite.child_id, invite.owner_user_id, req.user.id, JSON.stringify(parseDbJson(invite.permissions, []))]);
      await tx.query("UPDATE caregiver_invitations SET status='accepted',accepted_by_user_id=?,accepted_at=NOW() WHERE id=? AND status='pending'", [req.user.id, invite.id]);
    }).then(() => { writeAudit(req, 'caregiver_invitation_accepted', 'child', String(invite.child_id), 'success', { invitation_id: invite.public_id }); res.json({ success: true, child_id: invite.child_id }); })
      .catch(() => res.status(500).json({ error: '接受邀请失败' }));
  });
});

router.get('/caregivers', (req, res) => {
  db.query(`SELECT cc.id,cc.child_id,cc.caregiver_user_id,u.nickname,u.phone,cc.permissions,cc.status,cc.accepted_at,cc.revoked_at
    FROM child_caregivers cc JOIN users u ON u.id=cc.caregiver_user_id WHERE cc.owner_user_id=? ORDER BY cc.updated_at DESC`, [req.user.id], (error, rows) => error
      ? res.status(500).json({ error: '读取共同照护者失败' })
      : res.json({ success: true, caregivers: rows.map(row => ({ ...row, permissions: parseDbJson(row.permissions, []), phone: `${String(row.phone).slice(0,3)}****${String(row.phone).slice(-4)}` })) }));
});

router.delete('/caregivers/:membershipId', (req, res) => {
  const id = Number(req.params.membershipId); if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: '授权编号无效' });
  db.query("UPDATE child_caregivers SET status='revoked',revoked_at=NOW() WHERE id=? AND owner_user_id=? AND status='active'", [id, req.user.id], (error, result) => {
    if (error) return res.status(500).json({ error: '撤销授权失败' }); if (!result.affectedRows) return res.status(404).json({ error: '有效授权不存在' });
    writeAudit(req, 'caregiver_access_revoked', 'child_caregiver', String(id), 'success'); res.json({ success: true });
  });
});

router.get('/caregivers/children', (req, res) => {
  db.query(`SELECT c.id,c.nickname,c.birth_date,c.diagnosis_type,cc.permissions FROM child_caregivers cc JOIN children c ON c.id=cc.child_id
    WHERE cc.caregiver_user_id=? AND cc.status='active'`, [req.user.id], (error, rows) => error
      ? res.status(500).json({ error: '读取获授权儿童失败' })
      : res.json({ success: true, children: rows.map(row => { const permissions=parseDbJson(row.permissions,[]); return { id:row.id,nickname:row.nickname,birth_date:row.birth_date,diagnosis_type:permissions.includes('profile_summary')?row.diagnosis_type:null,permissions }; }) }));
});

router.post('/mood', auth, (req, res) => {
  const { mood, emoji, note } = req.body;
  
  if (!mood || !emoji) {
    return res.status(400).json({ error: '心情和表情不能为空' });
  }
  
  db.query('INSERT INTO family_moods (user_id, mood, emoji, note) VALUES (?, ?, ?, ?)',
    [req.user.id, mood, emoji, note || ''],
    (err, result) => {
      if (err) return res.status(500).json({ error: err.message });
      
      res.json({
        success: true,
        message: '心情记录成功',
        record: { id: result.insertId, mood, emoji, note }
      });
    }
  );
});

router.get('/mood', auth, (req, res) => {
  db.query('SELECT * FROM family_moods WHERE user_id = ? ORDER BY created_at DESC LIMIT 20',
    [req.user.id],
    (err, results) => {
      if (err) return res.status(500).json({ error: err.message });
      
      res.json({
        success: true,
        records: results
      });
    }
  );
});

router.post('/gratitude', auth, (req, res) => {
  const { partner, content } = req.body;
  
  if (!partner || !content) {
    return res.status(400).json({ error: '对方称呼和感谢内容不能为空' });
  }
  
  db.query('INSERT INTO gratitude_cards (user_id, partner, content) VALUES (?, ?, ?)',
    [req.user.id, partner, content],
    (err, result) => {
      if (err) return res.status(500).json({ error: err.message });
      
      res.json({
        success: true,
        message: '感谢卡创建成功',
        card: { id: result.insertId, partner, content }
      });
    }
  );
});

router.get('/gratitude', auth, (req, res) => {
  db.query('SELECT * FROM gratitude_cards WHERE user_id = ? ORDER BY created_at DESC',
    [req.user.id],
    (err, results) => {
      if (err) return res.status(500).json({ error: err.message });
      
      res.json({
        success: true,
        cards: results
      });
    }
  );
});

router.put('/gratitude/:id/send', auth, (req, res) => {
  const { id } = req.params;
  
  db.query('UPDATE gratitude_cards SET sent = TRUE WHERE id = ? AND user_id = ?',
    [id, req.user.id],
    (err, result) => {
      if (err) return res.status(500).json({ error: err.message });
      
      if (result.affectedRows === 0) {
        return res.status(400).json({ error: '感谢卡不存在' });
      }
      
      res.json({
        success: true,
        message: '感谢卡已发送'
      });
    }
  );
});

module.exports = router;
