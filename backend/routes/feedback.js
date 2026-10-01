const express = require('express');
const router = express.Router();
const db = require('../config/db');
const auth = require('../middleware/auth');

const TYPES = new Set(['bug', 'feature', 'content', 'experience', 'other']);

router.post('/', auth, (req, res) => {
  const type = String(req.body?.type || 'other').trim();
  const content = String(req.body?.content || '').trim();
  if (!TYPES.has(type)) return res.status(400).json({ error: '反馈类型无效' });
  if (content.length < 2 || content.length > 2000) return res.status(400).json({ error: '反馈内容需为2—2000字' });

  db.query(
    'INSERT INTO product_feedback (user_id, type, content, status) VALUES (?, ?, ?, ?)',
    [req.user.id, type, content, 'open'],
    (err, result) => {
      if (err) return res.status(500).json({ error: '反馈暂时无法保存' });
      res.status(201).json({ success: true, feedback: { id: result.insertId, type, status: 'open' } });
    }
  );
});

router.get('/mine', auth, (req, res) => {
  db.query('SELECT id, type, content, status, created_at FROM product_feedback WHERE user_id = ? ORDER BY created_at DESC LIMIT 100', [req.user.id], (err, rows) => {
    if (err) return res.status(500).json({ error: '反馈记录暂时无法读取' });
    res.json({ success: true, feedback: rows });
  });
});

module.exports = router;
