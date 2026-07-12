const express = require('express');
const router = express.Router();
const db = require('../config/db');
const auth = require('../middleware/auth');

router.post('/register', (req, res) => {
  const { name, phone, email, professional_title, specialty, years_of_experience } = req.body;
  
  if (!name || !phone) {
    return res.status(400).json({ error: '请填写必填信息（姓名、手机号）' });
  }
  
  db.query('SELECT * FROM therapists WHERE phone = ?', [phone], (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    
    if (results.length > 0) {
      return res.status(400).json({ error: '该手机号已注册' });
    }
    
    db.query(
      'INSERT INTO therapists (name, phone, email, professional_title, specialty, years_of_experience) VALUES (?, ?, ?, ?, ?, ?)',
      [name, phone, email || null, professional_title || null, specialty || null, years_of_experience || 0],
      (err, result) => {
        if (err) return res.status(500).json({ error: err.message });
        
        res.status(201).json({
          success: true,
          message: '康复师注册成功',
          therapist: { id: result.insertId, name, phone }
        });
      }
    );
  });
});

router.get('/', (req, res) => {
  const { page = 1, limit = 20, specialty, certified } = req.query;
  const offset = (page - 1) * limit;
  
  let query = 'SELECT * FROM therapists WHERE 1=1';
  const params = [];
  
  if (specialty) {
    query += ' AND specialty LIKE ?';
    params.push(`%${specialty}%`);
  }
  
  if (certified === 'true') {
    query += ' AND is_certified = 1';
  }
  
  query += ' ORDER BY professional_score DESC, rating DESC LIMIT ? OFFSET ?';
  params.push(parseInt(limit), offset);
  
  db.query(query, params, (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    
    db.query('SELECT COUNT(*) as total FROM therapists WHERE 1=1' + 
      (specialty ? ' AND specialty LIKE ?' : '') + 
      (certified === 'true' ? ' AND is_certified = 1' : ''),
      specialty ? [`%${specialty}%`] : [], (err, countResults) => {
      if (err) return res.status(500).json({ error: err.message });
      
      res.json({
        success: true,
        therapists: results,
        total: countResults[0].total,
        page: parseInt(page),
        limit: parseInt(limit)
      });
    });
  });
});

router.get('/:id', (req, res) => {
  db.query('SELECT * FROM therapists WHERE id = ?', [req.params.id], (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    
    if (results.length === 0) {
      return res.status(404).json({ error: '康复师不存在' });
    }
    
    res.json({ success: true, therapist: results[0] });
  });
});

router.put('/:id', auth, (req, res) => {
  const { name, email, professional_title, specialty, years_of_experience, profile_photo } = req.body;
  
  db.query(
    'UPDATE therapists SET name = ?, email = ?, professional_title = ?, specialty = ?, years_of_experience = ?, profile_photo = ? WHERE id = ?',
    [name, email, professional_title, specialty, years_of_experience, profile_photo, req.params.id],
    (err) => {
      if (err) return res.status(500).json({ error: err.message });
      
      res.json({ success: true, message: '康复师信息更新成功' });
    }
  );
});

router.get('/:id/reports', (req, res) => {
  const { page = 1, limit = 20 } = req.query;
  const offset = (page - 1) * limit;
  
  db.query(`
    SELECT r.id, r.week_start, r.week_end, r.generated_at, c.nickname as child_name
    FROM weekly_reports r
    JOIN children c ON r.child_id = c.id
    WHERE r.share_expires_at > NOW()
    ORDER BY r.generated_at DESC LIMIT ? OFFSET ?
  `, [parseInt(limit), offset], (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    
    db.query('SELECT COUNT(*) as total FROM weekly_reports WHERE share_expires_at > NOW()', [], (err, countResults) => {
      if (err) return res.status(500).json({ error: err.message });
      
      res.json({
        success: true,
        reports: results,
        total: countResults[0].total,
        page: parseInt(page),
        limit: parseInt(limit)
      });
    });
  });
});

router.get('/:id/ranking', (req, res) => {
  db.query(`
    SELECT id, name, professional_score, rating, review_count, is_certified
    FROM therapists
    ORDER BY professional_score DESC
  `, [], (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    
    const rank = results.findIndex(t => t.id === parseInt(req.params.id)) + 1;
    
    res.json({
      success: true,
      rank,
      total: results.length,
      therapist: results.find(t => t.id === parseInt(req.params.id)),
      top_3: results.slice(0, 3)
    });
  });
});

router.post('/:id/rate', auth, (req, res) => {
  const { rating, comment } = req.body;
  
  if (!rating || rating < 1 || rating > 5) {
    return res.status(400).json({ error: '请输入有效的评分（1-5分）' });
  }
  
  db.query('SELECT * FROM therapists WHERE id = ?', [req.params.id], (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    
    if (results.length === 0) {
      return res.status(404).json({ error: '康复师不存在' });
    }
    
    const therapist = results[0];
    const newReviewCount = therapist.review_count + 1;
    const newRating = ((therapist.rating * therapist.review_count) + rating) / newReviewCount;
    
    db.query('UPDATE therapists SET rating = ?, review_count = ? WHERE id = ?', 
      [newRating, newReviewCount, req.params.id], (err) => {
      if (err) return res.status(500).json({ error: err.message });
      
      res.json({ success: true, message: '评分成功', rating: newRating });
    });
  });
});

module.exports = router;
