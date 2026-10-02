const express = require('express');
const router = express.Router();
const db = require('../config/db');
const auth = require('../middleware/auth');
const { requireRole } = require('../middleware/roles');
const { parseDbJson } = require('../utils/json');
const { runWeeklyReportCycle } = require('../services/weeklyReportScheduler');
const { writeAudit } = require('../services/audit');

router.param('childId', (req, res, next, childId) => {
  const id = Number.parseInt(childId, 10);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: '儿童编号无效' });
  db.query('SELECT id FROM children WHERE id = ? AND user_id = ?', [id, req.user.id], (err, rows) => {
    if (err) return res.status(500).json({ error: '周报服务暂时不可用' });
    if (!rows.length) return res.status(404).json({ error: '儿童档案不存在' });
    next();
  });
});

// 必须放在 `/:childId/:reportId` 之前，避免 Express 将 `share` 误当作儿童编号。
router.get('/share/:token', (req, res) => {
  res.status(410).json({ error: '匿名周报链接已停用，请由已核验的专业人员登录后按授权范围查看' });
});
router.post('/share/:token/comment', (req, res) => {
  res.status(410).json({ error: '匿名评论已停用，请登录已核验的专业账号后操作' });
});

// 其余周报接口全部要求登录，确保 router.param 能拿到 req.user 做儿童归属核验。
router.use(auth);

router.get('/admin/jobs', requireRole('admin'), (req, res) => {
  const status = String(req.query.status || 'failed');
  if (!['pending','processing','retry','succeeded','failed'].includes(status)) return res.status(400).json({ error: '任务状态无效' });
  db.query(`SELECT j.id,j.child_id,j.user_id,j.week_start,j.week_end,j.status,j.attempt_count,j.next_attempt_at,
    j.report_id,j.notification_status,j.last_error,j.started_at,j.completed_at,j.updated_at
    FROM weekly_report_jobs j WHERE j.status=? ORDER BY j.updated_at DESC LIMIT 200`, [status], (error, rows) => error
      ? res.status(500).json({ error: '读取周报任务失败' })
      : res.json({ success: true, jobs: rows }));
});

router.post('/admin/jobs/run', requireRole('admin'), async (req, res, next) => {
  try {
    const result = await runWeeklyReportCycle();
    writeAudit(req, 'weekly_report_jobs_run', 'weekly_report_job', 'batch', 'success', result);
    res.json({ success: true, ...result });
  } catch (error) { next(error); }
});

router.patch('/admin/jobs/:jobId/retry', requireRole('admin'), (req, res) => {
  const id = Number(req.params.jobId);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: '任务编号无效' });
  db.query(`UPDATE weekly_report_jobs SET status='retry',next_attempt_at=NOW(),notification_status='pending',last_error=NULL
    WHERE id=? AND status='failed'`, [id], (error, result) => {
    if (error) return res.status(500).json({ error: '周报任务重试失败' });
    if (!result.affectedRows) return res.status(409).json({ error: '任务不存在或当前状态不可重试' });
    writeAudit(req, 'weekly_report_job_retry', 'weekly_report_job', String(id), 'success', { status: 'retry' });
    res.json({ success: true, status: 'retry' });
  });
});

