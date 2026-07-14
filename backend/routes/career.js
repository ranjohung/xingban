const express = require('express');
const router = express.Router();
const db = require('../config/db');
const auth = require('../middleware/auth');

const careerMilestones = [
  { id: 1, stage: 'diagnosis', title: '确诊初期', age_range: '0-3岁', description: '接受诊断，了解自闭症相关知识', icon: '🏥' },
  { id: 2, stage: 'early_intervention', title: '早期干预', age_range: '3-6岁', description: '开始专业康复训练，建立干预计划', icon: '👶' },
  { id: 3, stage: 'preschool', title: '学前阶段', age_range: '4-6岁', description: '准备进入幼儿园，学习社交规则', icon: '🏫' },
  { id: 4, stage: 'school_age', title: '学龄期', age_range: '6-12岁', description: '融入小学，学习学科知识', icon: '📚' },
  { id: 5, stage: 'adolescence', title: '青春期', age_range: '12-18岁', description: '自我认同，职业探索', icon: '🎯' },
  { id: 6, stage: 'young_adult', title: '青年期', age_range: '18-25岁', description: '独立生活，就业准备', icon: '💼' },
  { id: 7, stage: 'adult', title: '成年期', age_range: '25岁+', description: '稳定生活，长期规划', icon: '🏠' }
];

const milestoneAchievements = [
  { id: 1, milestone_id: 1, title: '第一次眼神交流', category: 'social', description: '孩子主动与家人进行眼神交流' },
  { id: 2, milestone_id: 1, title: '说出第一个有意义的词', category: 'communication', description: '孩子说出第一个有意义的词汇' },
  { id: 3, milestone_id: 2, title: '独立完成如厕', category: 'self_care', description: '孩子能够独立完成如厕流程' },
  { id: 4, milestone_id: 2, title: '使用图片卡表达需求', category: 'communication', description: '孩子学会使用图片卡表达基本需求' },
  { id: 5, milestone_id: 3, title: '在幼儿园待满一天', category: 'social', description: '孩子能够在幼儿园度过完整的一天' },
  { id: 6, milestone_id: 3, title: '与同伴分享玩具', category: 'social', description: '孩子主动与同伴分享玩具' },
  { id: 7, milestone_id: 4, title: '独立完成作业', category: 'learning', description: '孩子能够独立完成家庭作业' },
  { id: 8, milestone_id: 4, title: '主动打招呼', category: 'social', description: '孩子主动向老师或同学打招呼' },
  { id: 9, milestone_id: 5, title: '参与班级活动', category: 'social', description: '孩子主动参与班级集体活动' },
  { id: 10, milestone_id: 5, title: '表达个人喜好', category: 'communication', description: '孩子能够清晰表达自己的喜好' },
  { id: 11, milestone_id: 6, title: '兼职工作', category: 'career', description: '孩子获得第一份兼职工作' },
  { id: 12, milestone_id: 6, title: '独立出行', category: 'self_care', description: '孩子能够独立乘坐公共交通工具' },
  { id: 13, milestone_id: 7, title: '稳定就业', category: 'career', description: '孩子获得稳定的全职工作' },
  { id: 14, milestone_id: 7, title: '独立居住', category: 'self_care', description: '孩子能够独立居住生活' }
];

router.get('/timeline', auth, (req, res) => {
  res.json({
    success: true,
    milestones: careerMilestones
  });
});

router.get('/milestones/:childId', auth, (req, res) => {
  db.query('SELECT * FROM career_milestones WHERE child_id = ? ORDER BY created_at DESC',
    [req.params.childId],
    (err, results) => {
      if (err) return res.status(500).json({ error: err.message });
      
      res.json({
        success: true,
        achievements: results
      });
    }
  );
});

router.post('/milestones/:childId', auth, (req, res) => {
  const { milestone_id, title, description, story, photo_url } = req.body;
  
  if (!milestone_id || !title) {
    return res.status(400).json({ error: '请填写里程碑ID和标题' });
  }
  
  db.query(
    'INSERT INTO career_milestones (child_id, milestone_id, title, description, story, photo_url) VALUES (?, ?, ?, ?, ?, ?)',
    [req.params.childId, milestone_id, title, description || '', story || '', photo_url || null],
    (err, result) => {
      if (err) return res.status(500).json({ error: err.message });
      
      res.status(201).json({
        success: true,
        message: '里程碑记录成功',
        achievement: { id: result.insertId, milestone_id, title }
      });
    }
  );
});

