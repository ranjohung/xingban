const express = require('express');
const router = express.Router();
const db = require('../config/db');
const auth = require('../middleware/auth');
const { parseDbJson } = require('../utils/json');

const behaviorCategories = {
  '情绪爆发': ['尖叫', '哭闹', '倒地', '摔东西'],
  '刻板行为': ['摇晃身体', '转圈', '拍手', '排列物品'],
  '攻击行为': ['打人', '踢人', '咬人', '抓头发'],
  '自伤行为': ['撞头', '咬自己', '抓自己'],
  '跑开/走失': ['无预警跑开', '躲藏'],
  '感官寻求': ['过度触摸', '盯着光源', '闻物品'],
  '感官回避': ['捂耳朵', '遮眼睛', '拒绝触碰'],
  '沟通尝试': ['用手指', '拉人手', '发出声音'],
  '适应性技能': ['自己穿衣', '如厕', '吃饭'],
  '社交发起': ['主动靠近同伴', '分享玩具'],
  '进食问题': ['挑食', '拒绝进食', '进食过快'],
  '睡眠问题': ['入睡困难', '夜醒', '早醒'],
  '其他': []
};

router.post('/', auth, (req, res) => {
  const {
    child_id, client_request_id, input_type, content, audio_url, photo_url,
    behavior_category, behavior_subtype, emotion_state,
    trigger_factor, behavior_function, intensity_level, location, duration
  } = req.body || {};
  if (!Number.isInteger(Number(child_id)) || !['voice', 'text', 'photo'].includes(input_type)) return res.status(400).json({ error: '孩子ID或记录方式无效' });
  if (client_request_id && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(client_request_id))) return res.status(400).json({ error: '请求标识无效' });
  if (!String(content || '').trim() && !audio_url && !photo_url) return res.status(400).json({ error: '请至少填写文字、语音或图片记录' });
  db.query('SELECT id FROM children WHERE id = ? AND user_id = ?', [Number(child_id), req.user.id], (ownerErr, childRows) => {
    if (ownerErr) return res.status(500).json({ error: '记录服务暂时不可用' });
    if (!childRows.length) return res.status(404).json({ error: '儿童档案不存在' });
    const aiAnalysis = performAIAnalysis(String(content || ''), behavior_category, behavior_subtype);
    const create = () => db.query(
      'INSERT INTO behavior_records (child_id, user_id, client_request_id, input_type, content, audio_url, photo_url, behavior_category, behavior_subtype, emotion_state, trigger_factor, behavior_function, intensity_level, location, duration, ai_analysis) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [Number(child_id), req.user.id, client_request_id || null, input_type, String(content || '').slice(0, 5000) || null, audio_url || null, photo_url || null, behavior_category || null, behavior_subtype || null, emotion_state || null, trigger_factor || null, behavior_function || null, ['low', 'medium', 'high'].includes(intensity_level) ? intensity_level : 'medium', location || null, duration || null, JSON.stringify(aiAnalysis)],
      (err, result) => {
        if (err?.code === 'ER_DUP_ENTRY' && client_request_id) return readExisting();
        if (err) return res.status(500).json({ error: '记录保存失败，本次请求未确认，请保留当前页面后重试' });
        res.status(201).json({ success: true, message: '行为记录已保存', replayed: false, record: { id: result.insertId, child_id: Number(child_id), input_type, ai_analysis: aiAnalysis } });
      }
    );
    const readExisting = () => db.query('SELECT id,child_id,input_type,ai_analysis FROM behavior_records WHERE user_id=? AND client_request_id=?', [req.user.id, client_request_id], (existingError, rows) => {
      if (existingError || !rows.length) return res.status(500).json({ error: '记录保存状态暂时无法确认，请勿重复填写并稍后重试' });
      res.json({ success: true, message: '该记录此前已经保存', replayed: true, record: { ...rows[0], ai_analysis: parseDbJson(rows[0].ai_analysis, {}) } });
    });
    if (client_request_id) {
      return db.query('SELECT id,child_id,input_type,ai_analysis FROM behavior_records WHERE user_id=? AND client_request_id=?', [req.user.id, client_request_id], (existingError, rows) => {
        if (existingError) return res.status(500).json({ error: '记录保存状态暂时无法确认，请保留当前页面后重试' });
        if (rows.length) return res.json({ success: true, message: '该记录此前已经保存', replayed: true, record: { ...rows[0], ai_analysis: parseDbJson(rows[0].ai_analysis, {}) } });
        create();
      });
    }
    create();
  });
});

router.get('/categories', (req, res) => {
  res.json({ success: true, categories: behaviorCategories });
});
router.get('/:childId', auth, (req, res) => {
  const { page = 1, limit = 20, category, emotion, date_start, date_end } = req.query;
  const offset = (page - 1) * limit;
  
  let query = 'SELECT * FROM behavior_records WHERE child_id = ? AND user_id = ?';
  const params = [req.params.childId, req.user.id];
  
  if (category) {
    query += ' AND behavior_category = ?';
    params.push(category);
  }
  
  if (emotion) {
    query += ' AND emotion_state = ?';
    params.push(emotion);
  }
  
  if (date_start) {
    query += ' AND created_at >= ?';
    params.push(date_start);
  }
  
  if (date_end) {
    query += ' AND created_at <= ?';
    params.push(date_end);
  }
  
  query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
  params.push(parseInt(limit), offset);
  
  db.query(query, params, (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    
    db.query('SELECT COUNT(*) as total FROM behavior_records WHERE child_id = ? AND user_id = ?', [req.params.childId, req.user.id], (err, countResults) => {
      if (err) return res.status(500).json({ error: err.message });
      
      res.json({
        success: true,
        records: results.map(r => ({
          ...r,
          ai_analysis: parseDbJson(r.ai_analysis, {})
        })),
        total: countResults[0].total,
        page: parseInt(page),
        limit: parseInt(limit)
      });
    });
  });
});

