const express = require('express');
const router = express.Router();
const db = require('../config/db');
const auth = require('../middleware/auth');
const { encryptJson, randomPublicId, randomToken, hashToken, decryptJson } = require('../services/sensitiveData');
const { writeAudit } = require('../services/audit');
const { parseDbJson } = require('../utils/json');

const PERMISSIONS = new Set(['profile_summary','behavior_records','weekly_reports','safety_plan']);
const cleanPhone = value => String(value || '').replace(/\D/g, '').slice(0, 20);
const validPermissions = value => Array.isArray(value) ? [...new Set(value.filter(item => PERMISSIONS.has(item)))] : [];
const requireCaregiverPermission = (permission, handler) => (req, res) => {
  const childId=Number(req.params.childId); if(!Number.isInteger(childId)||childId<=0)return res.status(400).json({error:'儿童编号无效'});
  db.query("SELECT permissions FROM child_caregivers WHERE child_id=? AND caregiver_user_id=? AND status='active'",[childId,req.user.id],(error,rows)=>{
    if(error)return res.status(500).json({error:'授权校验失败'});const permissions=parseDbJson(rows[0]?.permissions,[]);
    if(!rows.length||!permissions.includes(permission)){writeAudit(req,'caregiver_access_denied','child',String(childId),'denied',{permission});return res.status(403).json({error:'没有该儿童数据的有效授权'});}
    handler(req,res,childId);
  });
};

router.use(auth);

router.post('/caregivers/invitations', (req, res) => {
  const childId = Number(req.body?.child_id); const phone = cleanPhone(req.body?.phone); const permissions = validPermissions(req.body?.permissions); const clientRequestId=String(req.body?.client_request_id||'').trim();
  if (!Number.isInteger(childId) || childId <= 0 || phone.length < 6 || !permissions.length) return res.status(400).json({ error: '儿童、手机号或授权范围无效' });
  if(clientRequestId&&!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(clientRequestId))return res.status(400).json({error:'请求标识无效'});
  db.query('SELECT c.id,u.phone FROM children c JOIN users u ON u.id=c.user_id WHERE c.id=? AND c.user_id=?', [childId, req.user.id], (error, rows) => {
    if (error) return res.status(500).json({ error: '邀请服务暂时不可用' });
    if (!rows.length) return res.status(404).json({ error: '儿童档案不存在' });
    if (cleanPhone(rows[0].phone) === phone) return res.status(400).json({ error: '不能邀请自己的账号' });
    const replay = () => db.query(`SELECT public_id,child_id,permissions,token_ciphertext,token_iv,token_auth_tag FROM caregiver_invitations
      WHERE owner_user_id=? AND client_request_id=? AND status='pending' AND expires_at>NOW()`,[req.user.id,clientRequestId],(readError,existing)=>{
      if(readError||!existing.length)return res.status(500).json({error:'邀请保存状态暂时无法确认，请勿重复生成并稍后重试'});
      try{const invite=existing[0],token=decryptJson({ciphertext:invite.token_ciphertext,iv:invite.token_iv,tag:invite.token_auth_tag}).token;res.json({success:true,replayed:true,invitation:{id:invite.public_id,child_id:invite.child_id,permissions:parseDbJson(invite.permissions,[]),expires_in_days:7},invitation_code:token,delivery:'manual'});}catch(_){return res.status(500).json({error:'邀请码暂时无法安全恢复，请联系管理员核查，不要重复授权'});}
    });
    if(clientRequestId)return db.query('SELECT id FROM caregiver_invitations WHERE owner_user_id=? AND client_request_id=?',[req.user.id,clientRequestId],(readError,existing)=>{if(readError)return res.status(500).json({error:'邀请保存状态暂时无法确认，请保留当前页面后重试'});if(existing.length)return replay();create();});
    create();
    function create(){
      const token = randomToken(); const publicId = randomPublicId();let encrypted;try{encrypted=encryptJson({token});}catch(_){return res.status(503).json({error:'邀请码加密服务未配置'});}
      db.query(`INSERT INTO caregiver_invitations (public_id,owner_user_id,client_request_id,child_id,invitee_phone,token_hash,token_ciphertext,token_iv,token_auth_tag,permissions,expires_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,DATE_ADD(NOW(),INTERVAL 7 DAY))`, [publicId, req.user.id, clientRequestId||null, childId, phone, hashToken(token),encrypted.ciphertext,encrypted.iv,encrypted.tag,JSON.stringify(permissions)], (insertError) => {
      if(insertError?.code==='ER_DUP_ENTRY'&&clientRequestId)return replay();
      if (insertError) return res.status(500).json({ error: '邀请未确认创建，请保留当前页面后重试' });
      writeAudit(req, 'caregiver_invitation_created', 'child', String(childId), 'success', { invitation_id: publicId, permissions });
      res.status(201).json({ success: true, replayed:false, invitation: { id: publicId, child_id: childId, permissions, expires_in_days: 7 }, invitation_code: token, delivery: 'manual' });
    });
    }
  });
});

