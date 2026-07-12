const express = require('express');
const router = express.Router();
const db = require('../config/db');
const auth = require('../middleware/auth');

router.get('/', auth, (req, res) => {
  const { page = 1, limit = 20, type } = req.query;
  const offset = (page - 1) * limit;
  
  let query = 'SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?';
  let params = [req.user.id, parseInt(limit), offset];
  
  if (type) {
    query = 'SELECT * FROM notifications WHERE user_id = ? AND type = ? ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params = [req.user.id, type, parseInt(limit), offset];
  }
  
  db.query(query, params, (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    
    db.query('SELECT COUNT(*) as total FROM notifications WHERE user_id = ?', [req.user.id], (countErr, countResult) => {
      if (countErr) return res.status(500).json({ error: countErr.message });
      
      db.query('SELECT COUNT(*) as unread FROM notifications WHERE user_id = ? AND is_read = FALSE', [req.user.id], (unreadErr, unreadResult) => {
        if (unreadErr) return res.status(500).json({ error: unreadErr.message });
        
        res.json({
          success: true,
          notifications: results,
          pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            total: countResult[0].total
          },
          unread_count: unreadResult[0].unread
        });
      });
    });
  });
});

router.put('/read', auth, (req, res) => {
  const { ids } = req.body;
  
  if (ids && ids.length > 0) {
    db.query('UPDATE notifications SET is_read = TRUE WHERE user_id = ? AND id IN (?)',
      [req.user.id, ids],
      (err, result) => {
        if (err) return res.status(500).json({ error: err.message });
        
        res.json({
          success: true,
          message: `已标记 ${result.affectedRows} 条消息为已读`
        });
      }
    );
  } else {
    db.query('UPDATE notifications SET is_read = TRUE WHERE user_id = ?', [req.user.id], (err, result) => {
      if (err) return res.status(500).json({ error: err.message });
      
      res.json({
        success: true,
        message: `已标记全部 ${result.affectedRows} 条消息为已读`
      });
    });
  }
});

router.put('/:id/read', auth, (req, res) => {
  const { id } = req.params;
  
  db.query('UPDATE notifications SET is_read = TRUE WHERE id = ? AND user_id = ?', [id, req.user.id], (err, result) => {
    if (err) return res.status(500).json({ error: err.message });
    
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: '通知不存在' });
    }
    
    res.json({
      success: true,
      message: '已标记为已读'
    });
  });
});

router.delete('/:id', auth, (req, res) => {
  const { id } = req.params;
  
  db.query('DELETE FROM notifications WHERE id = ? AND user_id = ?', [id, req.user.id], (err, result) => {
    if (err) return res.status(500).json({ error: err.message });
    
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: '通知不存在' });
    }
    
    res.json({
      success: true,
      message: '删除成功'
    });
  });
});

router.get('/unread-count', auth, (req, res) => {
  db.query('SELECT COUNT(*) as unread FROM notifications WHERE user_id = ? AND is_read = FALSE', [req.user.id], (err, result) => {
    if (err) return res.status(500).json({ error: err.message });
    
    res.json({
      success: true,
      unread_count: result[0].unread
    });
  });
});

router.post('/send', auth, (req, res) => {
  const { user_id, title, content, type } = req.body;
  
  if (!user_id || !title || !content) {
    return res.status(400).json({ error: '用户ID、标题和内容不能为空' });
  }
  
  db.query('INSERT INTO notifications (user_id, title, content, type) VALUES (?, ?, ?, ?)',
    [user_id, title, content, type || 'system'],
    (err, result) => {
      if (err) return res.status(500).json({ error: err.message });
      
      res.json({
        success: true,
        message: '通知发送成功',
        notification: { id: result.insertId }
      });
    }
  );
});

module.exports = router;