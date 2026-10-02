'use strict';

const express = require('express');
const router = express.Router();
const db = require('../config/db');
const auth = require('../middleware/auth');
const { requireRole } = require('../middleware/roles');
const { parseDbJson } = require('../utils/json');

const clean = (value, max) => String(value ?? '').trim().slice(0, max);
const positiveId = value => {
  const id = Number.parseInt(value, 10);
  return Number.isInteger(id) && id > 0 ? id : 0;
};
const PUBLIC_FIELDS = 'id, name, professional_title, specialty, years_of_experience, profile_photo, rating, review_count, is_certified';
const PLAN_STATUSES = new Set(['pending_confirmation', 'active', 'paused', 'completed', 'escalated']);
const REVIEW_DECISIONS = new Set(['confirmed', 'returned']);

function recordPlanEvent(planId, user, action, fromStatus, toStatus, note, callback = () => {}) {
  db.query(
    'INSERT INTO professional_plan_events (plan_id, actor_user_id, actor_role, action, from_status, to_status, note) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [planId, user.id, user.role, action, fromStatus || null, toStatus || null, clean(note, 1000) || null],
    callback
  );
}

function sendTrustedNotification(userId, title, content, callback = () => {}) {
  db.query('INSERT INTO notifications (user_id, title, content, type) VALUES (?, ?, ?, ?)', [userId, title, content, 'system'], callback);
}

function planPayload(body, partial = false) {
  const payload = {
    title: clean(body.title, 200),
    goal: clean(body.goal, 500) || null,
    frequency: clean(body.frequency, 200) || null,
    responsible_person: clean(body.responsible_person, 100) || null,
    stop_conditions: clean(body.stop_conditions, 500) || null,
    review_date: /^\d{4}-\d{2}-\d{2}$/.test(String(body.review_date || '')) ? body.review_date : null,
    status: clean(body.status, 30) || 'pending_confirmation',
    notes: clean(body.notes, 1000) || null,
  };
  if ((!partial && !payload.title) || !PLAN_STATUSES.has(payload.status)) return null;
  return payload;
}

function filterReport(content, scopes) {
  const source = parseDbJson(content, {});
  const output = { week_start: source.week_start, week_end: source.week_end };
  if (scopes.includes('summary')) {
    output.summary = source.summary || {};
    output.category_distribution = source.category_distribution || [];
    output.top_questions = source.top_questions || [];
  }
  if (scopes.includes('risk')) {
    output.risk = {
      high_intensity_count: Number(source.summary?.high_intensity_count || 0),
      categories_requiring_review: (source.category_distribution || []).filter(item => ['自伤行为', '攻击行为', '跑开/走失'].includes(item.behavior_category)),
    };
  }
  if (scopes.includes('medical')) output.medical = { status: 'not_collected', message: '本周报未自动汇入诊断、处方或用药详情' };
  return output;
}

// 分享周报前同时核验：报告归属当前家长、接收者已通过资质审核。
router.post('/share', auth, requireRole('parent', 'admin'), (req, res) => {
  const reportId = positiveId(req.body.report_id);
  const therapistId = positiveId(req.body.therapist_id);
  const allowedScopes = new Set(['summary', 'risk', 'medical']);
  const scope = Array.isArray(req.body.scope) ? [...new Set(req.body.scope)] : [];
  const expiresDays = Number(req.body.expires_days ?? 7);
  const note = clean(req.body.note, 500);
  if (!reportId || !therapistId) return res.status(400).json({ error: '周报和专业人员编号无效' });
  if (!scope.length || scope.some(item => !allowedScopes.has(item))) return res.status(400).json({ error: '分享范围无效' });
  if (![1, 7, 30].includes(expiresDays)) return res.status(400).json({ error: '分享有效期无效' });

  db.query('SELECT id FROM weekly_reports WHERE id = ? AND user_id = ?', [reportId, req.user.id], (reportErr, reports) => {
    if (reportErr) return res.status(500).json({ error: '暂时无法核验周报' });
    if (!reports.length) return res.status(404).json({ error: '周报不存在' });
    db.query('SELECT id FROM therapists WHERE id = ? AND is_certified = TRUE', [therapistId], (therapistErr, therapists) => {
      if (therapistErr) return res.status(500).json({ error: '暂时无法核验专业人员' });
      if (!therapists.length) return res.status(400).json({ error: '接收者尚未通过资质核验，不能分享儿童资料' });
      const expiresAt = new Date(Date.now() + expiresDays * 86400000);
      db.query(
        'INSERT INTO report_shares (report_id, owner_user_id, therapist_id, scope, note, expires_at) VALUES (?, ?, ?, ?, ?, ?)',
        [reportId, req.user.id, therapistId, JSON.stringify(scope), note, expiresAt],
        (err, result) => err
          ? res.status(500).json({ error: '周报暂时无法分享' })
          : res.status(201).json({ success: true, message: '周报已按授权范围分享', share: { id: result.insertId, scope, expires_days: expiresDays } })
      );
    });
  });
});

