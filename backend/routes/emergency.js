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
    { id: 101, name: '立即安全分流', category: '危机安全', description: '不让孩子独处；无法保证安全或拿不准时，立即联系120/110和既往就诊机构' },
    { id: 102, name: '降低危险物可及性', category: '危机安全', description: '只在不危及成人安全、不引发对抗的前提下，移开可安全移除的药物、刀具等危险物' },
    { id: 103, name: '保留关键信息', category: '医疗沟通', description: '准备发生时间、伤情、用药、睡眠、意识变化和所在位置，交给急救或既往就诊机构' }
  ]
};

const passersbyScripts = [
  { scenario: '路人围观', script: '孩子现在需要安静，请不要拍照，谢谢理解' },
  { scenario: '路人询问', script: '孩子有特殊需求，我们正在处理，请保持距离' },
  { scenario: '路人指责', script: '谢谢您的关心，我们有专业的处理方法，请放心' },
  { scenario: '公共场所', script: '麻烦让一让，孩子需要一些空间，谢谢配合' }
];
const positiveId = value => { const id = Number.parseInt(value, 10); return Number.isInteger(id) && id > 0 ? id : 0; };
const uuid = value => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value || '') ? value : '';
const cleanOutcome = value => ['calm', 'low', 'angry'].includes(value) ? value : '';

router.post('/start', auth, (req, res) => {
  const childId = positiveId(req.body.child_id);
  const level = req.body.level;
  const clientRequestId = uuid(req.body.client_request_id);
  
  if (!childId || !level) {
    return res.status(400).json({ error: '请填写必填信息（孩子ID、紧急等级）' });
  }
  if (!clientRequestId) return res.status(400).json({ error: '请求标识无效，请刷新后重试' });
  
  const validLevels = ['green', 'yellow', 'red'];
  if (!validLevels.includes(level)) {
    return res.status(400).json({ error: '紧急等级必须是 green、yellow 或 red' });
  }
  
  db.query('SELECT id FROM children WHERE id = ? AND user_id = ?', [childId, req.user.id], (childErr, children) => {
    if (childErr) return res.status(500).json({ error: '暂时无法核验儿童档案' });
    if (!children?.length) return res.status(404).json({ error: '儿童档案不存在' });
    db.query('SELECT id, child_id, level, started_at, ended_at FROM emergency_sessions WHERE user_id = ? AND client_request_id = ? LIMIT 1', [req.user.id, clientRequestId], (lookupErr, rows) => {
      if (lookupErr) return res.status(500).json({ error: '暂时无法核对紧急支持会话' });
      if (rows?.length) return res.json({ success: true, replayed: true, message: '该会话此前已启动', session: rows[0], strategies: levelStrategies[rows[0].level], passersby_scripts: passersbyScripts });
      db.query('INSERT INTO emergency_sessions (client_request_id, child_id, user_id, level) VALUES (?, ?, ?, ?)', [clientRequestId, childId, req.user.id, level], (err, result) => {
        if (!err) return res.status(201).json({ success: true, message: '紧急模式启动成功', session: { id: result.insertId, child_id: childId, level, started_at: new Date().toISOString() }, strategies: levelStrategies[level], passersby_scripts: passersbyScripts });
        if (err.code !== 'ER_DUP_ENTRY') return res.status(500).json({ error: '紧急支持会话暂时无法保存' });
        db.query('SELECT id, child_id, level, started_at, ended_at FROM emergency_sessions WHERE user_id = ? AND client_request_id = ? LIMIT 1', [req.user.id, clientRequestId], (raceErr, raceRows) => {
          if (raceErr || !raceRows?.length) return res.status(500).json({ error: '紧急支持会话状态暂时无法确认' });
          res.json({ success: true, replayed: true, message: '该会话此前已启动', session: raceRows[0], strategies: levelStrategies[raceRows[0].level], passersby_scripts: passersbyScripts });
        });
      });
    });
  });
});

router.post('/end/:sessionId', auth, async (req, res, next) => {
  const sessionId = positiveId(req.params.sessionId);
  const outcome = cleanOutcome(req.body.outcome);
  const energyStation = req.body.energy_station === true;
  if (!sessionId || !outcome) return res.status(400).json({ error: '会话编号或结果无效' });
  try {
    const result = await db.withTransaction(async tx => {
      const rows = await tx.query('SELECT id, ended_at, outcome, energy_station FROM emergency_sessions WHERE id = ? AND user_id = ? FOR UPDATE', [sessionId, req.user.id]);
      if (!rows.length) return { missing: true };
      if (rows[0].ended_at) return { replayed: true, outcome: rows[0].outcome, energy_station: Boolean(rows[0].energy_station) };
      await tx.query('UPDATE emergency_sessions SET ended_at = NOW(), outcome = ?, energy_station = ? WHERE id = ? AND user_id = ? AND ended_at IS NULL', [outcome, energyStation, sessionId, req.user.id]);
      if (energyStation) await tx.query('INSERT INTO energy_station (user_id, type, content) VALUES (?, ?, ?)', [req.user.id, 'feedback', '刚才的情况很艰难，你已完成了这次安全应对记录。']);
      return { replayed: false, outcome, energy_station: energyStation };
    });
    if (result.missing) return res.status(404).json({ error: '紧急支持会话不存在' });
    res.json({ success: true, replayed: result.replayed, message: '紧急模式结束', positive_message: '刚才的情况很艰难，你已经完成了本次记录。', outcome: result.outcome, energy_station: result.energy_station });
  } catch (error) { next(error); }
});

router.get('/:childId/history', auth, (req, res) => {
  const childId = positiveId(req.params.childId);
  const page = Math.max(1, positiveId(req.query.page) || 1);
  const limit = Math.min(100, positiveId(req.query.limit) || 20);
  const offset = (page - 1) * limit;
  if (!childId) return res.status(400).json({ error: '儿童编号无效' });
  
  db.query(
    'SELECT id, child_id, level, started_at, ended_at, outcome, energy_station FROM emergency_sessions WHERE child_id = ? AND user_id = ? ORDER BY started_at DESC LIMIT ? OFFSET ?',
    [childId, req.user.id, limit, offset],
    (err, results) => {
      if (err) return res.status(500).json({ error: err.message });
      
      db.query('SELECT COUNT(*) as total FROM emergency_sessions WHERE child_id = ? AND user_id = ?', [childId, req.user.id], (err, countResults) => {
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
