const express = require('express');
const router = express.Router();
const db = require('../config/db');
const auth = require('../middleware/auth');

const CATEGORIES = new Set(['general', 'training', 'emotion', 'resource', 'question']);
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

router.get('/posts', auth, (req, res) => {
  const page = positiveInt(req.query.page, 1, 100000);
  const limit = positiveInt(req.query.limit, 10, 50);
  const offset = (page - 1) * limit;
  const category = CATEGORIES.has(req.query.category) ? req.query.category : null;
  const query = category
    ? 'SELECT * FROM community_posts WHERE category = ? ORDER BY created_at DESC LIMIT ? OFFSET ?'
    : 'SELECT * FROM community_posts ORDER BY created_at DESC LIMIT ? OFFSET ?';
  const params = category ? [category, limit, offset] : [limit, offset];

  db.query(query, params, (err, results) => {
    if (err) return res.status(500).json({ error: '社区内容暂时无法读取' });
    db.query('SELECT COUNT(*) as total FROM community_posts', (countErr, countResult) => {
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
  db.query('INSERT INTO community_posts (user_id, title, content, category) VALUES (?, ?, ?, ?)',
    [req.user.id, title, content, category],
    (err, result) => {
      if (err) return res.status(500).json({ error: '帖子暂时无法发布' });
      res.json({ success: true, message: '发帖成功', post: { id: result.insertId, title, content, category } });
    }
  );
});

router.get('/posts/:id', auth, (req, res) => {
  const id = positiveInt(req.params.id, 0, Number.MAX_SAFE_INTEGER);
  if (!id) return res.status(400).json({ error: '帖子编号无效' });
  db.query('SELECT * FROM community_posts WHERE id = ?', [id], (err, results) => {
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
    try {
      const parsed = JSON.parse(results[0].liked_user_ids || '[]');
      if (Array.isArray(parsed)) likedUsers = parsed.filter(Number.isInteger);
    } catch (_) {}
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
  db.query('SELECT * FROM community_comments WHERE post_id = ? ORDER BY created_at ASC', [id], (err, results) => {
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
    db.query('INSERT INTO community_comments (user_id, post_id, content) VALUES (?, ?, ?)',
      [req.user.id, id, content],
      (err, result) => {
        if (err) return res.status(500).json({ error: '暂时无法评论' });
        db.query('UPDATE community_posts SET comments_count = comments_count + 1 WHERE id = ?', [id], () => {});
        res.json({ success: true, message: '评论成功', comment: { id: result.insertId, post_id: id, content } });
      }
    );
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