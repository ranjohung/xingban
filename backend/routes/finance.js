const express = require('express');
const router = express.Router();
const db = require('../config/db');
const auth = require('../middleware/auth');

const subsidyTemplates = [
  { id: 1, name: '残疾人补贴', type: 'monthly', amount: '150-500', conditions: '持有残疾人证', deadline: '每年12月', application_url: '#', materials: ['残疾人证', '身份证', '户口本'] },
  { id: 2, name: '康复训练补贴', type: 'quarterly', amount: '3000-5000', conditions: '在定点机构接受康复训练', deadline: '每季度末', application_url: '#', materials: ['康复训练证明', '缴费凭证', '诊断证明'] },
  { id: 3, name: '教育资助', type: 'yearly', amount: '2000-10000', conditions: '在校学生', deadline: '每年9月', application_url: '#', materials: ['学籍证明', '家庭收入证明', '诊断证明'] },
  { id: 4, name: '医疗救助', type: 'monthly', amount: '实报实销', conditions: '医疗费用超过一定金额', deadline: '每月15日', application_url: '#', materials: ['医疗发票', '费用明细', '诊断证明'] },
  { id: 5, name: '就业扶持', type: 'one_time', amount: '5000-10000', conditions: '首次就业', deadline: '随时', application_url: '#', materials: ['劳动合同', '就业证明'] }
];

const fraudCases = [
  { id: 1, title: '虚假康复机构诈骗', type: '机构', description: '声称有特殊疗法可以治愈自闭症，收取高额费用', location: '全国', reported_at: '2026-07-10', verified: true },
  { id: 2, title: '保健品虚假宣传', type: 'product', description: '推销声称能改善自闭症症状的保健品，无科学依据', location: '北京', reported_at: '2026-07-08', verified: true },
  { id: 3, title: '虚假公益捐款', type: 'donation', description: '假冒公益组织，以救助自闭症儿童为名骗取捐款', location: '上海', reported_at: '2026-07-05', verified: true },
  { id: 4, title: '培训课程诈骗', type: 'course', description: '承诺包过、包就业的虚假培训课程', location: '广东', reported_at: '2026-07-03', verified: false },
  { id: 5, title: '保险诈骗', type: 'insurance', description: '虚假保险产品，声称可以全额报销康复费用', location: '浙江', reported_at: '2026-07-01', verified: true }
];

const FINANCE_CATEGORIES = new Set(['康复训练', '医疗检查', '教育用品', '日常生活', '政府补贴', '其他']);
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
router.get('/expenses/:childId', auth, (req, res) => {
  db.query('SELECT * FROM financial_records WHERE user_id = ? AND child_id = ? ORDER BY date DESC',
    [req.user.id, req.childId],
    (err, results) => {
      if (err) return res.status(500).json({ error: err.message });
      
      const categoryTotals = {};
      results.forEach(record => {
        categoryTotals[record.category] = (categoryTotals[record.category] || 0) + record.amount;
      });
      
      res.json({
        success: true,
        records: results.map(item => ({ id: item.id, child_id: item.child_id, amount: item.amount, category: item.category, date: item.date, description: item.description, is_reimbursable: Boolean(item.is_reimbursable) })),
        category_totals: categoryTotals,
        total_amount: results.reduce((sum, r) => sum + r.amount, 0)
      });
    }
  );
});