router.delete('/milestones/:childId/:achievementId', auth, (req, res) => {
  db.query('DELETE FROM career_milestones WHERE id = ? AND child_id = ?',
    [req.params.achievementId, req.params.childId],
    (err) => {
      if (err) return res.status(500).json({ error: err.message });
      
      res.json({ success: true, message: '里程碑记录删除成功' });
    }
  );
});

router.get('/goals/:childId', auth, (req, res) => {
  db.query('SELECT * FROM career_goals WHERE child_id = ? ORDER BY priority DESC',
    [req.params.childId],
    (err, results) => {
      if (err) return res.status(500).json({ error: err.message });
      
      res.json({
        success: true,
        goals: results
      });
    }
  );
});

router.post('/goals/:childId', auth, (req, res) => {
  const { category, title, description, target_date, priority } = req.body;
  
  if (!category || !title) {
    return res.status(400).json({ error: '请填写目标类别和标题' });
  }
  
  const steps = generateGoalSteps(category, title);
  
  db.query(
    'INSERT INTO career_goals (child_id, category, title, description, target_date, priority, steps) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [req.params.childId, category, title, description || '', target_date || null, priority || 1, JSON.stringify(steps)],
    (err, result) => {
      if (err) return res.status(500).json({ error: err.message });
      
      res.status(201).json({
        success: true,
        message: '生涯目标创建成功',
        goal: { id: result.insertId, category, title, steps }
      });
    }
  );
});

router.put('/goals/:childId/:goalId', auth, (req, res) => {
  const { category, title, description, target_date, priority, steps, progress } = req.body;
  
  db.query(
    'UPDATE career_goals SET category = ?, title = ?, description = ?, target_date = ?, priority = ?, steps = ?, progress = ? WHERE id = ? AND child_id = ?',
    [category, title, description, target_date, priority, JSON.stringify(steps), progress, req.params.goalId, req.params.childId],
    (err) => {
      if (err) return res.status(500).json({ error: err.message });
      
      res.json({ success: true, message: '生涯目标更新成功' });
    }
  );
});

router.delete('/goals/:childId/:goalId', auth, (req, res) => {
  db.query('DELETE FROM career_goals WHERE id = ? AND child_id = ?',
    [req.params.goalId, req.params.childId],
    (err) => {
      if (err) return res.status(500).json({ error: err.message });
      
      res.json({ success: true, message: '生涯目标删除成功' });
    }
  );
});

router.post('/simulator', auth, (req, res) => {
  const { childId, current_capacity, support_level } = req.body;
  
  db.query('SELECT * FROM children WHERE id = ? AND user_id = ?',
    [childId, req.user.id],
    (err, results) => {
      if (err) return res.status(500).json({ error: err.message });
      if (results.length === 0) {
        return res.status(404).json({ error: '儿童档案不存在' });
      }
      
      const child = results[0];
      const simulation = generateSimulation(child, current_capacity, support_level);
      
      res.json({
        success: true,
        disclaimer: '本模拟仅供参考，实际发展受多种因素影响',
        simulation
      });
    }
  );
});

router.get('/legal-guide', auth, (req, res) => {
  const legalSteps = [
    {
      step: 1,
      question: '如果发生意外，你希望谁临时照顾孩子？',
      options: ['配偶', '父母', '其他亲友'],
      resources: ['《未成年人保护法》', '临时监护协议模板']
    },
    {
      step: 2,
      question: '你是否已经指定了法定监护人？',
      options: ['是，已办理', '正在办理', '还没有'],
      resources: ['《民法典》监护制度', '监护人指定流程']
    },
    {
      step: 3,
      question: '你是否考虑过孩子成年后的监护安排？',
      options: ['已考虑并规划', '初步了解', '还未考虑'],
      resources: ['成年监护制度', '特殊需要信托']
    },
    {
      step: 4,
      question: '你是否了解特殊教育相关的法律权益？',
      options: ['了解较多', '知道一些', '不太清楚'],
      resources: ['《残疾人教育条例》', 'IEP个别化教育计划']
    }
  ];
  
  res.json({
    success: true,
    legal_steps: legalSteps
  });
});

