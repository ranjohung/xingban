const express = require('express');
const router = express.Router();
const db = require('../config/db');
const auth = require('../middleware/auth');

const EARNING_RULES = Object.freeze({
  course_learning: { points: 5, label: '完成课程章节' },
  behavior_record: { points: 5, label: '完成行为记录' },
  strategy_feedback: { points: 4, label: '提交策略反馈' },
  weekly_report: { points: 5, label: '生成成长周报' }
});

function calculateLevel(points) {
  if (points < 100) return 'L1';
  if (points < 300) return 'L2';
  if (points < 600) return 'L3';
  if (points < 1000) return 'L4';
  return 'L5';
}

router.get('/profile', auth, (req, res) => {
  db.query('SELECT * FROM growth_profile WHERE user_id = ?', [req.user.id], (err, results) => {
    if (err) return res.status(500).json({ error: '学习记录暂时无法读取' });
    const profile = results[0] || { points: 0, dimensions: '{}' };
    const points = Math.max(0, Number(profile.points || 0));
    let dimensions = {};
    try { dimensions = JSON.parse(profile.dimensions || '{}'); } catch (_) {}
    res.json({ success: true, profile: {
      points,
      level: calculateLevel(points),
      growth_index: Math.min(Math.round(points / 10), 100),
      dimensions
    } });
  });
});

router.get('/history', auth, (req, res) => {
  db.query('SELECT * FROM growth_records WHERE user_id = ? ORDER BY created_at DESC LIMIT 20',
    [req.user.id],
    (err, results) => {
      if (err) return res.status(500).json({ error: '学习记录暂时无法读取' });
      res.json({ success: true, records: results.map(item => ({
        id: item.id,
        action: item.action,
        points: item.points,
        description: item.description,
        created_at: item.created_at
      })) });
    }
  );
});

router.post('/earn', auth, (req, res) => {
  const action = typeof req.body.action === 'string' ? req.body.action.trim() : '';
  const rule = EARNING_RULES[action];
  if (!rule) return res.status(400).json({ error: '不支持的学习记录类型' });
  const description = typeof req.body.description === 'string' ? req.body.description.trim().slice(0, 200) : rule.label;

  db.query('SELECT * FROM growth_profile WHERE user_id = ?', [req.user.id], (err, results) => {
    if (err) return res.status(500).json({ error: '学习记录暂时无法更新' });
    const profile = results[0];
    const newPoints = Math.max(0, Number(profile?.points || 0)) + rule.points;
    const newLevel = calculateLevel(newPoints);

    const saveRecord = () => {
      db.query('INSERT INTO growth_records (user_id, action, points, description) VALUES (?, ?, ?, ?)',
        [req.user.id, action, rule.points, description],
        (recordErr, result) => {
          if (recordErr) return res.status(500).json({ error: '学习记录暂时无法更新' });
          res.json({ success: true, message: '已记录本次学习活动', record: { id: result.insertId, action, points: rule.points, description } });
        }
      );
    };

    if (profile) {
      db.query('UPDATE growth_profile SET points = ?, level = ? WHERE user_id = ?', [newPoints, newLevel, req.user.id],
        updateErr => updateErr ? res.status(500).json({ error: '学习记录暂时无法更新' }) : saveRecord());
    } else {
      db.query('INSERT INTO growth_profile (user_id, points, level, dimensions) VALUES (?, ?, ?, ?)',
        [req.user.id, newPoints, newLevel, JSON.stringify({ knowledge: 0, practice: 0, emotion: 0, communication: 0 })],
        insertErr => insertErr ? res.status(500).json({ error: '学习记录暂时无法更新' }) : saveRecord());
    }
  });
});

module.exports = router;