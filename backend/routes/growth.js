const express = require('express');
const router = express.Router();
const db = require('../config/db');
const auth = require('../middleware/auth');

function calculateLevel(points) {
  if (points < 100) return 'L1';
  if (points < 300) return 'L2';
  if (points < 600) return 'L3';
  if (points < 1000) return 'L4';
  return 'L5';
}

router.get('/profile', auth, (req, res) => {
  db.query('SELECT * FROM growth_profile WHERE user_id = ?',
    [req.user.id],
    (err, results) => {
      if (err) return res.status(500).json({ error: err.message });
      
      let profile = results[0];
      if (!profile) {
        profile = {
          user_id: req.user.id,
          points: 0,
          level: 'L1',
          dimensions: JSON.stringify({
            knowledge: 0,
            practice: 0,
            emotion: 0,
            communication: 0
          })
        };
      }
      
      const level = calculateLevel(profile.points);
      
      res.json({
        success: true,
        profile: {
          points: profile.points,
          level: level,
          growth_index: Math.min(Math.round(profile.points / 10), 100),
          dimensions: JSON.parse(profile.dimensions || '{"knowledge":0,"practice":0,"emotion":0,"communication":0}')
        }
      });
    }
  );
});

router.get('/history', auth, (req, res) => {
  db.query('SELECT * FROM growth_records WHERE user_id = ? ORDER BY created_at DESC LIMIT 20',
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

router.post('/earn', auth, (req, res) => {
  const { action, points, description } = req.body;
  
  if (!action || !points) {
    return res.status(400).json({ error: '行为和积分不能为空' });
  }
  
  db.query('SELECT * FROM growth_profile WHERE user_id = ?',
    [req.user.id],
    (err, results) => {
      if (err) return res.status(500).json({ error: err.message });
      
      let profile = results[0];
      const newPoints = (profile?.points || 0) + points;
      const newLevel = calculateLevel(newPoints);
      
      if (profile) {
        db.query('UPDATE growth_profile SET points = ?, level = ? WHERE user_id = ?',
          [newPoints, newLevel, req.user.id],
          (err) => {
            if (err) return res.status(500).json({ error: err.message });
            saveRecord();
          }
        );
      } else {
        db.query('INSERT INTO growth_profile (user_id, points, level, dimensions) VALUES (?, ?, ?, ?)',
          [req.user.id, newPoints, newLevel, JSON.stringify({ knowledge: 0, practice: 0, emotion: 0, communication: 0 })],
          (err) => {
            if (err) return res.status(500).json({ error: err.message });
            saveRecord();
          }
        );
      }
      
      function saveRecord() {
        db.query('INSERT INTO growth_records (user_id, action, points, description) VALUES (?, ?, ?, ?)',
          [req.user.id, action, points, description || ''],
          (err, result) => {
            if (err) return res.status(500).json({ error: err.message });
            
            res.json({
              success: true,
              message: `获得 ${points} 成长积分`,
              record: { id: result.insertId, action, points, description }
            });
          }
        );
      }
    }
  );
});

module.exports = router;