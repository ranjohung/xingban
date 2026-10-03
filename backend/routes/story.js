const express = require('express');
const router = express.Router();
const db = require('../config/db');
const auth = require('../middleware/auth');

const CATEGORIES = new Set(['emotion', 'social', 'daily', 'safety']);
const clean = (value, max) => typeof value === 'string' ? value.trim().slice(0, max) : '';
const positiveId = value => {
  const id = Number.parseInt(value, 10);
  return Number.isInteger(id) && id > 0 ? id : 0;
};
const requestId = value => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || '').trim()) ? String(value).trim() : '';
const publicStory = story => ({
  id: story.id,
  title: story.title,
  content: story.content,
  category: story.category,
  cover_image: story.cover_image,
  play_count: Number(story.play_count || 0),
  created_at: story.created_at
});

router.get('/library', auth, (req, res) => {
  const category = CATEGORIES.has(req.query.category) ? req.query.category : null;
  const query = category ? 'SELECT * FROM story_library WHERE category = ? ORDER BY created_at DESC' : 'SELECT * FROM story_library ORDER BY created_at DESC';
  db.query(query, category ? [category] : [], (err, results) => {
    if (err) return res.status(500).json({ error: '故事库暂时无法读取' });
    res.json({ success: true, stories: results.map(publicStory) });
  });
});

router.get('/library/:id', auth, (req, res) => {
  const id = positiveId(req.params.id);
  if (!id) return res.status(400).json({ error: '故事编号无效' });
  db.query('SELECT * FROM story_library WHERE id = ?', [id], (err, results) => {
    if (err) return res.status(500).json({ error: '故事暂时无法读取' });
    if (!results.length) return res.status(404).json({ error: '故事不存在' });
    res.json({ success: true, story: publicStory(results[0]) });
  });
});

router.post('/custom', auth, (req, res) => {
  const title = clean(req.body.title, 80);
  const content = clean(req.body.content, 3000);
  const category = CATEGORIES.has(req.body.category) ? req.body.category : 'daily';
  const childId = positiveId(req.body.child_id);
  const clientRequestId = requestId(req.body.client_request_id);
  if (!title || !content || !childId || !clientRequestId) return res.status(400).json({ error: '请选择儿童档案并填写标题和内容' });
  const replay = () => db.query('SELECT id,child_id,title,content,category,created_at FROM custom_stories WHERE user_id=? AND client_request_id=?', [req.user.id, clientRequestId], (readErr, rows) => readErr || !rows.length ? res.status(500).json({ error: '故事保存状态暂时无法确认，请保留页面后重试' }) : res.json({ success: true, replayed: true, story: rows[0] }));
  const save = () => db.query('INSERT INTO custom_stories (user_id, child_id, client_request_id, title, content, category) VALUES (?, ?, ?, ?, ?, ?)',
    [req.user.id, childId, clientRequestId, title, content, category],
    (err, result) => err?.code === 'ER_DUP_ENTRY' ? replay() : err ? res.status(500).json({ error: '故事暂时无法创建' }) : res.status(201).json({ success: true, message: '自定义故事创建成功', story: { id: result.insertId, child_id: childId, title, content, category } })
  );
  db.query('SELECT id FROM children WHERE id = ? AND user_id = ?', [childId, req.user.id], (err, rows) => {
    if (err) return res.status(500).json({ error: '暂时无法核验儿童档案' });
    if (!rows.length) return res.status(404).json({ error: '儿童档案不存在' });
    db.query('SELECT id FROM custom_stories WHERE user_id=? AND client_request_id=?', [req.user.id, clientRequestId], (readErr, existing) => readErr ? res.status(500).json({ error: '故事保存状态暂时无法确认' }) : existing.length ? replay() : save());
  });
});

router.get('/custom', auth, (req, res) => {
  db.query('SELECT * FROM custom_stories WHERE user_id = ? ORDER BY created_at DESC', [req.user.id], (err, results) => {
    if (err) return res.status(500).json({ error: '自定义故事暂时无法读取' });
    res.json({ success: true, stories: results.map(publicStory) });
  });
});

router.delete('/custom/:id', auth, (req, res) => {
  const id = positiveId(req.params.id);
  if (!id) return res.status(400).json({ error: '故事编号无效' });
  db.query('DELETE FROM custom_stories WHERE id = ? AND user_id = ?', [id, req.user.id], (err, result) => {
    if (err) return res.status(500).json({ error: '故事暂时无法删除' });
    if (result.affectedRows === 0) return res.status(404).json({ error: '故事不存在' });
    res.json({ success: true, message: '故事删除成功' });
  });
});

router.post('/play', auth, (req, res) => {
  const storyId = positiveId(req.body.story_id);
  const childId = positiveId(req.body.child_id);
  const storyType = req.body.story_type === 'custom' ? 'custom' : 'library';
  if (!storyId) return res.status(400).json({ error: '故事编号无效' });
  db.query('INSERT INTO story_play_records (user_id, child_id, story_id, story_type) VALUES (?, ?, ?, ?)',
    [req.user.id, childId || null, storyId, storyType],
    (err, result) => err ? res.status(500).json({ error: '播放记录暂时无法保存' }) : res.json({ success: true, message: '故事播放记录成功', record: { id: result.insertId, story_id: storyId, story_type: storyType } })
  );
});

router.post('/feedback', auth, (req, res) => {
  const storyId = positiveId(req.body.story_id);
  const rating = Number.parseInt(req.body.rating, 10);
  const feedback = clean(req.body.feedback, 500);
  if (!storyId || !Number.isInteger(rating) || rating < 1 || rating > 5) return res.status(400).json({ error: '故事编号或评分无效' });
  db.query('INSERT INTO story_feedback (user_id, story_id, rating, feedback) VALUES (?, ?, ?, ?)',
    [req.user.id, storyId, rating, feedback],
    (err, result) => err ? res.status(500).json({ error: '反馈暂时无法提交' }) : res.json({ success: true, message: '反馈提交成功', feedback: { id: result.insertId, rating, feedback } })
  );
});

module.exports = router;
