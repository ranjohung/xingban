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

router.get('/expenses/:childId', auth, (req, res) => {
  db.query('SELECT * FROM financial_records WHERE user_id = ? AND child_id = ? ORDER BY date DESC',
    [req.user.id, req.params.childId],
    (err, results) => {
      if (err) return res.status(500).json({ error: err.message });
      
      const categoryTotals = {};
      results.forEach(record => {
        categoryTotals[record.category] = (categoryTotals[record.category] || 0) + record.amount;
      });
      
      res.json({
        success: true,
        records: results,
        category_totals: categoryTotals,
        total_amount: results.reduce((sum, r) => sum + r.amount, 0)
      });
    }
  );
});

router.post('/expenses/:childId', auth, (req, res) => {
  const { amount, category, date, description, receipt_url, is_reimbursable, insurance_policy } = req.body;
  
  if (!amount || !category) {
    return res.status(400).json({ error: '请填写金额和类别' });
  }
  
  db.query(
    'INSERT INTO financial_records (user_id, child_id, amount, category, date, description, receipt_url, is_reimbursable, insurance_policy) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [req.user.id, req.params.childId, amount, category, date || new Date(), description || '', receipt_url || null, is_reimbursable || false, insurance_policy || null],
    (err, result) => {
      if (err) return res.status(500).json({ error: err.message });
      
      res.status(201).json({
        success: true,
        message: '记账成功',
        record: { id: result.insertId, amount, category }
      });
    }
  );
});

router.delete('/expenses/:childId/:recordId', auth, (req, res) => {
  db.query('DELETE FROM financial_records WHERE id = ? AND user_id = ? AND child_id = ?',
    [req.params.recordId, req.user.id, req.params.childId],
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
        subsidies: availableSubsidies
      });
    }
  );
});

router.post('/subsidies/follow/:subsidyId', auth, (req, res) => {
  db.query('SELECT * FROM user_subsidies WHERE user_id = ? AND subsidy_id = ?',
    [req.user.id, req.params.subsidyId],
    (err, results) => {
      if (err) return res.status(500).json({ error: err.message });
      
      if (results.length > 0) {
        return res.status(400).json({ error: '已关注该补贴' });
      }
      
      db.query('INSERT INTO user_subsidies (user_id, subsidy_id) VALUES (?, ?)',
        [req.user.id, req.params.subsidyId],
        (err) => {
          if (err) return res.status(500).json({ error: err.message });
          
          res.json({ success: true, message: '关注成功，到期前将提醒您' });
        }
      );
    }
  );
});

router.delete('/subsidies/unfollow/:subsidyId', auth, (req, res) => {
  db.query('DELETE FROM user_subsidies WHERE user_id = ? AND subsidy_id = ?',
    [req.user.id, req.params.subsidyId],
    (err) => {
      if (err) return res.status(500).json({ error: err.message });
      
      res.json({ success: true, message: '已取消关注' });
    }
  );
});

router.get('/reimbursement/:childId', auth, (req, res) => {
  db.query('SELECT * FROM financial_records WHERE user_id = ? AND child_id = ? AND is_reimbursable = TRUE',
    [req.user.id, req.params.childId],
    (err, results) => {
      if (err) return res.status(500).json({ error: err.message });
      
      const totalReimbursable = results.reduce((sum, r) => sum + r.amount, 0);
      
      res.json({
        success: true,
        reimbursable_records: results,
        total_reimbursable: totalReimbursable,
        materials_checklist: ['发票原件', '费用明细', '诊断证明', '康复机构资质证明', '保险合同']
      });
    }
  );
});

router.get('/fraud-alerts', auth, (req, res) => {
  res.json({
    success: true,
    fraud_cases: fraudCases.sort((a, b) => new Date(b.reported_at) - new Date(a.reported_at))
  });
});

router.post('/fraud-report', auth, (req, res) => {
  const { title, type, description, location, evidence_url } = req.body;
  
  if (!title || !description) {
    return res.status(400).json({ error: '请填写标题和描述' });
  }
  
  db.query(
    'INSERT INTO fraud_reports (user_id, title, type, description, location, evidence_url, status) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [req.user.id, title, type || 'other', description, location || '', evidence_url || null, 'pending'],
    (err, result) => {
      if (err) return res.status(500).json({ error: err.message });
      
      res.status(201).json({
        success: true,
        message: '举报已提交，我们会在24小时内审核',
        report: { id: result.insertId, title, status: 'pending' }
      });
    }
  );
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
  
  if (deadline.includes('月')) {
    const month = parseInt(deadline.match(/(\d+)月/)[1]);
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
  } else if (deadline.includes('年')) {
    targetDate = new Date(now.getFullYear(), 8, 15);
    if (targetDate < now) {
      targetDate = new Date(now.getFullYear() + 1, 8, 15);
    }
  } else {
    return -1;
  }
  
  const diffTime = targetDate - now;
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

module.exports = router;