router.post('/caregivers/invitations/accept', (req, res) => {
  const token = String(req.body?.invitation_code || '').trim();
  if (token.length < 20) return res.status(400).json({ error: '邀请码无效' });
  db.query(`SELECT i.*,u.phone current_phone FROM caregiver_invitations i JOIN users u ON u.id=?
    WHERE i.token_hash=?`, [req.user.id, hashToken(token)], (error, rows) => {
    if (error) return res.status(500).json({ error: '接受邀请失败' });
    const invite = rows[0]; if (!invite) return res.status(404).json({ error: '邀请不存在或已失效' });
    if (cleanPhone(invite.current_phone) !== cleanPhone(invite.invitee_phone)) return res.status(403).json({ error: '该邀请不属于当前登录手机号' });
    if(invite.status==='accepted'&&Number(invite.accepted_by_user_id)===Number(req.user.id))return res.json({success:true,replayed:true,child_id:invite.child_id,message:'该邀请此前已经接受'});
    if(invite.status!=='pending'||new Date(invite.expires_at).getTime()<=Date.now()){
      if(invite.status==='pending')db.query("UPDATE caregiver_invitations SET status='expired',token_ciphertext=NULL,token_iv=NULL,token_auth_tag=NULL WHERE id=? AND status='pending'",[invite.id],()=>{});
      return res.status(404).json({error:'邀请已处理或已过期'});
    }
    db.withTransaction(async tx => {
      await tx.query(`INSERT INTO child_caregivers (child_id,owner_user_id,caregiver_user_id,permissions,status,accepted_at)
        VALUES (?,?,?,?, 'active',NOW()) ON DUPLICATE KEY UPDATE owner_user_id=VALUES(owner_user_id),permissions=VALUES(permissions),status='active',accepted_at=NOW(),revoked_at=NULL`, [invite.child_id, invite.owner_user_id, req.user.id, JSON.stringify(parseDbJson(invite.permissions, []))]);
      await tx.query("UPDATE caregiver_invitations SET status='accepted',accepted_by_user_id=?,accepted_at=NOW(),token_ciphertext=NULL,token_iv=NULL,token_auth_tag=NULL WHERE id=? AND status='pending'", [req.user.id, invite.id]);
    }).then(() => { writeAudit(req, 'caregiver_invitation_accepted', 'child', String(invite.child_id), 'success', { invitation_id: invite.public_id }); res.json({ success: true, replayed:false, child_id: invite.child_id }); })
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

router.get('/caregivers/children/:childId/records', requireCaregiverPermission('behavior_records',(req,res,childId)=>{
  db.query(`SELECT id,content,behavior_category,behavior_subtype,emotion_state,trigger_factor,behavior_function,intensity_level,location,duration,created_at
    FROM behavior_records WHERE child_id=? ORDER BY created_at DESC LIMIT 100`,[childId],(error,rows)=>error?res.status(500).json({error:'读取行为记录失败'}):res.json({success:true,records:rows}));
}));

router.get('/caregivers/children/:childId/reports', requireCaregiverPermission('weekly_reports',(req,res,childId)=>{
  db.query('SELECT id,week_start,week_end,content,generated_at FROM weekly_reports WHERE child_id=? ORDER BY week_start DESC LIMIT 52',[childId],(error,rows)=>error?res.status(500).json({error:'读取周报失败'}):res.json({success:true,reports:rows.map(row=>({...row,content:parseDbJson(row.content,{})}))}));
}));

router.get('/caregivers/children/:childId/safety-plan', requireCaregiverPermission('safety_plan',(req,res,childId)=>{
  db.query("SELECT public_id,ciphertext,iv,auth_tag,version,updated_at FROM sensitive_records WHERE child_id=? AND kind='safety_plan' ORDER BY updated_at DESC LIMIT 1",[childId],(error,rows)=>{
    if(error)return res.status(500).json({error:'读取安全预案失败'});if(!rows.length)return res.status(404).json({error:'安全预案不存在'});
    try{const row=rows[0];const data=decryptJson({ciphertext:row.ciphertext,iv:row.iv,tag:row.auth_tag});writeAudit(req,'caregiver_safety_plan_read','sensitive_record',row.public_id,'success',{child_id:childId});res.json({success:true,plan:{id:row.public_id,data,version:row.version,updated_at:row.updated_at}})}catch(_){writeAudit(req,'caregiver_safety_plan_read','sensitive_record',rows[0].public_id,'decrypt_failure',{child_id:childId});res.status(500).json({error:'安全预案暂时无法解密'});}
  });
}));

router.post('/mood', auth, (req, res) => {
  const { mood, emoji, note } = req.body;
  const clientRequestId = String(req.body.client_request_id || '').trim();
  
  if (!mood || !emoji || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(clientRequestId)) {
    return res.status(400).json({ error: '心情和表情不能为空' });
  }
  
  const replay = () => db.query('SELECT id,mood,emoji,note,created_at FROM family_moods WHERE user_id=? AND client_request_id=?', [req.user.id, clientRequestId], (readErr, rows) => readErr || !rows.length ? res.status(500).json({ error: '心情记录状态暂时无法确认' }) : res.json({ success: true, replayed: true, record: rows[0] }));
  const create = () => db.query('INSERT INTO family_moods (user_id, client_request_id, mood, emoji, note) VALUES (?, ?, ?, ?, ?)',
    [req.user.id, clientRequestId, String(mood).slice(0, 50), String(emoji).slice(0, 20), String(note || '').trim().slice(0, 500)],
    (err, result) => {
      if (err?.code === 'ER_DUP_ENTRY') return replay();
      if (err) return res.status(500).json({ error: '心情记录暂时无法保存' });
      
      res.json({
        success: true,
        message: '心情记录成功',
        record: { id: result.insertId, mood, emoji, note }
      });
    }
  );
  db.query('SELECT id FROM family_moods WHERE user_id=? AND client_request_id=?', [req.user.id, clientRequestId], (err, rows) => err ? res.status(500).json({ error: '心情记录状态暂时无法确认' }) : rows.length ? replay() : create());
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
  const clientRequestId = String(req.body.client_request_id || '').trim();
  
  if (!partner || !content || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(clientRequestId)) {
    return res.status(400).json({ error: '对方称呼和感谢内容不能为空' });
  }
  
  const replay = () => db.query('SELECT id,partner,content,sent,created_at FROM gratitude_cards WHERE user_id=? AND client_request_id=?', [req.user.id, clientRequestId], (readErr, rows) => readErr || !rows.length ? res.status(500).json({ error: '感谢卡保存状态暂时无法确认' }) : res.json({ success: true, replayed: true, card: rows[0] }));
  const create = () => db.query('INSERT INTO gratitude_cards (user_id, client_request_id, partner, content) VALUES (?, ?, ?, ?)',
    [req.user.id, clientRequestId, String(partner).trim().slice(0, 80), String(content).trim().slice(0, 2000)],
    (err, result) => {
      if (err?.code === 'ER_DUP_ENTRY') return replay();
      if (err) return res.status(500).json({ error: '感谢卡暂时无法保存' });
      
      res.json({
        success: true,
        message: '感谢卡创建成功',
        card: { id: result.insertId, partner, content }
      });
    }
  );
  db.query('SELECT id FROM gratitude_cards WHERE user_id=? AND client_request_id=?', [req.user.id, clientRequestId], (err, rows) => err ? res.status(500).json({ error: '感谢卡保存状态暂时无法确认' }) : rows.length ? replay() : create());
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
