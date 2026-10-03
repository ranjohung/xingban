const express = require('express');
const router = express.Router();
const db = require('../config/db');
const auth = require('../middleware/auth');

const careerMilestones = [
  { id: 1, stage: 'understanding', title: '了解情况与建立支持', age_range: '按家庭需要', description: '理解孩子的沟通方式、感官需要、兴趣和压力信号', icon: '🧭' },
  { id: 2, stage: 'early_support', title: '早期支持', age_range: '按发展阶段', description: '以安全、关系和日常参与为中心共同确定支持', icon: '🌱' },
  { id: 3, stage: 'preschool', title: '学前适应', age_range: '入园前后', description: '准备环境调整、沟通支持和渐进适应方案', icon: '🏫' },
  { id: 4, stage: 'school_age', title: '学龄支持', age_range: '在校阶段', description: '共同复核学习、同伴、感官与合理便利', icon: '📚' },
  { id: 5, stage: 'adolescence', title: '青春期支持', age_range: '青春期', description: '支持自我认同、身体界限、情绪和选择表达', icon: '🎯' },
  { id: 6, stage: 'transition', title: '成年过渡', age_range: '转衔阶段', description: '探索本人愿意尝试的生活、学习、社区和工作活动', icon: '🌉' },
  { id: 7, stage: 'adult', title: '成年生活', age_range: '持续复核', description: '围绕本人意愿调整决策、居住、健康和参与支持', icon: '🏠' }
];

const milestoneAchievements = [
  { id: 1, milestone_id: 1, title: '找到可靠的表达方式', category: 'communication', description: '孩子能用自己舒适的方式表达需要、同意或拒绝' },
  { id: 2, milestone_id: 2, title: '完成一次舒适的共同活动', category: 'participation', description: '在尊重节奏与退出权的前提下参与家庭活动' },
  { id: 3, milestone_id: 3, title: '确认一项有效环境调整', category: 'environment', description: '找到能降低压力、增加安全感的环境支持' },
  { id: 4, milestone_id: 4, title: '参与制定学习支持', category: 'learning', description: '孩子用适合自己的方式表达学习偏好与困难' },
  { id: 5, milestone_id: 5, title: '表达个人边界', category: 'safety', description: '孩子能表达不舒服、暂停或寻求可信成人帮助' },
  { id: 6, milestone_id: 6, title: '尝试一项感兴趣的社会活动', category: 'community', description: '通过低风险体验了解偏好和所需支持' },
  { id: 7, milestone_id: 7, title: '共同复核成年生活选择', category: 'choice', description: '本人参与讨论居住、活动、健康和决策支持' }
];

const GOAL_CATEGORIES = new Set(['skill', 'social', 'career', 'education', 'life', 'self_care', 'learning']);
const clean = (value, max) => typeof value === 'string' ? value.trim().slice(0, max) : '';
const requestId = value => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || '').trim()) ? String(value).trim() : '';

// 参数归属校验依赖 req.user，必须先完成鉴权。
router.use(auth);

router.param('childId', (req, res, next, childId) => {
  const id = Number.parseInt(childId, 10);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: '儿童编号无效' });
  db.query('SELECT id FROM children WHERE id = ? AND user_id = ?', [id, req.user.id], (err, rows) => {
    if (err) return res.status(500).json({ error: '暂时无法核验儿童档案' });
    if (!rows.length) return res.status(404).json({ error: '儿童档案不存在' });
    req.childId = id;
    next();
  });
});
router.get('/timeline', auth, (req, res) => {
  res.json({
    success: true,
    milestones: careerMilestones
  });
});