router.post('/expenses/:childId', auth, (req, res) => {
  const { date, receipt_url, is_reimbursable, insurance_policy } = req.body;
  const amount = Number(req.body.amount);
  const category = FINANCE_CATEGORIES.has(req.body.category) ? req.body.category : '';
  const description = typeof (req.body.description ?? req.body.note) === 'string' ? (req.body.description ?? req.body.note).trim().slice(0, 300) : '';
  const clientRequestId = requestId(req.body.client_request_id);
  
  if (!Number.isFinite(amount) || amount === 0 || Math.abs(amount) > 100000000 || !category || !clientRequestId) {
    return res.status(400).json({ error: '请填写金额和类别' });
  }
  
  const replay = () => db.query('SELECT id,child_id,amount,category,date,description FROM financial_records WHERE user_id=? AND client_request_id=?', [req.user.id, clientRequestId], (readErr, rows) => readErr || !rows.length ? res.status(500).json({ error: '记账状态暂时无法确认，请保留页面后重试' }) : res.json({ success: true, replayed: true, record: rows[0] }));
  const create = () => db.query(
    'INSERT INTO financial_records (user_id, child_id, client_request_id, amount, category, date, description, receipt_url, is_reimbursable, insurance_policy) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [req.user.id, req.childId, clientRequestId, amount, category, date || new Date(), description || '', receipt_url || null, is_reimbursable || false, insurance_policy || null],
    (err, result) => {
      if (err?.code === 'ER_DUP_ENTRY') return replay();
      if (err) return res.status(500).json({ error: '记账暂时无法保存' });
      
      res.status(201).json({
        success: true,
        message: '记账成功',
        record: { id: result.insertId, amount, category }
      });
    }
  );
  db.query('SELECT id FROM financial_records WHERE user_id=? AND client_request_id=?', [req.user.id, clientRequestId], (err, rows) => err ? res.status(500).json({ error: '记账状态暂时无法确认' }) : rows.length ? replay() : create());
});

router.delete('/expenses/:childId/:recordId', auth, (req, res) => {
  db.query('DELETE FROM financial_records WHERE id = ? AND user_id = ? AND child_id = ?',
    [req.params.recordId, req.user.id, req.childId],
    (err) => {
      if (err) return res.status(500).json({ error: err.message });
      
      res.json({ success: true, message: '记账记录删除成功' });
    }
  );
});

router.get('/subsidies', auth, (req, res) => {
  db.query('SELECT * FROM user_subsidies WHERE user_id = ?',
    [req.user.id],
    (err, results) => {
      if (err) return res.status(500).json({ error: err.message });
      
      const userSubsidyIds = results.map(s => s.subsidy_id);
      const availableSubsidies = subsidyTemplates.map(s => ({
        ...s,
        followed: userSubsidyIds.includes(s.id),
        deadline_days: calculateDaysUntilDeadline(s.deadline)
      }));
      
      res.json({
        success: true,
        subsidies: availableSubsidies,
        disclaimer: '示例信息，未按地区、时间或个人资格核验，不能作为申领依据'
      });
    }
  );
});

router.post('/subsidies/follow/:subsidyId', auth, (req, res) => {
  const subsidyId = Number.parseInt(req.params.subsidyId, 10);
  if (!subsidyTemplates.some(item => item.id === subsidyId)) return res.status(404).json({ error: '补贴示例不存在' });
  db.query('SELECT * FROM user_subsidies WHERE user_id = ? AND subsidy_id = ?',
    [req.user.id, subsidyId],
    (err, results) => {
      if (err) return res.status(500).json({ error: err.message });
      
      if (results.length > 0) {
        return res.json({ success: true, replayed: true, followed: true, message: '该示例此前已关注；平台不会自动发送到期提醒' });
      }
      
      db.query('INSERT INTO user_subsidies (user_id, subsidy_id) VALUES (?, ?)',
        [req.user.id, subsidyId],
        (err) => {
          if (err) return res.status(500).json({ error: err.message });
          
          res.json({ success: true, replayed: false, followed: true, message: '关注状态已保存；平台不会自动发送到期提醒，请自行核验并记录日期' });
        }
      );
    }
  );
});

router.delete('/subsidies/unfollow/:subsidyId', auth, (req, res) => {
  const subsidyId = Number.parseInt(req.params.subsidyId, 10);
  if (!subsidyTemplates.some(item => item.id === subsidyId)) return res.status(404).json({ error: '补贴示例不存在' });
  db.query('DELETE FROM user_subsidies WHERE user_id = ? AND subsidy_id = ?',
    [req.user.id, subsidyId],
    (err) => {
      if (err) return res.status(500).json({ error: err.message });
      
      res.json({ success: true, followed: false, message: '已取消示例关注' });
    }
  );
});

