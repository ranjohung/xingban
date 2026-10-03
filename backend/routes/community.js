const express = require('express');
const router = express.Router();
const db = require('../config/db');
const auth = require('../middleware/auth');
const { requireRole } = require('../middleware/roles');
const { parseDbJson } = require('../utils/json');
const { randomUUID } = require('crypto');

const CATEGORIES = new Set(['general', 'training', 'emotion', 'resource', 'question']);
const REPORT_REASONS = new Set(['crisis', 'harassment', 'privacy', 'misinformation', 'fraud', 'other']);
const REPORT_STATUSES = new Set(['open', 'reviewing', 'resolved', 'dismissed']);
const URGENT_PATTERN = /自杀|不想活|结束生命|伤害自己|伤害孩子|杀了|服药过量|吞药|幻觉|妄想|意识不清/;
const cleanText = (value, max) => typeof value === 'string' ? value.trim().slice(0, max) : '';
const positiveInt = (value, fallback, max) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? Math.min(parsed, max) : fallback;
};
const publicPost = post => ({
  id: post.id,
  title: post.title,
  content: post.content,
  category: CATEGORIES.has(post.category) ? post.category : 'general',
  likes: Number(post.likes || 0),
  comments_count: Number(post.comments_count || 0),
  created_at: post.created_at
});
const publicComment = comment => ({
  id: comment.id,
  post_id: comment.post_id,
  content: comment.content,
  created_at: comment.created_at
});
const crisisResponse = {
  title: '这条内容可能涉及即时安全风险，已暂缓公开',
  actions: ['不要等待社区回复', '陪伴处于风险中的孩子，不让其独处', '在不危及成人安全的前提下降低危险物可及性', '立即联系120/110、既往就诊机构或当地危机资源'],
};

function createReport({ reporterId, targetType, targetId, reason, details, riskLevel }, callback) {
  const caseRef = randomUUID();
  db.query(
    'INSERT INTO community_reports (case_ref, reporter_user_id, target_type, target_id, reason, details, risk_level) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [caseRef, reporterId, targetType, targetId, reason, details || null, riskLevel],
    (err) => callback(err, caseRef)
  );
}

router.get('/posts', auth, (req, res) => {
  const page = positiveInt(req.query.page, 1, 100000);
  const limit = positiveInt(req.query.limit, 10, 50);
  const offset = (page - 1) * limit;
  const category = CATEGORIES.has(req.query.category) ? req.query.category : null;
  const query = category
    ? "SELECT * FROM community_posts WHERE moderation_status = 'visible' AND category = ? ORDER BY created_at DESC LIMIT ? OFFSET ?"
    : "SELECT * FROM community_posts WHERE moderation_status = 'visible' ORDER BY created_at DESC LIMIT ? OFFSET ?";
  const params = category ? [category, limit, offset] : [limit, offset];

  db.query(query, params, (err, results) => {
    if (err) return res.status(500).json({ error: '社区内容暂时无法读取' });
    db.query("SELECT COUNT(*) as total FROM community_posts WHERE moderation_status = 'visible'", (countErr, countResult) => {
      if (countErr) return res.status(500).json({ error: '社区内容暂时无法读取' });
      res.json({ success: true, posts: results.map(publicPost), pagination: { page, limit, total: countResult[0].total } });
    });
  });
});

router.post('/posts', auth, (req, res) => {
  const title = cleanText(req.body.title, 80);
  const content = cleanText(req.body.content, 2000);
  const category = CATEGORIES.has(req.body.category) ? req.body.category : 'general';
  if (!title || !content) return res.status(400).json({ error: '标题和内容不能为空' });
  const urgent = URGENT_PATTERN.test(`${title}\n${content}`);
  db.query('INSERT INTO community_posts (user_id, title, content, category, moderation_status, risk_level) VALUES (?, ?, ?, ?, ?, ?)',
    [req.user.id, title, content, category, urgent ? 'held' : 'visible', urgent ? 'urgent' : 'none'],
    (err, result) => {
      if (err) return res.status(500).json({ error: '帖子暂时无法发布' });
      if (!urgent) return res.status(201).json({ success: true, message: '发帖成功', post: { id: result.insertId, title, content, category } });
      createReport({ reporterId: req.user.id, targetType: 'post', targetId: result.insertId, reason: 'crisis', details: '系统安全词触发，仅用于人工复核，不代表诊断', riskLevel: 'urgent' }, (reportErr, caseRef) => {
        if (reportErr) return res.status(500).json({ error: '内容已暂缓公开，但审核工单创建失败，请直接联系紧急服务' });
        res.status(202).json({ success: true, held_for_review: true, post_id: result.insertId, case_ref: caseRef, safety: crisisResponse });
      });
    }
  );
});