// 专业人员身份只能由管理员在核验资质后建立，禁止公开自助注册。
router.post('/register', auth, requireRole('admin'), (req, res) => {
  const userId = positiveId(req.body.user_id);
  const name = clean(req.body.name, 50);
  const phone = clean(req.body.phone, 20);
  const email = clean(req.body.email, 100) || null;
  const title = clean(req.body.professional_title, 50) || null;
  const specialty = clean(req.body.specialty, 200) || null;
  const years = Math.max(0, Math.min(80, Number.parseInt(req.body.years_of_experience, 10) || 0));
  if (!userId || !name || !/^1\d{10}$/.test(phone)) return res.status(400).json({ error: '账号、姓名和手机号必须有效' });

  db.query("SELECT id FROM users WHERE id = ? AND role = 'therapist'", [userId], (userErr, users) => {
    if (userErr) return res.status(500).json({ error: '暂时无法核验专业账号' });
    if (!users.length) return res.status(400).json({ error: '目标账号不是专业人员账号' });
    db.query(
      'INSERT INTO therapists (user_id, name, phone, email, professional_title, specialty, years_of_experience, is_certified) VALUES (?, ?, ?, ?, ?, ?, ?, TRUE)',
      [userId, name, phone, email, title, specialty, years],
      (err, result) => err
        ? res.status(400).json({ error: '该账号或手机号已绑定专业人员资料' })
        : res.status(201).json({ success: true, message: '专业人员资料已核验并建立', therapist: { id: result.insertId, name } })
    );
  });
});

// 管理端只返回核验档案清单；联系方式继续脱敏，避免运营台成为敏感通讯录。
router.get('/admin/profiles', auth, requireRole('admin'), (req, res) => {
  db.query(
    `SELECT id, user_id, name, phone, email, professional_title, specialty,
            years_of_experience, is_certified, created_at
     FROM therapists ORDER BY created_at DESC LIMIT 200`,
    [],
    (err, rows) => {
      if (err) return res.status(500).json({ error: '专业资质档案暂时无法读取' });
      const profiles = rows.map(row => ({
        id: row.id,
        user_id: row.user_id,
        name: row.name,
        phone: String(row.phone || '').replace(/^(\d{3})\d+(\d{4})$/, '$1****$2'),
        email: row.email ? String(row.email).replace(/^(.{1,2}).*(@.*)$/, '$1***$2') : null,
        professional_title: row.professional_title,
        specialty: row.specialty,
        years_of_experience: Number(row.years_of_experience || 0),
        is_certified: Boolean(row.is_certified),
        created_at: row.created_at,
      }));
      res.json({ success: true, profiles });
    }
  );
});

// 公开目录只展示已核验人员，并且永不返回手机号、邮箱、绑定账号等字段。
router.get('/', (req, res) => {
  const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
  const limit = Math.max(1, Math.min(50, Number.parseInt(req.query.limit, 10) || 20));
  const offset = (page - 1) * limit;
  const specialty = clean(req.query.specialty, 100);
  const where = specialty ? 'is_certified = TRUE AND specialty LIKE ?' : 'is_certified = TRUE';
  const params = specialty ? [`%${specialty}%`, limit, offset] : [limit, offset];
  db.query(`SELECT ${PUBLIC_FIELDS} FROM therapists WHERE ${where} ORDER BY professional_score DESC, rating DESC LIMIT ? OFFSET ?`, params, (err, rows) => {
    if (err) return res.status(500).json({ error: '专业人员目录暂时无法读取' });
    db.query(`SELECT COUNT(*) total FROM therapists WHERE ${where}`, specialty ? [`%${specialty}%`] : [], (countErr, totals) => {
      if (countErr) return res.status(500).json({ error: '专业人员目录暂时无法读取' });
      res.json({ success: true, therapists: rows, total: Number(totals[0]?.total || 0), page, limit });
    });
  });
});

