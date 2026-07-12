const express = require('express');
const router = express.Router();
const db = require('../config/db');
const auth = require('../middleware/auth');

router.get('/library', auth, (req, res) => {
  const { category } = req.query;
  
  let query = 'SELECT * FROM story_library ORDER BY created_at DESC';
  let params = [];
  
  if (category) {
    query = 'SELECT * FROM story_library WHERE category = ? ORDER BY created_at DESC';
    params = [category];
  }
  
  db.query(query, params, (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    
    res.json({
      success: true,
      stories: results
    });
  });
});

router.get('/library/:id', auth, (req, res) => {
  const { id } = req.params;
  
  db.query('SELECT * FROM story_library WHERE id = ?',
    [id],
    (err, results) => {
      if (err) return res.status(500).json({ error: err.message });
      
      res.json({
        success: true,
        story: results[0] || null
      });
    }
  );
});

router.post('/custom', auth, (req, res) => {
  const { title, content, category, child_id } = req.body;
  
  if (!title || !content) {
    return res.status(400).json({ error: '标题和内容不能为空' });
  }
  
  db.query('INSERT INTO custom_stories (user_id, child_id, title, content, category) VALUES (?, ?, ?, ?, ?)',
    [req.user.id, child_id || 0, title, content, category || '自定义'],
    (err, result) => {
      if (err) return res.status(500).json({ error: err.message });
      
      res.json({
        success: true,
        message: '自定义故事创建成功',
        story: { id: result.insertId, title, content, category }
      });
    }
  );
});

router.get('/custom', auth, (req, res) => {
  db.query('SELECT * FROM custom_stories WHERE user_id = ? ORDER BY created_at DESC',
    [req.user.id],
    (err, results) => {
      if (err) return res.status(500).json({ error: err.message });
      
      res.json({
        success: true,
        stories: results
      });
    }
  );
});

router.delete('/custom/:id', auth, (req, res) => {
  const { id } = req.params;
  
  db.query('DELETE FROM custom_stories WHERE id = ? AND user_id = ?',
    [id, req.user.id],
    (err, result) => {
      if (err) return res.status(500).json({ error: err.message });
      
      if (result.affectedRows === 0) {
        return res.status(400).json({ error: '故事不存在' });
      }
      
      res.json({
        success: true,
        message: '故事删除成功'
      });
    }
  );
});

router.post('/play', auth, (req, res) => {
  const { story_id, story_type, child_id } = req.body;
  
  db.query('INSERT INTO story_play_records (user_id, child_id, story_id, story_type) VALUES (?, ?, ?, ?)',
    [req.user.id, child_id || 0, story_id, story_type || 'library'],
    (err, result) => {
      if (err) return res.status(500).json({ error: err.message });
      
      res.json({
        success: true,
        message: '故事播放记录成功',
        record: { id: result.insertId, story_id, story_type }
      });
    }
  );
});

router.post('/feedback', auth, (req, res) => {
  const { story_id, rating, feedback } = req.body;
  
  if (!story_id || !rating) {
    return res.status(400).json({ error: '故事ID和评分不能为空' });
  }
  
  db.query('INSERT INTO story_feedback (user_id, story_id, rating, feedback) VALUES (?, ?, ?, ?)',
    [req.user.id, story_id, rating, feedback || ''],
    (err, result) => {
      if (err) return res.status(500).json({ error: err.message });
      
      res.json({
        success: true,
        message: '反馈提交成功',
        feedback: { id: result.insertId, rating, feedback }
      });
    }
  );
});

module.exports = router;