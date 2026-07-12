const express = require('express');
const router = express.Router();
const db = require('../config/db');
const auth = require('../middleware/auth');

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