router.get('/reimbursement/:childId', auth, (req, res) => {
  db.query('SELECT * FROM financial_records WHERE user_id = ? AND child_id = ? AND is_reimbursable = TRUE',
    [req.user.id, req.childId],
    (err, results) => {
      if (err) return res.status(500).json({ error: err.message });
      
      const totalReimbursable = results.reduce((sum, r) => sum + r.amount, 0);
      
      res.json({
        success: true,
        reimbursable_records: results.map(item => ({ id: item.id, child_id: item.child_id, amount: item.amount, category: item.category, date: item.date, description: item.description, is_reimbursable: Boolean(item.is_reimbursable) })),
        total_reimbursable: totalReimbursable,
        materials_checklist: ['发票原件', '费用明细', '诊断证明', '康复机构资质证明', '保险合同']
      });
    }
  );
});

router.get('/fraud-alerts', auth, (req, res) => {
  res.json({
    success: true,
    disclaimer: '演示案例，未连接正式监管或审核数据源',
    fraud_cases: fraudCases.map(item => ({ ...item, verified: false, source_status: '演示未核验' })).sort((a, b) => new Date(b.reported_at) - new Date(a.reported_at))
  });
});

router.post('/fraud-report', auth, (req, res) => {
  const title = typeof req.body.title === 'string' ? req.body.title.trim().slice(0, 100) : '';
  const description = typeof req.body.description === 'string' ? req.body.description.trim().slice(0, 1000) : '';
  const type = ['institution', 'product', 'donation', 'course', 'insurance', 'other'].includes(req.body.type) ? req.body.type : 'other';
  const location = typeof req.body.location === 'string' ? req.body.location.trim().slice(0, 100) : '';
  const clientRequestId = requestId(req.body.client_request_id);
  
  if (!title || !description || !clientRequestId) {
    return res.status(400).json({ error: '请填写标题和描述' });
  }
  
  const replay = () => db.query('SELECT id,title,type,description,location,status,created_at FROM fraud_reports WHERE user_id=? AND client_request_id=?', [req.user.id, clientRequestId], (readErr, rows) => readErr || !rows.length ? res.status(500).json({ error: '线索保存状态暂时无法确认，请保留页面后重试' }) : res.json({ success: true, replayed: true, service_connected: false, report: rows[0] }));
  const create = () => db.query(
    'INSERT INTO fraud_reports (user_id, client_request_id, title, type, description, location, evidence_url, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [req.user.id, clientRequestId, title, type, description, location, null, 'pending'],
    (err, result) => {
      if (err?.code === 'ER_DUP_ENTRY') return replay();
      if (err) return res.status(500).json({ error: '防骗线索暂时无法保存' });
      
      res.status(201).json({
        success: true,
        service_connected: false,
        message: '已保存为个人防骗线索；未发送给监管、警方或平台审核人员',
        report: { id: result.insertId, title, status: 'pending' }
      });
    }
  );
  db.query('SELECT id FROM fraud_reports WHERE user_id=? AND client_request_id=?', [req.user.id, clientRequestId], (err, rows) => err ? res.status(500).json({ error: '线索保存状态暂时无法确认' }) : rows.length ? replay() : create());
});

router.get('/fraud-reports', auth, (req, res) => {
  db.query('SELECT * FROM fraud_reports WHERE user_id = ? ORDER BY created_at DESC',
    [req.user.id],
    (err, results) => {
      if (err) return res.status(500).json({ error: err.message });
      
      res.json({
        success: true,
        reports: results
      });
    }
  );
});

function calculateDaysUntilDeadline(deadline) {
  if (deadline === '随时') return -1;
  
  const now = new Date();
  let targetDate;
  
  const annualMonth = deadline.match(/^每年(\d{1,2})月$/);
  if (annualMonth) {
    const month = Number(annualMonth[1]);
    if (month < 1 || month > 12) return -1;
    targetDate = new Date(now.getFullYear(), month - 1, 15);
    if (targetDate < now) {
      targetDate = new Date(now.getFullYear() + 1, month - 1, 15);
    }
  } else if (deadline.includes('季度')) {
    const quarter = Math.ceil((now.getMonth() + 1) / 3);
    const lastMonthOfQuarter = quarter * 3;
    targetDate = new Date(now.getFullYear(), lastMonthOfQuarter - 1, 30);
    if (targetDate < now) {
      targetDate = new Date(now.getFullYear() + 1, lastMonthOfQuarter - 1, 30);
    }
  } else {
    return -1;
  }
  
  const diffTime = targetDate - now;
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

module.exports = router;
