const express = require('express');
const router = express.Router();
const db = require('../config/db');
const auth = require('../middleware/auth');

const DIAGNOSIS_TYPES = new Set(['UNCONFIRMED', 'ASD', 'ADHD', 'DD', 'OTHER']);
const clean = (value, max) => String(value ?? '').trim().slice(0, max);
const validDate = value => /^\d{4}-\d{2}-\d{2}$/.test(String(value || '')) && !Number.isNaN(new Date(`${value}T00:00:00`).getTime()) && new Date(`${value}T00:00:00`) <= new Date();
const validLevel = value => value === undefined || (Number.isInteger(Number(value)) && Number(value) >= 1 && Number(value) <= 5);

router.post('/wizard/step1', auth, (req, res) => {
  const { nickname, birth_date, diagnosis_type, diagnosis_other } = req.body;
  
  if (!nickname || !birth_date || !diagnosis_type) {
    return res.status(400).json({ error: '请填写必填信息（昵称、出生日期、诊断类型）' });
  }
  if (String(nickname).trim().length > 40 || !validDate(birth_date) || !DIAGNOSIS_TYPES.has(diagnosis_type)) {
    return res.status(400).json({ error: '儿童档案字段无效' });
  }
  if ([communication_level, social_level, self_care_level, cognitive_level].some(value => !validLevel(value))) {
    return res.status(400).json({ error: '支持需要记录必须为1至5' });
  }
  
  const draft = {
    user_id: req.user.id,
    step: 1,
    data: { nickname, birth_date, diagnosis_type, diagnosis_other },
    created_at: new Date(),
    updated_at: new Date()
  };
  
  db.query(
    'INSERT INTO child_profile_drafts (user_id, step, data) VALUES (?, ?, ?)',
    [req.user.id, 1, JSON.stringify(draft.data)],
    (err, result) => {
      if (err) return res.status(500).json({ error: err.message });
      
      res.status(201).json({
        success: true,
        message: '基础信息已保存',
        draft_id: result.insertId,
        next_step: 2
      });
    }
  );
});

router.post('/wizard/step2', auth, (req, res) => {
  const { draft_id, communication_level, social_level, self_care_level, cognitive_level } = req.body;
  
  if (!draft_id) {
    return res.status(400).json({ error: '缺少草稿ID' });
  }
  
  db.query('SELECT * FROM child_profile_drafts WHERE id = ? AND user_id = ?',
    [draft_id, req.user.id],
    (err, results) => {
      if (err) return res.status(500).json({ error: err.message });
      if (results.length === 0) {
        return res.status(404).json({ error: '草稿不存在' });
      }
      
      const draft = results[0];
      const draftData = JSON.parse(draft.data || '{}');
      
      const updatedData = {
        ...draftData,
        communication_level: communication_level || 'none',
        social_level: social_level || 1,
        self_care_level: self_care_level || 1,
        cognitive_level: cognitive_level || 1
      };
      
      db.query('UPDATE child_profile_drafts SET step = ?, data = ?, updated_at = NOW() WHERE id = ?',
        [2, JSON.stringify(updatedData), draft_id],
        (err) => {
          if (err) return res.status(500).json({ error: err.message });
          
          res.json({
            success: true,
            message: '能力评估已保存',
            draft_id,
            next_step: 3
          });
        }
      );
    }
  );
});

router.post('/wizard/step3', auth, (req, res) => {
  const { draft_id, sensory_hearing, sensory_visual, sensory_tactile, sensory_vestibular, reinforcers, medical_info } = req.body;
  
  if (!draft_id) {
    return res.status(400).json({ error: '缺少草稿ID' });
  }
  
  db.query('SELECT * FROM child_profile_drafts WHERE id = ? AND user_id = ?',
    [draft_id, req.user.id],
    (err, results) => {
      if (err) return res.status(500).json({ error: err.message });
      if (results.length === 0) {
        return res.status(404).json({ error: '草稿不存在' });
      }
      
      const draft = results[0];
      const draftData = JSON.parse(draft.data || '{}');
      
      const updatedData = {
        ...draftData,
        sensory_hearing: sensory_hearing || 'normal',
        sensory_visual: sensory_visual || 'normal',
        sensory_tactile: sensory_tactile || 'normal',
        sensory_vestibular: sensory_vestibular || 'normal',
        reinforcers: reinforcers || [],
        medical_info: medical_info || null
      };
      
      db.query('UPDATE child_profile_drafts SET step = ?, data = ?, updated_at = NOW() WHERE id = ?',
        [3, JSON.stringify(updatedData), draft_id],
        (err) => {
          if (err) return res.status(500).json({ error: err.message });
          
          res.json({
            success: true,
            message: '感官特点已保存',
            draft_id,
            next_step: 4
          });
        }
      );
    }
  );
});

