const express = require('express');
const router = express.Router();
const db = require('../config/db');
const auth = require('../middleware/auth');

router.post('/profile', auth, (req, res) => {
  const { child_id, emergency_contact, medical_info, allergies, special_notes } = req.body;
  
  if (!child_id) {
    return res.status(400).json({ error: '儿童ID不能为空' });
  }
  
  db.query('INSERT INTO safety_profiles (user_id, child_id, emergency_contact, medical_info, allergies, special_notes) VALUES (?, ?, ?, ?, ?, ?)',
    [req.user.id, child_id, emergency_contact || '', medical_info || '', allergies || '', special_notes || ''],
    (err, result) => {
      if (err) return res.status(500).json({ error: err.message });
      
      res.json({
        success: true,
        message: '安全档案创建成功',
        profile: { id: result.insertId, child_id, emergency_contact, medical_info, allergies, special_notes }
      });
    }
  );
});

router.get('/profile/:childId', auth, (req, res) => {
  const { childId } = req.params;
  
  db.query('SELECT * FROM safety_profiles WHERE user_id = ? AND child_id = ?',
    [req.user.id, childId],
    (err, results) => {
      if (err) return res.status(500).json({ error: err.message });
      
      res.json({
        success: true,
        profile: results[0] || null
      });
    }
  );
});

router.put('/profile/:id', auth, (req, res) => {
  const { id } = req.params;
  const { emergency_contact, medical_info, allergies, special_notes } = req.body;
  
  db.query('UPDATE safety_profiles SET emergency_contact = ?, medical_info = ?, allergies = ?, special_notes = ? WHERE id = ? AND user_id = ?',
    [emergency_contact, medical_info, allergies, special_notes, id, req.user.id],
    (err, result) => {
      if (err) return res.status(500).json({ error: err.message });
      
      if (result.affectedRows === 0) {
        return res.status(400).json({ error: '安全档案不存在' });
      }
      
      res.json({
        success: true,
        message: '安全档案更新成功'
      });
    }
  );
});

router.get('/skills', auth, (req, res) => {
  db.query('SELECT * FROM safety_skills ORDER BY difficulty',
    [],
    (err, results) => {
      if (err) return res.status(500).json({ error: err.message });
      
      res.json({
        success: true,
        skills: results
      });
    }
  );
});

router.get('/skills/:id', auth, (req, res) => {
  const { id } = req.params;
  
  db.query('SELECT * FROM safety_skills WHERE id = ?',
    [id],
    (err, results) => {
      if (err) return res.status(500).json({ error: err.message });
      
      res.json({
        success: true,
        skill: results[0] || null
      });
    }
  );
});

router.post('/skills/:id/practice', auth, (req, res) => {
  const { id } = req.params;
  const { child_id, completed } = req.body;
  
  db.query('INSERT INTO safety_practice_records (user_id, child_id, skill_id, completed) VALUES (?, ?, ?, ?)',
    [req.user.id, child_id || 0, id, completed || false],
    (err, result) => {
      if (err) return res.status(500).json({ error: err.message });
      
      res.json({
        success: true,
        message: completed ? '技能练习完成' : '技能练习记录成功',
        record: { id: result.insertId, skill_id: id, completed }
      });
    }
  );
});

router.get('/practice/:childId', auth, (req, res) => {
  const { childId } = req.params;
  
  db.query('SELECT spr.*, ss.name, ss.description FROM safety_practice_records spr JOIN safety_skills ss ON spr.skill_id = ss.id WHERE spr.user_id = ? AND spr.child_id = ? ORDER BY spr.created_at DESC',
    [req.user.id, childId],
    (err, results) => {
      if (err) return res.status(500).json({ error: err.message });
      
      res.json({
        success: true,
        records: results
      });
    }
  );
});

module.exports = router;