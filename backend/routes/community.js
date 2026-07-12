const express = require('express');
const router = express.Router();
const db = require('../config/db');
const auth = require('../middleware/auth');

router.get('/posts', auth, (req, res) => {
  const { page = 1, limit = 10, category } = req.query;
  const offset = (page - 1) * limit;
  
  let query = 'SELECT * FROM community_posts ORDER BY created_at DESC LIMIT ? OFFSET ?';
  let params = [parseInt(limit), offset];
  
  if (category) {
    query = 'SELECT * FROM community_posts WHERE category = ? ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params = [category, parseInt(limit), offset];
  }
  
  db.query(query, params, (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    
    db.query('SELECT COUNT(*) as total FROM community_posts', (countErr, countResult) => {
      if (countErr) return res.status(500).json({ error: countErr.message });
      
      res.json({
        success: true,
        posts: results,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: countResult[0].total
        }
      });
    });
  });
});

router.post('/posts', auth, (req, res) => {
  const { title, content, category } = req.body;
  
  if (!title || !content) {
    return res.status(400).json({ error: '标题和内容不能为空' });
  }
  
  db.query('INSERT INTO community_posts (user_id, title, content, category) VALUES (?, ?, ?, ?)',
    [req.user.id, title, content, category || 'general'],
    (err, result) => {
      if (err) return res.status(500).json({ error: err.message });
      
      res.json({
        success: true,
        message: '发帖成功',
        post: { id: result.insertId, title, content, category }
      });
    }
  );
});

router.get('/posts/:id', auth, (req, res) => {
  const { id } = req.params;
  
  db.query('SELECT * FROM community_posts WHERE id = ?', [id], (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    
    if (results.length === 0) {
      return res.status(404).json({ error: '帖子不存在' });
    }
    
    res.json({
      success: true,
      post: results[0]
    });
  });
});

router.post('/posts/:id/like', auth, (req, res) => {
  const { id } = req.params;
  
  db.query('SELECT liked_user_ids FROM community_posts WHERE id = ?', [id], (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    
    if (results.length === 0) {
      return res.status(404).json({ error: '帖子不存在' });
    }
    
    const post = results[0];
    let likedUsers = post.liked_user_ids ? JSON.parse(post.liked_user_ids) : [];
    const userId = req.user.id;
    
    if (likedUsers.includes(userId)) {
      likedUsers = likedUsers.filter(id => id !== userId);
    } else {
      likedUsers.push(userId);
    }
    
    const newLikesCount = likedUsers.length;
    
    db.query('UPDATE community_posts SET likes = ?, liked_user_ids = ? WHERE id = ?',
      [newLikesCount, JSON.stringify(likedUsers), id],
      (updateErr) => {
        if (updateErr) return res.status(500).json({ error: updateErr.message });
        
        res.json({
          success: true,
          message: likedUsers.includes(userId) ? '点赞成功' : '取消点赞成功',
          likes: newLikesCount,
          isLiked: likedUsers.includes(userId)
        });
      }
    );
  });
});

router.get('/posts/:id/comments', auth, (req, res) => {
  const { id } = req.params;
  
  db.query('SELECT * FROM community_comments WHERE post_id = ? ORDER BY created_at ASC', [id], (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    
    res.json({
      success: true,
      comments: results
    });
  });
});

router.post('/posts/:id/comments', auth, (req, res) => {
  const { id } = req.params;
  const { content } = req.body;
  
  if (!content) {
    return res.status(400).json({ error: '评论内容不能为空' });
  }
  
  db.query('INSERT INTO community_comments (user_id, post_id, content) VALUES (?, ?, ?)',
    [req.user.id, id, content],
    (err, result) => {
      if (err) return res.status(500).json({ error: err.message });
      
      db.query('UPDATE community_posts SET comments_count = comments_count + 1 WHERE id = ?', [id], () => {});
      
      res.json({
        success: true,
        message: '评论成功',
        comment: { id: result.insertId, content }
      });
    }
  );
});

router.get('/categories', auth, (req, res) => {
  const categories = [
    { id: 'general', name: '综合讨论', icon: '📢' },
    { id: 'training', name: '训练心得', icon: '📚' },
    { id: 'emotion', name: '情感分享', icon: '❤️' },
    { id: 'resource', name: '资源推荐', icon: '🎁' },
    { id: 'question', name: '问题求助', icon: '❓' }
  ];
  
  res.json({
    success: true,
    categories
  });
});

module.exports = router;