router.post('/wizard/step4', auth, (req, res) => {
  const { draft_id } = req.body;
  
  if (!draft_id) {
    return res.status(400).json({ error: '缺少草稿ID' });
  }
  
  db.query('SELECT * FROM child_profile_drafts WHERE id = ? AND user_id = ?',
    [draft_id, req.user.id],
    (err, results) => {
      if (err) return res.status(500).json({ error: err.message });
      if (results.length === 0) {
        return res.status(404).json({ error: '草稿不存在' });
      }
      
      const draft = results[0];
      const data = JSON.parse(draft.data || '{}');
      
      db.query(
        'INSERT INTO children (user_id, nickname, birth_date, diagnosis_type, diagnosis_other, communication_level, social_level, self_care_level, cognitive_level, sensory_hearing, sensory_visual, sensory_tactile, sensory_vestibular, reinforcers, medical_info) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [
          req.user.id,
          data.nickname,
          data.birth_date,
          data.diagnosis_type,
          data.diagnosis_other || null,
          data.communication_level || 'none',
          data.social_level || 1,
          data.self_care_level || 1,
          data.cognitive_level || 1,
          data.sensory_hearing || 'normal',
          data.sensory_visual || 'normal',
          data.sensory_tactile || 'normal',
          data.sensory_vestibular || 'normal',
          JSON.stringify(data.reinforcers || []),
          data.medical_info || null
        ],
        (err, result) => {
          if (err) return res.status(500).json({ error: err.message });
          
          const childId = result.insertId;
          // 目标必须由孩子与照护者、专业人员共同确认，不按分数自动生成。
          
          db.query('DELETE FROM child_profile_drafts WHERE id = ?', [draft_id], () => {});
          
          db.query('SELECT * FROM children WHERE id = ?', [childId], (err, childResults) => {
            if (err) return res.status(500).json({ error: err.message });
            
            const child = childResults[0];
            const goals = generateInitialGoalsForResponse(child);
            
            res.status(201).json({
              success: true,
              message: '儿童档案创建成功',
              child: {
                id: childId,
                nickname: data.nickname,
                birth_date: data.birth_date,
                diagnosis_type: data.diagnosis_type,
                avatar: child.avatar
              },
              initial_profile: {
                radar_data: {
                  communication: typeof data.communication_level === 'string' 
                    ? { 'none': 1, 'single_word': 2, 'phrase': 3, 'sentence': 4, 'fluent': 5 }[data.communication_level] || 1
                    : data.communication_level,
                  social: data.social_level || 1,
                  self_care: data.self_care_level || 1,
                  cognitive: data.cognitive_level || 1
                },
                sensory_summary: {
                  hearing: data.sensory_hearing,
                  visual: data.sensory_visual,
                  tactile: data.sensory_tactile,
                  vestibular: data.sensory_vestibular
                },
                reinforcers: data.reinforcers || [],
                ai_goals: goals
              }
            });
          });
        }
      );
    }
  );
});

