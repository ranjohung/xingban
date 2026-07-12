const express = require('express');
const router = express.Router();
const db = require('../config/db');
const auth = require('../middleware/auth');

const levelStrategies = {
  green: [
    { id: 1, name: '深呼吸法', category: '情绪调节', description: '引导孩子深呼吸，帮助平静情绪' },
    { id: 2, name: '感官安抚', category: '情绪调节', description: '使用感官物品帮助孩子自我调节' },
    { id: 5, name: '图片交换沟通', category: '沟通支持', description: '使用图片帮助孩子表达需求' }
  ],
  yellow: [
    { id: 2, name: '感官安抚', category: '情绪调节', description: '使用感官物品帮助孩子自我调节' },
    { id: 6, name: '替代行为训练', category: '行为减少', description: '教孩子用适当行为替代问题行为' },
    { id: 1, name: '深呼吸法', category: '情绪调节', description: '引导孩子深呼吸，帮助平静情绪' }
  ],
  red: [
    { id: 6, name: '替代行为训练', category: '行为减少', description: '教孩子用适当行为替代问题行为' },
    { id: 7, name: '消退法', category: '行为减少', description: '在安全前提下，忽视问题行为' },
    { id: 2, name: '感官安抚', category: '情绪调节', description: '使用感官物品帮助孩子自我调节' }
  ]
};

const passersbyScripts = [
  { scenario: '路人围观', script: '孩子现在需要安静，请不要拍照，谢谢理解' },
  { scenario: '路人询问', script: '孩子有特殊需求，我们正在处理，请保持距离' },
  { scenario: '路人指责', script: '谢谢您的关心，我们有专业的处理方法，请放心' },
  { scenario: '公共场所', script: '麻烦让一让，孩子需要一些空间，谢谢配合' }
];

router.post('/start', auth, (req, res) => {
  const { child_id, level } = req.body;
  
  if (!child_id || !level) {
    return res.status(400).json({ error: '请填写必填信息（孩子ID、紧急等级）' });
  }
  
  const validLevels = ['green', 'yellow', 'red'];
  if (!validLevels.includes(level)) {
    return res.status(400).json({ error: '紧急等级必须是 green、yellow 或 red' });
  }
  
  db.query(
    'INSERT INTO emergency_sessions (child_id, user_id, level) VALUES (?, ?, ?)',
    [child_id, req.user.id, level],
    (err, result) => {
      if (err) return res.status(500).json({ error: err.message });
      
      const strategies = levelStrategies[level];
      
      res.status(201).json({
        success: true,
        message: '紧急模式启动成功',
        session: { id: result.insertId, child_id, level, started_at: new Date().toISOString() },
        strategies,
        passersby_scripts: passersbyScripts
      });
    }
  );
});

router.post('/end/:sessionId', auth, (req, res) => {
  const { outcome, energy_station } = req.body;
  
  db.query(
    'UPDATE emergency_sessions SET ended_at = NOW(), outcome = ?, energy_station = ? WHERE id = ? AND user_id = ?',
    [outcome || null, energy_station || false, req.params.sessionId, req.user.id],
    (err) => {
      if (err) return res.status(500).json({ error: err.message });
      
      if (energy_station) {
        db.query('INSERT INTO energy_station (user_id, type, content) VALUES (?, ?, ?)',
          [req.user.id, 'feedback', '成功应对了一次紧急情况，你做得很好！'], () => {});
      }
      
      res.json({
        success: true,
        message: '紧急模式结束',
        positive_message: '刚才的情况很艰难，但你撑过来了。你做得足够好。',
        energy_station: energy_station
      });
    }
  );
});

router.get('/:childId/history', auth, (req, res) => {
  const { page = 1, limit = 20 } = req.query;
  const offset = (page - 1) * limit;
  
  db.query(
    'SELECT * FROM emergency_sessions WHERE child_id = ? ORDER BY started_at DESC LIMIT ? OFFSET ?',
    [req.params.childId, parseInt(limit), offset],
    (err, results) => {
      if (err) return res.status(500).json({ error: err.message });
      
      db.query('SELECT COUNT(*) as total FROM emergency_sessions WHERE child_id = ?', [req.params.childId], (err, countResults) => {
        if (err) return res.status(500).json({ error: err.message });
        
        res.json({
          success: true,
          sessions: results,
          total: countResults[0].total,
          page: parseInt(page),
          limit: parseInt(limit)
        });
      });
    }
  );
});

router.get('/strategies/:level', (req, res) => {
  const strategies = levelStrategies[req.params.level] || [];
  
  res.json({ success: true, strategies, passersby_scripts: passersbyScripts });
});

router.get('/passersby-scripts', (req, res) => {
  res.json({ success: true, scripts: passersbyScripts });
});

module.exports = router;
