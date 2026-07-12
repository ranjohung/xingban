const express = require('express');
const router = express.Router();
const db = require('../config/db');
const auth = require('../middleware/auth');

router.get('/recommend/:childId', auth, (req, res) => {
  const { behavior_category, behavior_subtype } = req.query;
  
  let query = 'SELECT * FROM strategies WHERE 1=1';
  const params = [];
  
  if (behavior_category) {
    query += ' AND category = ?';
    params.push(behavior_category);
  }
  
  query += ' ORDER BY effectiveness_rate DESC, usage_count DESC LIMIT 3';
  
  db.query(query, params, (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    
    const strategies = results.map(s => ({
      ...s,
      steps: s.steps?.split('\n') || [],
      scripts: s.scripts?.split('\n') || []
    }));
    
    db.query('SELECT * FROM intervention_goals WHERE child_id = ? AND status = "active" LIMIT 3', [req.params.childId], (err, goals) => {
      if (err) return res.status(500).json({ error: err.message });
      
      const consistencyCheck = checkConsistency(strategies, goals);
      
      res.json({
        success: true,
        strategies,
        consistency_check: consistencyCheck
      });
    });
  });
});

router.get('/:id', auth, (req, res) => {
  db.query('SELECT * FROM strategies WHERE id = ?', [req.params.id], (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    
    if (results.length === 0) {
      return res.status(404).json({ error: '策略不存在' });
    }
    
    const strategy = results[0];
    res.json({ 
      success: true, 
      strategy: {
        ...strategy,
        steps: strategy.steps?.split('\n') || [],
        scripts: strategy.scripts?.split('\n') || []
      }
    });
  });
});

router.get('/', auth, (req, res) => {
  const { category, page = 1, limit = 20 } = req.query;
  const offset = (page - 1) * limit;
  
  let query = 'SELECT * FROM strategies WHERE 1=1';
  const params = [];
  
  if (category) {
    query += ' AND category = ?';
    params.push(category);
  }
  
  query += ' ORDER BY category, name LIMIT ? OFFSET ?';
  params.push(parseInt(limit), offset);
  
  db.query(query, params, (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    
    db.query('SELECT COUNT(*) as total FROM strategies WHERE 1=1' + (category ? ' AND category = ?' : ''), 
      category ? [category] : [], (err, countResults) => {
      if (err) return res.status(500).json({ error: err.message });
      
      res.json({
        success: true,
        strategies: results.map(s => ({
          ...s,
          steps: s.steps?.split('\n') || [],
          scripts: s.scripts?.split('\n') || []
        })),
        total: countResults[0].total,
        page: parseInt(page),
        limit: parseInt(limit)
      });
    });
  });
});

router.post('/feedback', auth, (req, res) => {
  const { child_id, strategy_id, behavior_record_id, effectiveness, note, scene } = req.body;
  
  if (!child_id || !strategy_id || !effectiveness) {
    return res.status(400).json({ error: '请填写必填信息（孩子ID、策略ID、效果评价）' });
  }
  
  db.query(
    'INSERT INTO strategy_feedback (child_id, strategy_id, user_id, behavior_record_id, effectiveness, note, scene) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [child_id, strategy_id, req.user.id, behavior_record_id || null, effectiveness, note || null, scene || null],
    (err, result) => {
      if (err) return res.status(500).json({ error: err.message });
      
      updateStrategyEffectiveness(strategy_id);
      
      if (effectiveness === 'effective') {
        checkSkillGeneralization(child_id, strategy_id, scene);
      }
      
      res.status(201).json({
        success: true,
        message: '反馈提交成功',
        feedback: { id: result.insertId, effectiveness }
      });
    }
  );
});

router.get('/:strategyId/feedback/:childId', auth, (req, res) => {
  db.query('SELECT * FROM strategy_feedback WHERE strategy_id = ? AND child_id = ? ORDER BY created_at DESC', 
    [req.params.strategyId, req.params.childId], (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    
    res.json({ success: true, feedback: results });
  });
});

router.get('/:strategyId/generalization/:childId', auth, (req, res) => {
  db.query('SELECT * FROM skill_generalization WHERE strategy_id = ? AND child_id = ?', 
    [req.params.strategyId, req.params.childId], (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    
    res.json({ success: true, generalization: results });
  });
});