router.get('/wizard/draft', auth, (req, res) => {
  db.query('SELECT * FROM child_profile_drafts WHERE user_id = ? ORDER BY updated_at DESC LIMIT 1',
    [req.user.id],
    (err, results) => {
      if (err) return res.status(500).json({ error: err.message });
      
      if (results.length === 0) {
        return res.json({ success: true, draft: null });
      }
      
      const draft = results[0];
      const hoursSinceUpdate = (new Date() - new Date(draft.updated_at)) / (1000 * 60 * 60);
      
      if (hoursSinceUpdate > 72) {
        db.query('DELETE FROM child_profile_drafts WHERE id = ?', [draft.id], () => {});
        return res.json({ success: true, draft: null });
      }
      
      res.json({
        success: true,
        draft: {
          id: draft.id,
          step: draft.step,
          data: JSON.parse(draft.data || '{}'),
          updated_at: draft.updated_at
        }
      });
    }
  );
});

router.post('/', auth, (req, res) => {
  const { 
    nickname, birth_date, diagnosis_type, diagnosis_other,
    communication_level, social_level, self_care_level, cognitive_level,
    sensory_hearing, sensory_visual, sensory_tactile, sensory_vestibular,
    reinforcers, medical_info
  } = req.body;
  
  if (!nickname || !birth_date || !diagnosis_type) {
    return res.status(400).json({ error: '请填写必填信息（昵称、出生日期、诊断类型）' });
  }
  if (String(nickname).trim().length > 40 || !validDate(birth_date) || !DIAGNOSIS_TYPES.has(diagnosis_type)) {
    return res.status(400).json({ error: '儿童档案字段无效' });
  }
  if ([communication_level, social_level, self_care_level, cognitive_level].some(value => !validLevel(value))) {
    return res.status(400).json({ error: '支持需要记录必须为1至5' });
  }
  
  db.query(
    'INSERT INTO children (user_id, nickname, birth_date, diagnosis_type, diagnosis_other, communication_level, social_level, self_care_level, cognitive_level, sensory_hearing, sensory_visual, sensory_tactile, sensory_vestibular, reinforcers, medical_info) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [
      req.user.id,
      nickname,
      birth_date,
      diagnosis_type,
      diagnosis_other || null,
      communication_level || 'none',
      social_level || 1,
      self_care_level || 1,
      cognitive_level || 1,
      sensory_hearing || 'normal',
      sensory_visual || 'normal',
      sensory_tactile || 'normal',
      sensory_vestibular || 'normal',
      JSON.stringify(reinforcers || []),
      medical_info || null
    ],
    (err, result) => {
      if (err) return res.status(500).json({ error: err.message });
      
      const childId = result.insertId;
      // 目标必须经共同确认，不按诊断或单次分数自动生成。
      
      res.status(201).json({
        success: true,
        message: '儿童档案创建成功',
        child: { id: childId, nickname, birth_date, diagnosis_type }
      });
    }
  );
});

function generateInitialGoalsForResponse() { return []; }

router.get('/', auth, (req, res) => {
  db.query('SELECT * FROM children WHERE user_id = ?', [req.user.id], (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    
    res.json({ success: true, children: results });
  });
});

router.param('id', (req, res, next, rawId) => {
  const id = Number(rawId);
  if (!Number.isInteger(id) || id < 1) return res.status(400).json({ error: '儿童编号无效' });
  db.query('SELECT id FROM children WHERE id = ? AND user_id = ?', [id, req.user.id], (err, rows) => {
    if (err) return res.status(500).json({ error: '儿童档案校验失败' });
    if (!rows?.length) return res.status(404).json({ error: '儿童档案不存在' });
    req.childId = id;
    next();
  });
});
router.get('/:id', auth, (req, res) => {
  db.query('SELECT * FROM children WHERE id = ? AND user_id = ?', [req.params.id, req.user.id], (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    
    if (results.length === 0) {
      return res.status(404).json({ error: '儿童档案不存在' });
    }
    
    const child = results[0];
    
    db.query('SELECT * FROM intervention_goals WHERE child_id = ?', [child.id], (err, goals) => {
      if (err) return res.status(500).json({ error: err.message });
      
      res.json({ 
        success: true, 
        child: {
          ...child,
          reinforcers: JSON.parse(child.reinforcers || '[]'),
          goals
        } 
      });
    });
  });
});

