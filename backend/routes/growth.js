const express = require('express');
const router = express.Router();
const db = require('../config/db');
const auth = require('../middleware/auth');
const { parseDbJson } = require('../utils/json');

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
    const dimensions = parseDbJson(profile.dimensions, {});
    db.query("SELECT activity_key FROM growth_records WHERE user_id=? AND action='course_learning' AND activity_key IS NOT NULL ORDER BY id", [req.user.id], (recordError, records) => {
      if (recordError) return res.status(500).json({ error: '课程进度暂时无法读取' });
      res.json({ success: true, profile: {
        points,
        level: calculateLevel(points),
        growth_index: Math.min(Math.round(points / 10), 100),
        dimensions,
        course_progress: records.map(item => item.activity_key).filter(Boolean)
      } });
    });
  });
});

router.get('/history', auth, (req, res) => {
  db.query('SELECT * FROM growth_records WHERE user_id = ? ORDER BY created_at DESC LIMIT 200',
    [req.user.id],
    (err, results) => {
      if (err) return res.status(500).json({ error: '学习记录暂时无法读取' });
      res.json({ success: true, records: results.map(item => ({
        id: item.id,
        action: item.action,
        points: item.points,
        description: item.description,
        activity_key: item.activity_key || null,
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
  const clientRequestId = String(req.body.client_request_id || '').trim();
  const activityKey = String(req.body.activity_key || '').trim();
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!uuidPattern.test(clientRequestId)) return res.status(400).json({ error: '请求标识无效' });
  if (!/^[a-z0-9:_-]{3,100}$/i.test(activityKey)) return res.status(400).json({ error: '学习活动标识无效' });

  const sendReplay = row => res.json({ success: true, replayed: true, message: '本章节此前已记录', record: { id: row.id, action: row.action, points: row.points, description: row.description, activity_key: row.activity_key } });
  if (db.status().mode === 'mysql') {
    const readReplay = () => db.query('SELECT id,action,points,description,activity_key FROM growth_records WHERE user_id=? AND (client_request_id=? OR (action=? AND activity_key=?)) LIMIT 1', [req.user.id,clientRequestId,action,activityKey], (readError,rows) => {
      if (readError || !rows.length) return res.status(500).json({ error:'学习记录状态暂时无法确认，请重试' });
      sendReplay(rows[0]);
    });
    const createActivity = () => db.withTransaction(async tx => {
      const profiles = await tx.query('SELECT points FROM growth_profile WHERE user_id=? FOR UPDATE', [req.user.id]);
      const currentPoints = Math.max(0, Number(profiles[0]?.points || 0));
      const inserted = await tx.query('INSERT INTO growth_records (user_id,client_request_id,activity_key,action,points,description) VALUES (?,?,?,?,?,?)', [req.user.id,clientRequestId,activityKey,action,rule.points,description]);
      const newPoints = currentPoints + rule.points;
      if (profiles.length) await tx.query('UPDATE growth_profile SET points=?,level=? WHERE user_id=?', [newPoints,calculateLevel(newPoints),req.user.id]);
      else await tx.query('INSERT INTO growth_profile (user_id,points,level,dimensions) VALUES (?,?,?,?)', [req.user.id,newPoints,calculateLevel(newPoints),JSON.stringify({ knowledge:0,practice:0,emotion:0,communication:0 })]);
      return inserted.insertId;
    }).then(id => res.status(201).json({ success:true,replayed:false,message:'已记录本次学习活动',record:{ id,action,points:rule.points,description,activity_key:activityKey } }))
      .catch(error => {
        if (error?.code === 'ER_DUP_ENTRY') { readReplay(); return; }
        res.status(500).json({ error:'学习记录未确认保存，请保留当前页面后重试' });
      });
    return db.query('SELECT id,action,points,description,activity_key FROM growth_records WHERE user_id=? AND (client_request_id=? OR (action=? AND activity_key=?)) LIMIT 1', [req.user.id,clientRequestId,action,activityKey], (readError,rows) => {
      if (readError) return res.status(500).json({ error:'学习记录状态暂时无法确认，请重试' });
      if (rows.length) return sendReplay(rows[0]);
      createActivity();
    });
  }

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
