const express = require('express');
const router = express.Router();
const db = require('../config/db');
const auth = require('../middleware/auth');

const TYPES = new Set(['comment', 'like', 'system', 'training', 'safety']);
const positiveId = value => Number.isInteger(Number(value)) && Number(value) > 0;
const clean = (value, max) => String(value ?? '').trim().slice(0, max);

router.get('/', auth, (req, res) => {
  const page = Math.max(1, Math.min(10000, Number.parseInt(req.query.page, 10) || 1));
  const limit = Math.max(1, Math.min(50, Number.parseInt(req.query.limit, 10) || 20));
  const type = req.query.type && TYPES.has(req.query.type) ? req.query.type : null;
  const offset = (page - 1) * limit;
  const query = type
    ? 'SELECT id, title, content, type, is_read, created_at FROM notifications WHERE user_id = ? AND type = ? ORDER BY created_at DESC LIMIT ? OFFSET ?'
    : 'SELECT id, title, content, type, is_read, created_at FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?';
  const params = type ? [req.user.id, type, limit, offset] : [req.user.id, limit, offset];
  db.query(query, params, (err, results) => {
    if (err) return res.status(500).json({ error: '通知读取失败' });
    db.query('SELECT COUNT(*) total, SUM(CASE WHEN is_read = FALSE THEN 1 ELSE 0 END) unread FROM notifications WHERE user_id = ?', [req.user.id], (countErr, rows) => {
      if (countErr) return res.status(500).json({ error: '通知统计失败' });
      res.json({ success: true, notifications: results, pagination: { page, limit, total: Number(rows[0]?.total || 0) }, unread_count: Number(rows[0]?.unread || 0) });
    });
  });
});

router.put('/read', auth, (req, res) => {
  const ids = Array.isArray(req.body.ids) ? [...new Set(req.body.ids.map(Number).filter(id => Number.isInteger(id) && id > 0))].slice(0, 100) : [];
  const query = ids.length ? 'UPDATE notifications SET is_read = TRUE WHERE user_id = ? AND id IN (?)' : 'UPDATE notifications SET is_read = TRUE WHERE user_id = ?';
  const params = ids.length ? [req.user.id, ids] : [req.user.id];
  db.query(query, params, (err, result) => {
    if (err) return res.status(500).json({ error: '通知更新失败' });
    res.json({ success: true, updated: Number(result.affectedRows || 0) });
  });
});

router.put('/:id/read', auth, (req, res) => {
  if (!positiveId(req.params.id)) return res.status(400).json({ error: '通知编号无效' });
  db.query('UPDATE notifications SET is_read = TRUE WHERE id = ? AND user_id = ?', [Number(req.params.id), req.user.id], (err, result) => {
    if (err) return res.status(500).json({ error: '通知更新失败' });
    if (!result.affectedRows) return res.status(404).json({ error: '通知不存在' });
    res.json({ success: true });
  });
});

router.delete('/:id', auth, (req, res) => {
  if (!positiveId(req.params.id)) return res.status(400).json({ error: '通知编号无效' });
  db.query('DELETE FROM notifications WHERE id = ? AND user_id = ?', [Number(req.params.id), req.user.id], (err, result) => {
    if (err) return res.status(500).json({ error: '通知删除失败' });
    if (!result.affectedRows) return res.status(404).json({ error: '通知不存在' });
    res.json({ success: true });
  });
});

router.get('/unread-count', auth, (req, res) => {
  db.query('SELECT COUNT(*) unread FROM notifications WHERE user_id = ? AND is_read = FALSE', [req.user.id], (err, rows) => {
    if (err) return res.status(500).json({ error: '通知统计失败' });
    res.json({ success: true, unread_count: Number(rows[0]?.unread || 0) });
  });
});

// 体验版只允许当前用户为自己创建普通提醒；跨用户和安全通知必须由受信任服务端任务发送。
router.post('/send', auth, (req, res) => {
  const title = clean(req.body.title, 80);
  const content = clean(req.body.content, 500);
  const type = TYPES.has(req.body.type) && req.body.type !== 'safety' ? req.body.type : 'system';
  if (!title || !content) return res.status(400).json({ error: '标题和内容不能为空' });
  db.query('INSERT INTO notifications (user_id, title, content, type) VALUES (?, ?, ?, ?)', [req.user.id, title, content, type], (err, result) => {
    if (err) return res.status(500).json({ error: '通知创建失败' });
    res.status(201).json({ success: true, notification: { id: result.insertId } });
  });
});

module.exports = router;