router.put('/:id', auth, (req, res) => {
  const { 
    nickname, birth_date, diagnosis_type, diagnosis_other,
    communication_level, social_level, self_care_level, cognitive_level,
    sensory_hearing, sensory_visual, sensory_tactile, sensory_vestibular,
    reinforcers, medical_info
  } = req.body;
  
  db.query(
    'UPDATE children SET nickname = ?, birth_date = ?, diagnosis_type = ?, diagnosis_other = ?, communication_level = ?, social_level = ?, self_care_level = ?, cognitive_level = ?, sensory_hearing = ?, sensory_visual = ?, sensory_tactile = ?, sensory_vestibular = ?, reinforcers = ?, medical_info = ? WHERE id = ? AND user_id = ?',
    [
      nickname,
      birth_date,
      diagnosis_type,
      diagnosis_other || null,
      communication_level,
      social_level,
      self_care_level,
      cognitive_level,
      sensory_hearing,
      sensory_visual,
      sensory_tactile,
      sensory_vestibular,
      JSON.stringify(reinforcers || []),
      medical_info || null,
      req.params.id,
      req.user.id
    ],
    (err) => {
      if (err) return res.status(500).json({ error: err.message });
      
      res.json({ success: true, message: '儿童档案更新成功' });
    }
  );
});

router.delete('/:id', auth, (req, res) => {
  db.query('DELETE FROM children WHERE id = ? AND user_id = ?', [req.params.id, req.user.id], (err) => {
    if (err) return res.status(500).json({ error: err.message });
    
    res.json({ success: true, message: '儿童档案删除成功' });
  });
});

router.get('/:id/goals', auth, (req, res) => {
  db.query('SELECT * FROM intervention_goals WHERE child_id = ? ORDER BY created_at DESC', [req.params.id], (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    
    res.json({ success: true, goals: results });
  });
});

router.post('/:id/goals', auth, (req, res) => {
  const { goal_type, description, target_date } = req.body;
  
  if (!goal_type || !description) {
    return res.status(400).json({ error: '请填写目标类型和描述' });
  }
  
  db.query(
    'INSERT INTO intervention_goals (child_id, goal_type, description, target_date) VALUES (?, ?, ?, ?)',
    [req.params.id, goal_type, description, target_date || null],
    (err, result) => {
      if (err) return res.status(500).json({ error: err.message });
      
      res.status(201).json({
        success: true,
        message: '干预目标创建成功',
        goal: { id: result.insertId, goal_type, description, target_date }
      });
    }
  );
});

router.put('/:id/goals/:goalId', auth, (req, res) => {
  const { goal_type, description, target_date, status, progress } = req.body;
  
  db.query(
    'UPDATE intervention_goals SET goal_type = ?, description = ?, target_date = ?, status = ?, progress = ? WHERE id = ? AND child_id = ?',
    [goal_type, description, target_date, status, progress, req.params.goalId, req.params.id],
    (err) => {
      if (err) return res.status(500).json({ error: err.message });
      
      res.json({ success: true, message: '干预目标更新成功' });
    }
  );
});

router.delete('/:id/goals/:goalId', auth, (req, res) => {
  db.query('DELETE FROM intervention_goals WHERE id = ? AND child_id = ?', [req.params.goalId, req.params.id], (err) => {
    if (err) return res.status(500).json({ error: err.message });
    
    res.json({ success: true, message: '干预目标删除成功' });
  });
});

router.get('/:id/capacity-radar', auth, (req, res) => {
  db.query('SELECT communication_level, social_level, self_care_level, cognitive_level FROM children WHERE id = ?', [req.params.id], (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    
    if (results.length === 0) {
      return res.status(404).json({ error: '儿童档案不存在' });
    }
    
    const child = results[0];
    const levelMap = { 'none': 1, 'single_word': 2, 'phrase': 3, 'sentence': 4, 'fluent': 5 };
    
    res.json({
      success: true,
      radarData: {
        communication: typeof child.communication_level === 'string' ? levelMap[child.communication_level] || 1 : child.communication_level,
        social: child.social_level || 1,
        self_care: child.self_care_level || 1,
        cognitive: child.cognitive_level || 1
      }
    });
  });
});

function generateInitialGoals() { return []; }

module.exports = router;