router.post('/generate/:childId', auth, (req, res) => {
  const { week_start, week_end } = req.body;
  
  const startDate = week_start || getWeekStart();
  const endDate = week_end || getWeekEnd();
  
  db.query(`
    SELECT 
      COUNT(*) as total_records,
      SUM(CASE WHEN intensity_level = 'high' THEN 1 ELSE 0 END) as high_intensity_count,
      SUM(CASE WHEN intensity_level = 'medium' THEN 1 ELSE 0 END) as medium_intensity_count,
      SUM(CASE WHEN intensity_level = 'low' THEN 1 ELSE 0 END) as low_intensity_count
    FROM behavior_records 
    WHERE child_id = ? AND created_at >= ? AND created_at <= ?
  `, [req.params.childId, startDate, endDate], (err, recordStats) => {
    if (err) return res.status(500).json({ error: err.message });
    
    db.query(`
      SELECT behavior_category, COUNT(*) as count
      FROM behavior_records 
      WHERE child_id = ? AND created_at >= ? AND created_at <= ?
      GROUP BY behavior_category ORDER BY count DESC
    `, [req.params.childId, startDate, endDate], (err, categoryStats) => {
      if (err) return res.status(500).json({ error: err.message });
      
      db.query(`
        SELECT effectiveness, COUNT(*) as count
        FROM strategy_feedback 
        WHERE child_id = ? AND created_at >= ? AND created_at <= ?
        GROUP BY effectiveness
      `, [req.params.childId, startDate, endDate], (err, feedbackStats) => {
        if (err) return res.status(500).json({ error: err.message });
        
        db.query(`
          SELECT s.name, f.effectiveness
          FROM strategy_feedback f
          JOIN strategies s ON f.strategy_id = s.id
          WHERE f.child_id = ? AND f.created_at >= ? AND f.created_at <= ?
          ORDER BY f.created_at DESC
        `, [req.params.childId, startDate, endDate], (err, strategyResults) => {
          if (err) return res.status(500).json({ error: err.message });
          
          const reportContent = generateReportContent(
            recordStats[0] || {},
            categoryStats,
            feedbackStats,
            strategyResults,
            startDate,
            endDate
          );
          
          db.query(
            'INSERT INTO weekly_reports (child_id, user_id, week_start, week_end, content) VALUES (?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE id=LAST_INSERT_ID(id)',
            [req.params.childId, req.user.id, startDate, endDate, JSON.stringify(reportContent)],
            (err, result) => {
              if (err) return res.status(500).json({ error: err.message });
              
              res.status(201).json({
                success: true,
                message: '周报生成成功',
                report: {
                  id: result.insertId,
                  week_start: startDate,
                  week_end: endDate,
                  content: reportContent
                }
              });
            }
          );
        });
      });
    });
  });
});

router.get('/:childId/list', auth, (req, res) => {
  const { page = 1, limit = 20 } = req.query;
  const offset = (page - 1) * limit;
  
  db.query(
    'SELECT id, week_start, week_end, generated_at FROM weekly_reports WHERE child_id = ? ORDER BY week_start DESC LIMIT ? OFFSET ?',
    [req.params.childId, parseInt(limit), offset],
    (err, results) => {
      if (err) return res.status(500).json({ error: err.message });
      
      db.query('SELECT COUNT(*) as total FROM weekly_reports WHERE child_id = ?', [req.params.childId], (err, countResults) => {
        if (err) return res.status(500).json({ error: err.message });
        
        res.json({
          success: true,
          reports: results,
          total: countResults[0].total,
          page: parseInt(page),
          limit: parseInt(limit)
        });
      });
    }
  );
});

router.get('/:childId/:reportId', auth, (req, res) => {
  db.query('SELECT * FROM weekly_reports WHERE id = ? AND child_id = ?', [req.params.reportId, req.params.childId], (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    
    if (results.length === 0) {
      return res.status(404).json({ error: '周报不存在' });
    }
    
    const report = results[0];
    res.json({ 
      success: true, 
      report: {
        ...report,
        content: parseDbJson(report.content, {})
      }
    });
  });
});

router.post('/:reportId/comment', auth, (req, res) => {
  const { content } = req.body;
  
  if (!content) {
    return res.status(400).json({ error: '评论内容不能为空' });
  }
  
  db.query('SELECT * FROM weekly_reports WHERE id = ? AND user_id = ?', [req.params.reportId, req.user.id], (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    
    if (results.length === 0) {
      return res.status(404).json({ error: '周报不存在' });
    }
    
    db.query(
      'INSERT INTO report_comments (report_id, user_id, content) VALUES (?, ?, ?)',
      [req.params.reportId, req.user.id, content],
      (err, result) => {
        if (err) return res.status(500).json({ error: err.message });
        
        res.status(201).json({
          success: true,
          message: '评论提交成功',
          comment: { id: result.insertId, content }
        });
      }
    );
  });
});

router.get('/:reportId/comments', auth, (req, res) => {
  db.query('SELECT c.* FROM report_comments c JOIN weekly_reports r ON r.id = c.report_id WHERE c.report_id = ? AND r.user_id = ? ORDER BY c.timestamp DESC', [req.params.reportId, req.user.id], (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    
    res.json({ success: true, comments: results });
  });
});

router.post('/:reportId/extend-share', auth, (req, res) => {
  res.status(410).json({ error: '旧版匿名分享已停用，请重新选择接收者、范围和有效期' });
});

router.post('/:reportId/revoke-share', auth, (req, res) => {
  db.query('UPDATE report_shares SET revoked_at=NOW() WHERE report_id=? AND owner_user_id=? AND revoked_at IS NULL', [req.params.reportId, req.user.id], (err, result) => err
    ? res.status(500).json({ error: '授权暂时无法撤销' })
    : res.json({ success: true, message: '该周报的有效授权已全部撤销', revoked: Number(result.affectedRows || 0) }));
});