function generateGoalSteps(category, title) {
  const stepTemplates = {
    'social': [
      { step: 1, description: '学习基础社交规则', completed: false },
      { step: 2, description: '练习与家人互动', completed: false },
      { step: 3, description: '尝试与同伴交流', completed: false },
      { step: 4, description: '参与集体活动', completed: false }
    ],
    'self_care': [
      { step: 1, description: '学习基础自理技能', completed: false },
      { step: 2, description: '在辅助下完成日常任务', completed: false },
      { step: 3, description: '独立完成简单任务', completed: false },
      { step: 4, description: '独立管理日常事务', completed: false }
    ],
    'learning': [
      { step: 1, description: '建立学习兴趣', completed: false },
      { step: 2, description: '学习基础知识', completed: false },
      { step: 3, description: '培养学习习惯', completed: false },
      { step: 4, description: '自主学习能力', completed: false }
    ],
    'career': [
      { step: 1, description: '探索职业兴趣', completed: false },
      { step: 2, description: '学习职业技能', completed: false },
      { step: 3, description: '实习或兼职体验', completed: false },
      { step: 4, description: '稳定就业', completed: false }
    ]
  };
  
  return stepTemplates[category] || [
    { step: 1, description: '制定行动计划', completed: false },
    { step: 2, description: '逐步实施', completed: false },
    { step: 3, description: '评估调整', completed: false },
    { step: 4, description: '达成目标', completed: false }
  ];
}

function generateSimulation(child, current_capacity, support_level) {
  const levels = ['basic', 'medium', 'comprehensive'];
  const levelNames = {
    basic: '基础支持',
    medium: '中等支持',
    comprehensive: '全面支持'
  };
  
  const scenarios = {
    basic: {
      living: '在家人支持下生活，日常活动需要家人协助，居住在家庭环境中',
      social: '与家人有良好互动，能够参与简单的家庭社交活动',
      career: '可能从事简单的家务劳动或庇护性就业，收入较低',
      education: '完成九年义务教育，可能接受职业教育',
      case_study: '小明在家人的精心照顾下，学会了基本的生活自理，每天帮助家人做一些简单的家务'
    },
    medium: {
      living: '能够在社区支持下独立生活，定期有社工或康复师上门指导',
      social: '能够参与社区活动，有固定的朋友，社交范围逐渐扩大',
      career: '可以从事庇护性就业或支持性就业，有一定的收入来源',
      education: '完成义务教育，接受职业培训，掌握一技之长',
      case_study: '小红通过社区支持，学会了独立乘坐公交车，现在在一家面包店做包装工作'
    },
    comprehensive: {
      living: '能够独立居住生活，有专业团队提供定期支持和指导',
      social: '能够主动社交，参与社会活动，有良好的社交网络',
      career: '可以从事竞争性就业，实现经济独立',
      education: '完成高等教育或专业培训，具备专业技能',
      case_study: '小华通过多年的专业干预和支持，成功考入大学，现在从事计算机相关工作'
    }
  };
  
  return {
    current_status: {
      diagnosis: child.diagnosis_type,
      age: calculateAge(child.birth_date),
      capacity: current_capacity || {
        communication: child.communication_level,
        social: child.social_level,
        self_care: child.self_care_level,
        cognitive: child.cognitive_level
      }
    },
    scenarios: levels.map(level => ({
      level,
      name: levelNames[level],
      ...scenarios[level]
    })),
    recommended_support: levelNames[support_level || 'medium'],
    key_factors: [
      '早期干预的持续性和专业性',
      '家庭支持系统的健全程度',
      '社区和社会资源的可及性',
      '孩子自身的能力和潜力',
      '教育和职业培训的机会'
    ]
  };
}

function calculateAge(birthDate) {
  const birth = new Date(birthDate);
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  if (now.getMonth() < birth.getMonth() || 
      (now.getMonth() === birth.getMonth() && now.getDate() < birth.getDate())) {
    age--;
  }
  return age;
}

module.exports = router;