const express = require('express');
const router = express.Router();
const db = require('../config/db');
const auth = require('../middleware/auth');

const positiveId = value => {
  const id = Number.parseInt(value, 10);
  return Number.isInteger(id) && id > 0 ? id : 0;
};
const clean = (value, max) => typeof value === 'string' ? value.trim().slice(0, max) : '';
const verifyChild = (userId, childId, callback) => {
  db.query('SELECT id FROM children WHERE id = ? AND user_id = ?', [childId, userId], (err, rows) => callback(err, Boolean(rows?.length)));
};

router.post('/profile', auth, (req, res) => {
  const childId = positiveId(req.body.child_id);
  if (!childId) return res.status(400).json({ error: '儿童编号无效' });
  const profile = {
    emergency_contact: clean(req.body.emergency_contact, 300),
    medical_info: clean(req.body.medical_info, 1000),
    allergies: clean(req.body.allergies, 500),
    special_notes: clean(req.body.special_notes, 1000)
  };
  verifyChild(req.user.id, childId, (verifyErr, owned) => {
    if (verifyErr) return res.status(500).json({ error: '暂时无法核验儿童档案' });
    if (!owned) return res.status(404).json({ error: '儿童档案不存在' });
    db.query('INSERT INTO safety_profiles (user_id, child_id, emergency_contact, medical_info, allergies, special_notes) VALUES (?, ?, ?, ?, ?, ?)',
      [req.user.id, childId, profile.emergency_contact, profile.medical_info, profile.allergies, profile.special_notes],
      (err, result) => err ? res.status(500).json({ error: '安全档案暂时无法保存' }) : res.json({ success: true, message: '安全档案创建成功', profile: { id: result.insertId, child_id: childId, ...profile } })
    );
  });
});

router.get('/profile/:childId', auth, (req, res) => {
  const childId = positiveId(req.params.childId);
  if (!childId) return res.status(400).json({ error: '儿童编号无效' });
  verifyChild(req.user.id, childId, (verifyErr, owned) => {
    if (verifyErr) return res.status(500).json({ error: '暂时无法核验儿童档案' });
    if (!owned) return res.status(404).json({ error: '儿童档案不存在' });
    db.query('SELECT * FROM safety_profiles WHERE user_id = ? AND child_id = ?', [req.user.id, childId], (err, results) => {
      if (err) return res.status(500).json({ error: '安全档案暂时无法读取' });
      const item = results[0];
      res.json({ success: true, profile: item ? { id: item.id, child_id: item.child_id, emergency_contact: item.emergency_contact, medical_info: item.medical_info, allergies: item.allergies, special_notes: item.special_notes } : null });
    });
  });
});

router.put('/profile/:id', auth, (req, res) => {
  const id = positiveId(req.params.id);
  if (!id) return res.status(400).json({ error: '安全档案编号无效' });
  const fields = [clean(req.body.emergency_contact, 300), clean(req.body.medical_info, 1000), clean(req.body.allergies, 500), clean(req.body.special_notes, 1000)];
  db.query('UPDATE safety_profiles SET emergency_contact = ?, medical_info = ?, allergies = ?, special_notes = ? WHERE id = ? AND user_id = ?',
    [...fields, id, req.user.id],
    (err, result) => {
      if (err) return res.status(500).json({ error: '安全档案暂时无法更新' });
      if (result.affectedRows === 0) return res.status(404).json({ error: '安全档案不存在' });
      res.json({ success: true, message: '安全档案更新成功' });
    }
  );
});

router.get('/skills', auth, (req, res) => {
  db.query('SELECT * FROM safety_skills ORDER BY difficulty', [], (err, results) => {
    if (err) return res.status(500).json({ error: '安全技能暂时无法读取' });
    res.json({ success: true, skills: results.map(item => ({ id: item.id, name: item.name, description: item.description, difficulty: item.difficulty })) });
  });
});

router.get('/skills/:id', auth, (req, res) => {
  const id = positiveId(req.params.id);
  if (!id) return res.status(400).json({ error: '技能编号无效' });
  db.query('SELECT * FROM safety_skills WHERE id = ?', [id], (err, results) => {
    if (err) return res.status(500).json({ error: '安全技能暂时无法读取' });
    if (!results.length) return res.status(404).json({ error: '安全技能不存在' });
    const item = results[0];
    res.json({ success: true, skill: { id: item.id, name: item.name, description: item.description, difficulty: item.difficulty } });
  });
});

router.post('/skills/:id/practice', auth, (req, res) => {
  const skillId = positiveId(req.params.id);
  const childId = positiveId(req.body.child_id);
  if (!skillId || !childId) return res.status(400).json({ error: '儿童或技能编号无效' });
  verifyChild(req.user.id, childId, (verifyErr, owned) => {
    if (verifyErr) return res.status(500).json({ error: '暂时无法核验儿童档案' });
    if (!owned) return res.status(404).json({ error: '儿童档案不存在' });
    db.query('INSERT INTO safety_practice_records (user_id, child_id, skill_id, completed) VALUES (?, ?, ?, ?)',
      [req.user.id, childId, skillId, req.body.completed === true],
      (err, result) => err ? res.status(500).json({ error: '练习记录暂时无法保存' }) : res.json({ success: true, message: '练习记录成功', record: { id: result.insertId, skill_id: skillId, completed: req.body.completed === true } })
    );
  });
});

router.get('/practice/:childId', auth, (req, res) => {
  const childId = positiveId(req.params.childId);
  if (!childId) return res.status(400).json({ error: '儿童编号无效' });
  verifyChild(req.user.id, childId, (verifyErr, owned) => {
    if (verifyErr) return res.status(500).json({ error: '暂时无法核验儿童档案' });
    if (!owned) return res.status(404).json({ error: '儿童档案不存在' });
    db.query('SELECT spr.*, ss.name, ss.description FROM safety_practice_records spr JOIN safety_skills ss ON spr.skill_id = ss.id WHERE spr.user_id = ? AND spr.child_id = ? ORDER BY spr.created_at DESC',
      [req.user.id, childId],
      (err, results) => err ? res.status(500).json({ error: '练习记录暂时无法读取' }) : res.json({ success: true, records: results.map(item => ({ id: item.id, skill_id: item.skill_id, completed: Boolean(item.completed), name: item.name, description: item.description, created_at: item.created_at })) })
    );
  });
});

module.exports = router;