function getWeekStart() {
  const now = new Date();
  const day = now.getDay();
  const diff = now.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(now.setDate(diff));
  monday.setHours(0, 0, 0, 0);
  return monday.toISOString().split('T')[0];
}

function getWeekEnd() {
  const now = new Date();
  const day = now.getDay();
  const diff = now.getDate() - day + (day === 0 ? 0 : 7);
  const sunday = new Date(now.setDate(diff));
  sunday.setHours(23, 59, 59, 999);
  return sunday.toISOString().split('T')[0];
}

function generateReportContent(recordStats, categoryStats, feedbackStats, strategyResults, startDate, endDate) {
  const effectiveRate = feedbackStats.length > 0 
    ? feedbackStats.find(f => f.effectiveness === 'effective')?.count || 0
    : 0;
  const totalFeedback = feedbackStats.reduce((sum, f) => sum + f.count, 0);
  
  const prediction = generatePrediction(categoryStats);
  
  return {
    week_start: startDate,
    week_end: endDate,
    summary: {
      total_records: recordStats.total_records || 0,
      high_intensity_count: recordStats.high_intensity_count || 0,
      medium_intensity_count: recordStats.medium_intensity_count || 0,
      low_intensity_count: recordStats.low_intensity_count || 0,
      effective_rate: totalFeedback > 0 ? Math.round((effectiveRate / totalFeedback) * 100) : 0
    },
    category_distribution: categoryStats,
    strategy_effectiveness: feedbackStats,
    strategy_rankings: strategyResults.slice(0, 5),
    ai_comment: generateAIComment(recordStats, categoryStats, effectiveRate),
    top_questions: generateTopQuestions(categoryStats),
    next_week_prediction: prediction
  };
}

function generateAIComment(recordStats, categoryStats, effectiveRate) {
  const total = recordStats.total_records || 0;
  
  if (total === 0) {
    return '本周暂无行为记录，继续保持观察。建议每天记录1-2条，以便更好地了解孩子的行为模式。';
  }
  
  const mainCategory = categoryStats[0];
  
  if (effectiveRate > 0) {
    return `本周共记录${total}条行为，主要集中在${mainCategory?.behavior_category || '日常行为'}方面。您尝试的策略有效率为${Math.round((effectiveRate / (recordStats.total_records || 1)) * 100)}%，继续保持！`;
  }
  
  return `本周共记录${total}条行为，主要集中在${mainCategory?.behavior_category || '日常行为'}方面。建议尝试更多策略，找到最适合孩子的方法。`;
}

function generateTopQuestions(categoryStats) {
  const questions = [];
  
  if (categoryStats.some(c => c.behavior_category === '情绪爆发' && c.count > 3)) {
    questions.push('如何帮助孩子更好地调节情绪？');
  }
  
  if (categoryStats.some(c => c.behavior_category === '攻击行为' && c.count > 0)) {
    questions.push('如何应对孩子的攻击行为？');
  }
  
  if (categoryStats.some(c => c.behavior_category === '刻板行为' && c.count > 5)) {
    questions.push('如何引导刻板行为转化为功能性行为？');
  }
  
  if (questions.length === 0) {
    questions.push('如何进一步提升孩子的社交能力？');
    questions.push('如何建立有效的日常作息？');
  }
  
  return questions.slice(0, 3);
}

function generatePrediction(categoryStats) {
  const highRiskCategories = ['情绪爆发', '攻击行为', '自伤行为'];
  const highRisk = categoryStats.filter(c => highRiskCategories.includes(c.behavior_category) && c.count >= 2);
  
  if (highRisk.length > 0) {
    return {
      confidence: '高',
      message: `根据本周数据，${highRisk.map(c => c.behavior_category).join('、')}发生频率较高。建议下周重点关注这些行为，提前准备应对策略。`,
      suggestions: [
        '建立情绪预警机制，及时干预',
        '增加正向强化频率',
        '回顾有效的安抚策略'
      ]
    };
  }
  
  return {
    confidence: '中',
    message: '本周行为记录较为平稳。建议继续保持记录，观察行为模式变化。',
    suggestions: [
      '保持现有干预策略',
      '尝试在新场景中应用有效策略',
      '关注孩子的微小进步'
    ]
  };
}

module.exports = router;