router.get('/posts/:id', auth, (req, res) => {
  const id = positiveInt(req.params.id, 0, Number.MAX_SAFE_INTEGER);
  if (!id) return res.status(400).json({ error: '帖子编号无效' });
  db.query("SELECT * FROM community_posts WHERE id = ? AND moderation_status = 'visible'", [id], (err, results) => {
    if (err) return res.status(500).json({ error: '帖子暂时无法读取' });
    if (results.length === 0) return res.status(404).json({ error: '帖子不存在' });
    res.json({ success: true, post: publicPost(results[0]) });
  });
});

router.post('/posts/:id/like', auth, (req, res) => {
  const id = positiveInt(req.params.id, 0, Number.MAX_SAFE_INTEGER);
  if (!id) return res.status(400).json({ error: '帖子编号无效' });
  db.query('SELECT liked_user_ids FROM community_posts WHERE id = ?', [id], (err, results) => {
    if (err) return res.status(500).json({ error: '暂时无法操作' });
    if (results.length === 0) return res.status(404).json({ error: '帖子不存在' });
    let likedUsers = [];
    const parsed = parseDbJson(results[0].liked_user_ids, []);
    if (Array.isArray(parsed)) likedUsers = parsed.map(Number).filter(Number.isInteger);
    const userId = req.user.id;
    likedUsers = likedUsers.includes(userId) ? likedUsers.filter(item => item !== userId) : [...likedUsers, userId];
    db.query('UPDATE community_posts SET likes = ?, liked_user_ids = ? WHERE id = ?',
      [likedUsers.length, JSON.stringify(likedUsers), id],
      updateErr => {
        if (updateErr) return res.status(500).json({ error: '暂时无法操作' });
        const isLiked = likedUsers.includes(userId);
        res.json({ success: true, message: isLiked ? '点赞成功' : '取消点赞成功', likes: likedUsers.length, isLiked });
      }
    );
  });
});

router.get('/posts/:id/comments', auth, (req, res) => {
  const id = positiveInt(req.params.id, 0, Number.MAX_SAFE_INTEGER);
  if (!id) return res.status(400).json({ error: '帖子编号无效' });
  db.query("SELECT * FROM community_comments WHERE post_id = ? AND moderation_status = 'visible' ORDER BY created_at ASC", [id], (err, results) => {
    if (err) return res.status(500).json({ error: '评论暂时无法读取' });
    res.json({ success: true, comments: results.map(publicComment) });
  });
});

router.post('/posts/:id/comments', auth, (req, res) => {
  const id = positiveInt(req.params.id, 0, Number.MAX_SAFE_INTEGER);
  const content = cleanText(req.body.content, 500);
  if (!id) return res.status(400).json({ error: '帖子编号无效' });
  if (!content) return res.status(400).json({ error: '评论内容不能为空' });
  db.query('SELECT * FROM community_posts WHERE id = ?', [id], (findErr, posts) => {
    if (findErr) return res.status(500).json({ error: '暂时无法评论' });
    if (!posts.length) return res.status(404).json({ error: '帖子不存在' });
    const urgent = URGENT_PATTERN.test(content);
    db.query('INSERT INTO community_comments (user_id, post_id, content, moderation_status, risk_level) VALUES (?, ?, ?, ?, ?)',
      [req.user.id, id, content, urgent ? 'held' : 'visible', urgent ? 'urgent' : 'none'],
      (err, result) => {
        if (err) return res.status(500).json({ error: '暂时无法评论' });
        if (!urgent) {
          db.query('UPDATE community_posts SET comments_count = comments_count + 1 WHERE id = ?', [id], () => {});
          return res.status(201).json({ success: true, message: '评论成功', comment: { id: result.insertId, post_id: id, content } });
        }
        createReport({ reporterId: req.user.id, targetType: 'comment', targetId: result.insertId, reason: 'crisis', details: '系统安全词触发，仅用于人工复核，不代表诊断', riskLevel: 'urgent' }, (reportErr, caseRef) => {
          if (reportErr) return res.status(500).json({ error: '评论已暂缓公开，但审核工单创建失败，请直接联系紧急服务' });
          res.status(202).json({ success: true, held_for_review: true, comment_id: result.insertId, case_ref: caseRef, safety: crisisResponse });
        });
      }
    );
  });
});

