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
            p.responsible_person, p.stop_conditions, p.review_date, p.status, p.notes,
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
  const insert = () => db.query(
    `INSERT INTO professional_plans
      (owner_user_id, therapist_id, source_feedback_id, title, goal, frequency, responsible_person, stop_conditions, review_date, status, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [req.user.id, therapistId, feedbackId, payload.title, payload.goal, payload.frequency, payload.responsible_person, payload.stop_conditions, payload.review_date, payload.status, payload.notes],
    (err, result) => err ? res.status(500).json({ error: '协作计划暂时无法保存' }) : res.status(201).json({ success: true, plan: { id: result.insertId, ...payload, therapist_id: therapistId, source_feedback_id: feedbackId } })
  );
  if (!therapistId) return insert();
  db.query('SELECT id FROM therapists WHERE id=? AND is_certified=TRUE', [therapistId], (err, rows) => {
    if (err) return res.status(500).json({ error: '暂时无法核验专业人员' });
    if (!rows.length) return res.status(400).json({ error: '只能关联已认证专业人员' });
    insert();
  });
});

router.patch('/plans/:planId', auth, requireRole('parent', 'admin'), (req, res) => {
  const planId = positiveId(req.params.planId);
  const payload = planPayload(req.body, true);
  if (!planId || !payload) return res.status(400).json({ error: '计划编号或状态无效' });
  db.query(
    `UPDATE professional_plans SET title=?, goal=?, frequency=?, responsible_person=?, stop_conditions=?, review_date=?, status=?, notes=?
     WHERE id=? AND owner_user_id=?`,
    [payload.title, payload.goal, payload.frequency, payload.responsible_person, payload.stop_conditions, payload.review_date, payload.status, payload.notes, planId, req.user.id],
    (err, result) => {
      if (err) return res.status(500).json({ error: '协作计划暂时无法更新' });
      if (!result.affectedRows) return res.status(404).json({ error: '协作计划不存在' });
      res.json({ success: true, message: '协作计划已更新' });
    }
  );
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