router.post('/generalization', auth, (req, res) => {
  const { child_id, strategy_id, original_scene, target_scene, status } = req.body;
  
  if (!child_id || !strategy_id || !original_scene || !target_scene) {
    return res.status(400).json({ error: '请填写必填信息' });
  }
  
  db.query('SELECT * FROM skill_generalization WHERE child_id = ? AND strategy_id = ? AND target_scene = ?', 
    [child_id, strategy_id, target_scene], (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    
    if (results.length > 0) {
      db.query('UPDATE skill_generalization SET status = ? WHERE id = ?', 
        [status || 'trying', results[0].id], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true, message: '技能泛化记录更新成功' });
      });
    } else {
      db.query(
        'INSERT INTO skill_generalization (child_id, strategy_id, original_scene, target_scene, status) VALUES (?, ?, ?, ?, ?)',
        [child_id, strategy_id, original_scene, target_scene, status || 'pending'],
        (err, result) => {
          if (err) return res.status(500).json({ error: err.message });
          res.status(201).json({ success: true, message: '技能泛化记录创建成功', id: result.insertId });
        }
      );
    }
  });
});

function updateStrategyEffectiveness(strategyId) {
  db.query(`
    SELECT 
      SUM(CASE WHEN effectiveness = 'effective' THEN 1 ELSE 0 END) as effective_count,
      COUNT(*) as total_count
    FROM strategy_feedback 
    WHERE strategy_id = ?
  `, [strategyId], (err, results) => {
    if (err || results.length === 0) return;
    
    const { effective_count, total_count } = results[0];
    const effectivenessRate = total_count > 0 ? (effective_count / total_count) * 100 : 0;
    
    db.query('UPDATE strategies SET effectiveness_rate = ?, usage_count = usage_count + 1 WHERE id = ?', 
      [effectivenessRate, strategyId], () => {});
  });
}

function checkSkillGeneralization(childId, strategyId, scene) {
  if (!scene) return;
  
  const similarScenes = {
    '餐桌吃饭': ['超市收银台', '学校食堂', '家庭聚餐'],
    '客厅游戏': ['公园玩耍', '教室课堂'],
    '卧室睡前': ['午睡时间', '旅行住宿'],
    '浴室洗澡': ['游泳池', '理发店'],
    '户外散步': ['商场购物', '公园游玩'],
    '学校上课': ['课后辅导', '兴趣班'],
    '家庭作业': ['图书馆', '咖啡馆']
  };
  
  const targetScenes = similarScenes[scene] || [];
  
  targetScenes.forEach(targetScene => {
    db.query('SELECT * FROM skill_generalization WHERE child_id = ? AND strategy_id = ? AND target_scene = ?', 
      [childId, strategyId, targetScene], (err, results) => {
      if (err || results.length > 0) return;
      
      db.query(
        'INSERT INTO skill_generalization (child_id, strategy_id, original_scene, target_scene) VALUES (?, ?, ?, ?)',
        [childId, strategyId, scene, targetScene], () => {}
      );
    });
  });
}

function checkConsistency(strategies, goals) {
  if (!goals || goals.length === 0) return null;
  
  const goalKeywords = goals.map(g => g.goal_type);
  const strategyKeywords = strategies.map(s => s.category);
  
  const inconsistencies = [];
  
  strategyKeywords.forEach(sk => {
    if (!goalKeywords.includes(sk)) {
      inconsistencies.push({
        strategy_category: sk,
        active_goals: goalKeywords,
        message: `该策略主要针对${sk}，而您当前的目标是${goalKeywords.join('、')}。是否同时查看相关的策略？`
      });
    }
  });
  
  return inconsistencies.length > 0 ? inconsistencies : null;
}

router.get('/behavior-functions', (req, res) => {
  const functions = [
    {
      type: '逃避型行为',
      explanation: '孩子在说"我不想做这个"',
      examples: '任务太难、时间太长、环境不适应时出现',
      description: '孩子可能用这个行为来逃避不喜欢的任务。例如，不想洗澡所以尖叫。当任务太难或孩子疲惫时更常见。'
    },
    {
      type: '求关注行为',
      explanation: '孩子在说"看看我"',
      examples: '即使被批评也是关注，孩子会重复做',
      description: '孩子通过行为获取成人关注，即使是负面关注也能强化这种行为。'
    },
    {
      type: '感官刺激行为',
      explanation: '孩子在说"我的身体需要这个感觉"',
      examples: '摇晃、拍手、转圈等自我刺激行为',
      description: '孩子通过重复行为获得感官刺激，帮助自我调节或应对焦虑。'
    },
    {
      type: '获取实物行为',
      explanation: '孩子在说"我想要那个"',
      examples: '通过哭闹、抢夺等方式获取喜欢的物品或活动',
      description: '孩子通过行为获取想要的物品或参与喜欢的活动。'
    }
  ];
  
  res.json({ success: true, functions });
});

module.exports = router;