router.get('/shares/mine', auth, requireRole('parent', 'admin'), (req, res) => {
  db.query(
    `SELECT rs.id, rs.report_id, rs.therapist_id, rs.scope, rs.note, rs.expires_at, rs.revoked_at, rs.created_at,
            t.name therapist_name, t.professional_title
     FROM report_shares rs JOIN therapists t ON t.id=rs.therapist_id
     WHERE rs.owner_user_id=? ORDER BY rs.created_at DESC LIMIT 100`,
    [req.user.id],
    (err, rows) => err ? res.status(500).json({ error: '授权记录暂时无法读取' }) : res.json({ success: true, shares: rows.map(row => ({ ...row, scope: parseDbJson(row.scope, []) })) })
  );
});

router.delete('/shares/:shareId', auth, requireRole('parent', 'admin'), (req, res) => {
  const shareId = positiveId(req.params.shareId);
  if (!shareId) return res.status(400).json({ error: '授权编号无效' });
  db.query('UPDATE report_shares SET revoked_at=NOW() WHERE id=? AND owner_user_id=? AND revoked_at IS NULL', [shareId, req.user.id], (err, result) => {
    if (err) return res.status(500).json({ error: '授权暂时无法撤销' });
    if (!result.affectedRows) return res.status(404).json({ error: '有效授权不存在' });
    res.json({ success: true, message: '授权已撤销' });
  });
});

router.get('/plans/mine', auth, requireRole('parent', 'admin'), (req, res) => {
  db.query(
    `SELECT p.id, p.therapist_id, p.source_feedback_id, p.title, p.goal, p.frequency,
            p.responsible_person, p.stop_conditions, p.review_date, p.status, p.confirmation_status,
            p.professional_note, p.reviewed_at, p.reviewed_by_user_id, p.version, p.notes,
            p.created_at, p.updated_at, t.name therapist_name
     FROM professional_plans p LEFT JOIN therapists t ON t.id=p.therapist_id
     WHERE p.owner_user_id=? ORDER BY p.updated_at DESC LIMIT 100`,
    [req.user.id],
    (err, rows) => err ? res.status(500).json({ error: '协作计划暂时无法读取' }) : res.json({ success: true, plans: rows })
  );
});