router.get('/milestones/:childId', auth, (req, res) => {
  db.query('SELECT * FROM career_milestones WHERE child_id = ? ORDER BY created_at DESC',
    [req.childId],
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
  const clientRequestId = requestId(req.body.client_request_id);
  
  if (!milestone_id || !title || !clientRequestId) {
    return res.status(400).json({ error: '请填写里程碑ID和标题' });
  }
  
  const replay = () => db.query('SELECT id,milestone_id,title,description,created_at FROM career_milestones WHERE child_id=? AND client_request_id=?', [req.childId, clientRequestId], (readErr, rows) => readErr || !rows.length ? res.status(500).json({ error: '里程碑保存状态暂时无法确认，请保留页面后重试' }) : res.json({ success: true, replayed: true, achievement: rows[0] }));
  const create = () => db.query(
    'INSERT INTO career_milestones (child_id, client_request_id, milestone_id, title, description, story, photo_url) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [req.childId, clientRequestId, milestone_id, clean(title, 100), clean(description, 2000), clean(story, 5000), photo_url || null],
    (err, result) => {
      if (err?.code === 'ER_DUP_ENTRY') return replay();
      if (err) return res.status(500).json({ error: '里程碑暂时无法保存' });
      
      res.status(201).json({
        success: true,
        message: '里程碑记录成功',
        achievement: { id: result.insertId, milestone_id, title }
      });
    }
  );
  db.query('SELECT id FROM career_milestones WHERE child_id=? AND client_request_id=?', [req.childId, clientRequestId], (err, rows) => err ? res.status(500).json({ error: '里程碑保存状态暂时无法确认' }) : rows.length ? replay() : create());
});

router.delete('/milestones/:childId/:achievementId', auth, (req, res) => {
  db.query('DELETE FROM career_milestones WHERE id = ? AND child_id = ?',
    [req.params.achievementId, req.childId],
    (err) => {
      if (err) return res.status(500).json({ error: err.message });
      
      res.json({ success: true, message: '里程碑记录删除成功' });
    }
  );
});

router.get('/goals/:childId', auth, (req, res) => {
  db.query('SELECT * FROM career_goals WHERE child_id = ? ORDER BY priority DESC',
    [req.childId],
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
  const clientRequestId = requestId(req.body.client_request_id);
  
  if (!GOAL_CATEGORIES.has(category) || !title || !clientRequestId) {
    return res.status(400).json({ error: '请填写目标类别和标题' });
  }
  
  const steps = generateGoalSteps(category, title);
  
  const replay = () => db.query('SELECT id,category,title,description,target_date,priority,steps,progress FROM career_goals WHERE child_id=? AND client_request_id=?', [req.childId, clientRequestId], (readErr, rows) => readErr || !rows.length ? res.status(500).json({ error: '目标保存状态暂时无法确认，请保留页面后重试' }) : res.json({ success: true, replayed: true, goal: rows[0] }));
  const create = () => db.query(
    'INSERT INTO career_goals (child_id, client_request_id, category, title, description, target_date, priority, steps) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [req.childId, clientRequestId, category, clean(title, 80), clean(description, 2000), target_date || null, priority || 1, JSON.stringify(steps)],
    (err, result) => {
      if (err?.code === 'ER_DUP_ENTRY') return replay();
      if (err) return res.status(500).json({ error: '目标暂时无法保存' });
      
      res.status(201).json({
        success: true,
        message: '生涯目标创建成功',
        goal: { id: result.insertId, category, title, steps }
      });
    }
  );
  db.query('SELECT id FROM career_goals WHERE child_id=? AND client_request_id=?', [req.childId, clientRequestId], (err, rows) => err ? res.status(500).json({ error: '目标保存状态暂时无法确认' }) : rows.length ? replay() : create());
});

router.put('/goals/:childId/:goalId', auth, (req, res) => {
  const goalId = Number.parseInt(req.params.goalId, 10);
  if (!Number.isInteger(goalId) || goalId <= 0) return res.status(400).json({ error: '目标编号无效' });
  db.query('SELECT * FROM career_goals WHERE child_id = ? ORDER BY priority DESC', [req.childId], (findErr, goals) => {
    if (findErr) return res.status(500).json({ error: '目标暂时无法读取' });
    const existing = goals.find(item => Number(item.id) === goalId);
    if (!existing) return res.status(404).json({ error: '目标不存在' });
    const category = GOAL_CATEGORIES.has(req.body.category) ? req.body.category : existing.category;
    const title = req.body.title === undefined ? existing.title : clean(req.body.title, 80);
    if (!title) return res.status(400).json({ error: '目标名称不能为空' });
    const description = req.body.description === undefined ? existing.description : clean(req.body.description, 1000);
    const targetDate = req.body.target_date === undefined ? existing.target_date : req.body.target_date || null;
    const priority = Number.isFinite(Number(req.body.priority)) ? Math.min(5, Math.max(1, Number(req.body.priority))) : existing.priority;
    let existingSteps = existing.steps || [];
    if (typeof existingSteps === 'string') { try { existingSteps = JSON.parse(existingSteps || '[]'); } catch (_) { existingSteps = []; } }
    const steps = Array.isArray(req.body.steps) ? req.body.steps.slice(0, 20) : existingSteps;
    const progress = Number.isFinite(Number(req.body.progress)) ? Math.min(100, Math.max(0, Number(req.body.progress))) : Number(existing.progress || 0);
    db.query(
      'UPDATE career_goals SET category = ?, title = ?, description = ?, target_date = ?, priority = ?, steps = ?, progress = ? WHERE id = ? AND child_id = ?',
      [category, title, description, targetDate, priority, JSON.stringify(steps), progress, goalId, req.childId],
      err => err ? res.status(500).json({ error: '目标暂时无法更新' }) : res.json({ success: true, message: '生涯目标更新成功' })
    );
  });
});

router.delete('/goals/:childId/:goalId', auth, (req, res) => {
  db.query('DELETE FROM career_goals WHERE id = ? AND child_id = ?',
    [req.params.goalId, req.childId],
    (err) => {
      if (err) return res.status(500).json({ error: err.message });
      
      res.json({ success: true, message: '生涯目标删除成功' });
    }
  );
});

router.post('/simulator', auth, (req, res) => {
  const childId = Number.parseInt(req.body.childId, 10);
  const supportLevel = ['light', 'regular', 'intensive'].includes(req.body.support_level) ? req.body.support_level : 'regular';
  const allowedDomains = new Set(['communication', 'daily_living', 'learning', 'community']);
  const focusDomains = Array.isArray(req.body.focus_domains) ? [...new Set(req.body.focus_domains.filter(item => allowedDomains.has(item)))].slice(0, 4) : [];
  if (!Number.isInteger(childId) || childId <= 0 || !focusDomains.length) return res.status(400).json({ error: '请选择儿童档案和至少一个支持方向' });
  
  db.query('SELECT * FROM children WHERE id = ? AND user_id = ?',
    [childId, req.user.id],
    (err, results) => {
      if (err) return res.status(500).json({ error: err.message });
      if (results.length === 0) {
        return res.status(404).json({ error: '儿童档案不存在' });
      }
      
      res.json({
        success: true,
        disclaimer: '这是讨论清单，不预测孩子未来能力、教育、居住或就业结果，也不替代专业评估。',
        support_plan: buildSupportPlan(focusDomains, supportLevel)
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
      { step: 4, description: '复核意愿、适配程度和所需支持', completed: false }
    ]
  };
  
  return stepTemplates[category] || [
    { step: 1, description: '制定行动计划', completed: false },
    { step: 2, description: '逐步实施', completed: false },
    { step: 3, description: '评估调整', completed: false },
    { step: 4, description: '达成目标', completed: false }
  ];
}

function buildSupportPlan(focusDomains, supportLevel) {
  const domainMap = {
    communication: { title: '沟通与表达', questions: ['孩子最容易使用哪种表达方式？', '哪些环境会让表达更困难？', '怎样让孩子能明确表示同意、拒绝或暂停？'] },
    daily_living: { title: '日常生活参与', questions: ['孩子希望参与哪一项日常活动？', '任务可以拆成哪一个最小步骤？', '需要视觉提示、示范、陪同还是环境调整？'] },
    learning: { title: '学习与环境适配', questions: ['孩子当前感兴趣并愿意尝试什么？', '噪声、光线、时间或任务长度需要怎样调整？', '怎样记录“更舒适、更愿意参与”而不只看完成率？'] },
    community: { title: '社区与成年过渡', questions: ['孩子希望接触哪些场所、活动或角色？', '出行、安全、决策和求助需要哪些支持？', '当地有哪些资源需要向主管部门或专业人员核验？'] }
  };
  const levelLabels = { light: '少量提醒或环境调整', regular: '持续协助与定期复核', intensive: '密集协助与跨专业协调' };
  return {
    support_level: supportLevel,
    support_level_label: levelLabels[supportLevel],
    domains: focusDomains.map(key => ({ key, ...domainMap[key] })),
    review_rule: '先征求孩子意见，只选择一项可逆、低风险的小步骤；记录孩子的舒适度和拒绝信号，1至2周后共同复核，出现明显痛苦立即暂停。'
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