router.post('/reports', auth, (req, res) => {
  const targetType = req.body.target_type === 'comment' ? 'comment' : req.body.target_type === 'post' ? 'post' : '';
  const targetId = positiveInt(req.body.target_id, 0, Number.MAX_SAFE_INTEGER);
  const reason = REPORT_REASONS.has(req.body.reason) ? req.body.reason : '';
  const details = cleanText(req.body.details, 500);
  if (!targetType || !targetId || !reason) return res.status(400).json({ error: '举报对象和原因必须有效' });
  const table = targetType === 'post' ? 'community_posts' : 'community_comments';
  db.query(`SELECT id FROM ${table} WHERE id=?`, [targetId], (findErr, rows) => {
    if (findErr) return res.status(500).json({ error: '暂时无法核验举报对象' });
    if (!rows.length) return res.status(404).json({ error: '举报对象不存在' });
    const riskLevel = reason === 'crisis' ? 'urgent' : 'review';
    createReport({ reporterId: req.user.id, targetType, targetId, reason, details, riskLevel }, (err, caseRef) => err
      ? res.status(500).json({ error: '举报暂时无法提交' })
      : res.status(201).json({ success: true, case_ref: caseRef, status: 'open', safety: reason === 'crisis' ? crisisResponse : undefined })
    );
  });
});

router.get('/reports/mine', auth, (req, res) => {
  db.query('SELECT case_ref, target_type, target_id, reason, risk_level, status, created_at, updated_at FROM community_reports WHERE reporter_user_id=? ORDER BY created_at DESC LIMIT 100', [req.user.id], (err, rows) => err
    ? res.status(500).json({ error: '举报记录暂时无法读取' })
    : res.json({ success: true, reports: rows })
  );
});

router.get('/moderation/reports', auth, requireRole('admin'), (req, res) => {
  const requestedStatus = String(req.query.status || 'open');
  const view = String(req.query.view || '');
  if (view && !['active','history'].includes(view)) return res.status(400).json({ error: '审核视图无效' });
  if (requestedStatus !== 'all' && !REPORT_STATUSES.has(requestedStatus)) return res.status(400).json({ error: '审核状态无效' });
  const page = positiveInt(req.query.page, 1, 100000);
  const limit = positiveInt(req.query.limit, 20, 100);
  const offset = (page - 1) * limit;
  const statuses = view === 'active' ? ['open','reviewing'] : view === 'history' ? ['resolved','dismissed'] : requestedStatus === 'all' ? [] : [requestedStatus];
  const where = statuses.length ? ` WHERE status IN (${statuses.map(() => '?').join(',')})` : '';
  const params = [...statuses, limit, offset];
  db.query(`SELECT case_ref,target_type,target_id,reason,details,risk_level,status,moderator_user_id,resolution_note,created_at,updated_at FROM community_reports${where} ORDER BY FIELD(risk_level,'urgent','review'),created_at DESC LIMIT ? OFFSET ?`, params, (err, rows) => {
    if (err) return res.status(500).json({ error: '审核队列暂时无法读取' });
    db.query(`SELECT COUNT(*) total FROM community_reports${where}`, statuses, (countErr, totals) => countErr
      ? res.status(500).json({ error: '审核队列暂时无法读取' })
      : res.json({ success: true, reports: rows, total: Number(totals[0]?.total || 0), page, limit }));
  });
});

router.patch('/moderation/reports/:caseRef', auth, requireRole('admin'), (req, res) => {
  const caseRef = cleanText(req.params.caseRef, 36);
  const status = REPORT_STATUSES.has(req.body.status) ? req.body.status : '';
  const note = cleanText(req.body.resolution_note, 500);
  if (!/^[0-9a-f-]{36}$/i.test(caseRef) || !status) return res.status(400).json({ error: '工单编号或状态无效' });
  db.query('UPDATE community_reports SET status=?, moderator_user_id=?, resolution_note=? WHERE case_ref=?', [status, req.user.id, note || null, caseRef], (err, result) => {
    if (err) return res.status(500).json({ error: '审核工单暂时无法更新' });
    if (!result.affectedRows) return res.status(404).json({ error: '审核工单不存在' });
    res.json({ success: true, message: '审核工单已更新' });
  });
});

router.get('/categories', auth, (req, res) => {
  res.json({ success: true, categories: [
    { id: 'general', name: '综合讨论', icon: '📢' },
    { id: 'training', name: '训练心得', icon: '📚' },
    { id: 'emotion', name: '情感分享', icon: '❤️' },
    { id: 'resource', name: '资源推荐', icon: '🎁' },
    { id: 'question', name: '问题求助', icon: '❓' }
  ] });
});

module.exports = router;