router.post('/plans', auth, requireRole('parent', 'admin'), (req, res) => {
  const payload = planPayload(req.body);
  const therapistId = positiveId(req.body.therapist_id) || null;
  const feedbackId = positiveId(req.body.source_feedback_id) || null;
  if (!payload) return res.status(400).json({ error: '计划标题和状态必须有效' });
  if (therapistId && payload.status === 'active') return res.status(400).json({ error: '关联专业人员的计划必须先由对方确认，不能由家长直接标记执行中' });
  const confirmationStatus = therapistId ? 'pending' : 'not_requested';
  const insert = (therapistUserId = null) => db.query(
    `INSERT INTO professional_plans
      (owner_user_id, therapist_id, source_feedback_id, title, goal, frequency, responsible_person, stop_conditions, review_date, status, confirmation_status, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [req.user.id, therapistId, feedbackId, payload.title, payload.goal, payload.frequency, payload.responsible_person, payload.stop_conditions, payload.review_date, payload.status, confirmationStatus, payload.notes],
    (err, result) => {
      if (err) return res.status(500).json({ error: '协作计划暂时无法保存' });
      recordPlanEvent(result.insertId, req.user, therapistId ? 'submitted' : 'created', null, confirmationStatus, payload.notes, eventErr => {
        if (eventErr) return res.status(500).json({ error: '计划已保存，但审计记录失败，请联系管理员核查' });
        const finish = notificationErr => notificationErr
          ? res.status(500).json({ error: '计划已保存，但专业人员通知失败，请勿假设对方已收到' })
          : res.status(201).json({ success: true, plan: { id: result.insertId, ...payload, therapist_id: therapistId, source_feedback_id: feedbackId, confirmation_status: confirmationStatus, version: 1 } });
        if (therapistUserId) return sendTrustedNotification(therapistUserId, '新的协作计划待确认', `家长提交了“${payload.title}”，请核对目标、频率和停止条件。`, finish);
        finish(null);
      });
    }
  );
  if (!therapistId) return insert();
  db.query('SELECT id, user_id FROM therapists WHERE id=? AND is_certified=TRUE AND user_id IS NOT NULL', [therapistId], (err, rows) => {
    if (err) return res.status(500).json({ error: '暂时无法核验专业人员' });
    if (!rows.length) return res.status(400).json({ error: '只能关联已认证专业人员' });
    insert(rows[0].user_id);
  });
});

router.patch('/plans/:planId', auth, requireRole('parent', 'admin'), (req, res) => {
  const planId = positiveId(req.params.planId);
  const payload = planPayload(req.body, true);
  if (!planId || !payload) return res.status(400).json({ error: '计划编号或状态无效' });
  db.query('SELECT status, therapist_id, confirmation_status FROM professional_plans WHERE id=? AND owner_user_id=?', [planId, req.user.id], (readErr, rows) => {
    if (readErr) return res.status(500).json({ error: '协作计划暂时无法读取' });
    if (!rows.length) return res.status(404).json({ error: '协作计划不存在' });
    const current = rows[0];
    if (payload.status === 'active' && current.therapist_id && current.confirmation_status !== 'confirmed') {
      return res.status(409).json({ error: '专业人员尚未确认或已退回，不能开始执行' });
    }
    const resetReview = current.therapist_id && ['confirmed', 'returned'].includes(current.confirmation_status);
    db.query(
      `UPDATE professional_plans SET title=?, goal=?, frequency=?, responsible_person=?, stop_conditions=?, review_date=?, status=?, notes=?,
       confirmation_status=IF(?, 'pending', confirmation_status), professional_note=IF(?, NULL, professional_note), reviewed_at=IF(?, NULL, reviewed_at), reviewed_by_user_id=IF(?, NULL, reviewed_by_user_id), version=version+1
       WHERE id=? AND owner_user_id=?`,
      [payload.title, payload.goal, payload.frequency, payload.responsible_person, payload.stop_conditions, payload.review_date, payload.status, payload.notes,
       resetReview, resetReview, resetReview, resetReview, planId, req.user.id],
      (err, result) => {
        if (err) return res.status(500).json({ error: '协作计划暂时无法更新' });
        recordPlanEvent(planId, req.user, payload.status !== current.status ? 'status_changed' : 'updated', current.status, payload.status, payload.notes, eventErr => {
          if (eventErr) return res.status(500).json({ error: '计划已更新，但审计记录失败，请联系管理员核查' });
          res.json({ success: true, message: resetReview ? '计划已更新，需专业人员重新确认' : '协作计划已更新', confirmation_status: resetReview ? 'pending' : current.confirmation_status });
        });
      }
    );
  });
});

router.get('/plans/assigned', auth, requireRole('therapist', 'admin'), (req, res) => {
  const where = req.user.role === 'admin' ? '' : 'WHERE t.user_id=?';
  const params = req.user.role === 'admin' ? [] : [req.user.id];
  db.query(
    `SELECT p.id, p.owner_user_id, p.therapist_id, p.title, p.goal, p.frequency, p.responsible_person,
            p.stop_conditions, p.review_date, p.status, p.confirmation_status, p.professional_note,
            p.reviewed_at, p.version, p.created_at, p.updated_at
     FROM professional_plans p JOIN therapists t ON t.id=p.therapist_id ${where}
     ORDER BY p.updated_at DESC LIMIT 100`,
    params,
    (err, rows) => err ? res.status(500).json({ error: '待确认计划暂时无法读取' }) : res.json({ success: true, plans: rows })
  );
});

router.post('/plans/:planId/review', auth, requireRole('therapist', 'admin'), (req, res) => {
  const planId = positiveId(req.params.planId);
  const decision = clean(req.body.decision, 20);
  const note = clean(req.body.note, 1000);
  if (!planId || !REVIEW_DECISIONS.has(decision)) return res.status(400).json({ error: '计划编号或审核决定无效' });
  if (decision === 'returned' && note.length < 5) return res.status(400).json({ error: '退回时请说明需要修改的具体内容' });
  const ownership = req.user.role === 'admin' ? '' : 'AND t.user_id=?';
  const params = req.user.role === 'admin' ? [planId] : [planId, req.user.id];
  db.query(
    `SELECT p.id, p.owner_user_id, p.confirmation_status, p.title FROM professional_plans p
     JOIN therapists t ON t.id=p.therapist_id WHERE p.id=? ${ownership}`,
    params,
    (readErr, rows) => {
      if (readErr) return res.status(500).json({ error: '计划审核暂时不可用' });
      if (!rows.length) return res.status(404).json({ error: '计划不存在或未分配给当前专业账号' });
      const plan = rows[0];
      if (plan.confirmation_status !== 'pending') return res.status(409).json({ error: '该版本计划已经处理，请让家长修改后重新提交' });
      db.query(
        `UPDATE professional_plans SET confirmation_status=?, professional_note=?, reviewed_at=NOW(), reviewed_by_user_id=?, version=version+1
         WHERE id=? AND confirmation_status='pending'`,
        [decision, note || null, req.user.id, planId],
        (updateErr, result) => {
          if (updateErr) return res.status(500).json({ error: '计划审核暂时无法保存' });
          if (!result.affectedRows) return res.status(409).json({ error: '计划版本已变化，请刷新后重试' });
          recordPlanEvent(planId, req.user, decision, 'pending', decision, note, eventErr => {
            if (eventErr) return res.status(500).json({ error: '审核已保存，但审计记录失败，请联系管理员核查' });
            sendTrustedNotification(plan.owner_user_id, decision === 'confirmed' ? '协作计划已确认' : '协作计划需要修改', `“${plan.title}”${decision === 'confirmed' ? '已由专业人员确认，可由家长决定是否开始。' : `已退回：${note}`}`, notificationErr => {
              if (notificationErr) return res.status(500).json({ error: '审核已保存，但家长通知失败，请勿假设对方已收到' });
              res.json({ success: true, confirmation_status: decision, message: decision === 'confirmed' ? '计划已确认' : '计划已退回家长修改' });
            });
          });
        }
      );
    }
  );
});

router.get('/plans/:planId/events', auth, (req, res) => {
  const planId = positiveId(req.params.planId);
  if (!planId) return res.status(400).json({ error: '计划编号无效' });
  const accessSql = req.user.role === 'parent'
    ? 'SELECT id FROM professional_plans WHERE id=? AND owner_user_id=?'
    : req.user.role === 'therapist'
      ? 'SELECT p.id FROM professional_plans p JOIN therapists t ON t.id=p.therapist_id WHERE p.id=? AND t.user_id=?'
      : 'SELECT id FROM professional_plans WHERE id=?';
  db.query(accessSql, [planId, ...(req.user.role === 'admin' ? [] : [req.user.id])], (accessErr, rows) => {
    if (accessErr) return res.status(500).json({ error: '计划审计暂时无法读取' });
    if (!rows.length) return res.status(404).json({ error: '计划不存在或无权查看' });
    db.query('SELECT id, actor_user_id, actor_role, action, from_status, to_status, note, created_at FROM professional_plan_events WHERE plan_id=? ORDER BY created_at ASC, id ASC', [planId], (err, events) => {
      if (err) return res.status(500).json({ error: '计划审计暂时无法读取' });
      res.json({ success: true, events });
    });
  });
});

router.get('/:id', (req, res) => {
  const id = positiveId(req.params.id);
  if (!id) return res.status(400).json({ error: '专业人员编号无效' });
  db.query(`SELECT ${PUBLIC_FIELDS} FROM therapists WHERE id = ? AND is_certified = TRUE`, [id], (err, rows) => {
    if (err) return res.status(500).json({ error: '专业人员资料暂时无法读取' });
    if (!rows.length) return res.status(404).json({ error: '未找到已核验的专业人员' });
    res.json({ success: true, therapist: rows[0] });
  });
});

router.put('/:id', auth, requireRole('therapist', 'admin'), (req, res) => {
  const id = positiveId(req.params.id);
  if (!id) return res.status(400).json({ error: '专业人员编号无效' });
  const values = [clean(req.body.name, 50), clean(req.body.email, 100) || null, clean(req.body.professional_title, 50) || null, clean(req.body.specialty, 200) || null, Math.max(0, Math.min(80, Number(req.body.years_of_experience) || 0)), clean(req.body.profile_photo, 255) || null];
  if (!values[0]) return res.status(400).json({ error: '姓名不能为空' });
  const sql = req.user.role === 'admin'
    ? 'UPDATE therapists SET name=?, email=?, professional_title=?, specialty=?, years_of_experience=?, profile_photo=? WHERE id=?'
    : 'UPDATE therapists SET name=?, email=?, professional_title=?, specialty=?, years_of_experience=?, profile_photo=? WHERE id=? AND user_id=?';
  const params = req.user.role === 'admin' ? [...values, id] : [...values, id, req.user.id];
  db.query(sql, params, (err, result) => {
    if (err) return res.status(500).json({ error: '专业人员资料暂时无法更新' });
    if (!result.affectedRows) return res.status(404).json({ error: '专业人员资料不存在或不属于当前账号' });
    res.json({ success: true, message: '专业人员资料已更新' });
  });
});

router.get('/:id/reports', auth, requireRole('therapist', 'admin'), (req, res) => {
  const id = positiveId(req.params.id);
  if (!id) return res.status(400).json({ error: '专业人员编号无效' });
  const ownershipSql = req.user.role === 'admin' ? 'SELECT id FROM therapists WHERE id = ?' : 'SELECT id FROM therapists WHERE id = ? AND user_id = ?';
  const ownershipParams = req.user.role === 'admin' ? [id] : [id, req.user.id];
  db.query(ownershipSql, ownershipParams, (ownerErr, owners) => {
    if (ownerErr) return res.status(500).json({ error: '暂时无法核验专业账号' });
    if (!owners.length) return res.status(403).json({ error: '无权读取该专业人员的分享' });
    db.query(
      `SELECT r.id, r.week_start, r.week_end, r.generated_at, c.nickname child_name, rs.scope, rs.expires_at
       FROM report_shares rs JOIN weekly_reports r ON r.id=rs.report_id JOIN children c ON c.id=r.child_id
       WHERE rs.therapist_id=? AND rs.revoked_at IS NULL AND rs.expires_at>NOW()
       ORDER BY rs.created_at DESC LIMIT 100`,
      [id],
      (err, rows) => err ? res.status(500).json({ error: '授权周报暂时无法读取' }) : res.json({ success: true, reports: rows })
    );
  });
});

router.get('/:id/reports/:reportId', auth, requireRole('therapist', 'admin'), (req, res) => {
  const id = positiveId(req.params.id);
  const reportId = positiveId(req.params.reportId);
  if (!id || !reportId) return res.status(400).json({ error: '专业人员或周报编号无效' });
  const ownershipSql = req.user.role === 'admin' ? 'SELECT id FROM therapists WHERE id=?' : 'SELECT id FROM therapists WHERE id=? AND user_id=?';
  const ownershipParams = req.user.role === 'admin' ? [id] : [id, req.user.id];
  db.query(ownershipSql, ownershipParams, (ownerErr, owners) => {
    if (ownerErr) return res.status(500).json({ error: '暂时无法核验专业账号' });
    if (!owners.length) return res.status(403).json({ error: '无权读取该专业人员的分享' });
    db.query(
      `SELECT r.id, r.week_start, r.week_end, r.content, rs.scope, rs.note, rs.expires_at
       FROM report_shares rs JOIN weekly_reports r ON r.id=rs.report_id
       WHERE rs.report_id=? AND rs.therapist_id=? AND rs.revoked_at IS NULL AND rs.expires_at>NOW()
       ORDER BY rs.created_at DESC LIMIT 1`,
      [reportId, id],
      (err, rows) => {
        if (err) return res.status(500).json({ error: '授权周报暂时无法读取' });
        if (!rows.length) return res.status(404).json({ error: '授权不存在、已撤销或已过期' });
        const scopes = parseDbJson(rows[0].scope, []);
        res.json({ success: true, report: { id: rows[0].id, scope: scopes, note: rows[0].note, expires_at: rows[0].expires_at, content: filterReport(rows[0].content, scopes) } });
      }
    );
  });
});

router.post('/:id/rate', auth, requireRole('parent'), (req, res) => {
  const id = positiveId(req.params.id);
  const rating = Number(req.body.rating);
  if (!id || !Number.isInteger(rating) || rating < 1 || rating > 5) return res.status(400).json({ error: '评分必须为1至5的整数' });
  db.query('SELECT id, rating, review_count FROM therapists WHERE id = ? AND is_certified = TRUE', [id], (err, rows) => {
    if (err) return res.status(500).json({ error: '评分暂时无法提交' });
    if (!rows.length) return res.status(404).json({ error: '未找到已核验的专业人员' });
    const count = Number(rows[0].review_count || 0) + 1;
    const average = ((Number(rows[0].rating || 0) * (count - 1)) + rating) / count;
    db.query('UPDATE therapists SET rating=?, review_count=? WHERE id=?', [average, count, id], updateErr => updateErr
      ? res.status(500).json({ error: '评分暂时无法提交' })
      : res.json({ success: true, message: '评分成功', rating: average }));
  });
});

module.exports = router;