router.get('/:childId/statistics', auth, (req, res) => {
  const { date_start, date_end } = req.query;
  
  let query = `
    SELECT 
      behavior_category, 
      COUNT(*) as count,
      AVG(CASE WHEN intensity_level = 'high' THEN 3 WHEN intensity_level = 'medium' THEN 2 ELSE 1 END) as avg_intensity
    FROM behavior_records 
    WHERE child_id = ? AND user_id = ?
  `;
  const params = [req.params.childId, req.user.id];
  
  if (date_start) {
    query += ' AND created_at >= ?';
    params.push(date_start);
  }
  
  if (date_end) {
    query += ' AND created_at <= ?';
    params.push(date_end);
  }
  
  query += ' GROUP BY behavior_category ORDER BY count DESC';
  
  db.query(query, params, (err, categoryStats) => {
    if (err) return res.status(500).json({ error: err.message });
    
    db.query(`
      SELECT 
        DATE(created_at) as date,
        COUNT(*) as count
      FROM behavior_records 
      WHERE child_id = ? AND user_id = ?
      GROUP BY DATE(created_at) ORDER BY date DESC LIMIT 7
    `, [req.params.childId, req.user.id], (err, trendStats) => {
      if (err) return res.status(500).json({ error: err.message });
      
      res.json({
        success: true,
        categoryStats,
        trendStats
      });
    });
  });
});

router.get('/:childId/timeline', auth, (req, res) => {
  db.query(`
    SELECT 
      DATE(created_at) as date,
      behavior_category,
      emotion_state,
      COUNT(*) as count
    FROM behavior_records 
    WHERE child_id = ? AND user_id = ?
    GROUP BY DATE(created_at), behavior_category, emotion_state
    ORDER BY date DESC
  `, [req.params.childId, req.user.id], (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    
    res.json({ success: true, timeline: results });
  });
});

router.get('/record/:id', auth, (req, res) => {

  db.query('SELECT * FROM behavior_records WHERE id = ? AND user_id = ?', [req.params.id, req.user.id], (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    
    if (results.length === 0) {
      return res.status(404).json({ error: '记录不存在' });
    }
    
    const record = results[0];
    res.json({ 
      success: true, 
      record: {
        ...record,
        ai_analysis: parseDbJson(record.ai_analysis, {})
      }
    });
  });
});

router.put('/:id', auth, (req, res) => {
  const { 
    behavior_category, behavior_subtype, emotion_state,
    trigger_factor, behavior_function, intensity_level, location, duration, content
  } = req.body;
  
  db.query(
    'UPDATE behavior_records SET behavior_category = ?, behavior_subtype = ?, emotion_state = ?, trigger_factor = ?, behavior_function = ?, intensity_level = ?, location = ?, duration = ?, content = ? WHERE id = ? AND user_id = ?',
    [
      behavior_category,
      behavior_subtype,
      emotion_state,
      trigger_factor,
      behavior_function,
      intensity_level,
      location,
      duration,
      content,
      req.params.id,
      req.user.id
    ],
    (err) => {
      if (err) return res.status(500).json({ error: err.message });
      
      res.json({ success: true, message: '行为记录更新成功' });
    }
  );
});

router.delete('/:id', auth, (req, res) => {
  db.query('DELETE FROM behavior_records WHERE id = ? AND user_id = ?', [req.params.id, req.user.id], (err) => {
    if (err) return res.status(500).json({ error: err.message });
    
    res.json({ success: true, message: '行为记录删除成功' });
  });
});

function performAIAnalysis(content, category, subtype) {
  const functions = ['逃避型行为', '求关注行为', '感官刺激行为', '获取实物行为'];
  const emotions = ['平静', '烦躁', '生气', '焦虑', '兴奋'];
  
  let predictedFunction = functions[Math.floor(Math.random() * functions.length)];
  let predictedEmotion = emotions[Math.floor(Math.random() * emotions.length)];
  
  if (content) {
    if (content.includes('不想') || content.includes('不要')) {
      predictedFunction = '逃避型行为';
    } else if (content.includes('看') || content.includes('注意')) {
      predictedFunction = '求关注行为';
    } else if (content.includes('想要') || content.includes('我要')) {
      predictedFunction = '获取实物行为';
    }
    
    if (content.includes('哭') || content.includes('闹')) {
      predictedEmotion = '生气';
    } else if (content.includes('害怕') || content.includes('紧张')) {
      predictedEmotion = '焦虑';
    }
  }
  
  return {
    behavior_category: category,
    behavior_subtype: subtype,
    emotion_state: predictedEmotion,
    trigger_factor: '根据内容分析的可能触发因素',
    behavior_function: predictedFunction,
    suggestions: [
      '尝试使用视觉支持帮助孩子理解',
      '保持冷静，避免情绪化反应',
      '及时给予正向反馈'
    ]
  };
}

module.exports = router;
