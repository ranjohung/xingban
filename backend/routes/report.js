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

const validTimezone = value => {
  try { new Intl.DateTimeFormat('zh-CN', { timeZone: value }).format(); return true; } catch (_) { return false; }
};

router.get('/preferences', requireRole('parent', 'admin'), (req, res) => {
  db.query('SELECT enabled,delivery_weekday,delivery_hour,timezone,updated_at FROM weekly_report_preferences WHERE user_id=?', [req.user.id], (error, rows) => {
    if (error) return res.status(500).json({ error: '周报设置暂时无法读取' });
    const preference = rows[0] || { enabled: true, delivery_weekday: 1, delivery_hour: 8, timezone: 'Asia/Shanghai', updated_at: null };
    res.json({ success: true, preference: { ...preference, enabled: Boolean(preference.enabled) } });
  });
});

router.put('/preferences', requireRole('parent', 'admin'), (req, res) => {
  const enabled = req.body.enabled === true || req.body.enabled === 1;
  const weekday = Number(req.body.delivery_weekday);
  const hour = Number(req.body.delivery_hour);
  const timezone = String(req.body.timezone || '').trim();
  if (!Number.isInteger(weekday) || weekday < 1 || weekday > 7 || !Number.isInteger(hour) || hour < 0 || hour > 23 || !validTimezone(timezone)) {
    return res.status(400).json({ error: '周报星期、小时或时区无效' });
  }
  db.query(`INSERT INTO weekly_report_preferences (user_id,enabled,delivery_weekday,delivery_hour,timezone)
    VALUES (?,?,?,?,?) ON DUPLICATE KEY UPDATE enabled=VALUES(enabled),delivery_weekday=VALUES(delivery_weekday),delivery_hour=VALUES(delivery_hour),timezone=VALUES(timezone)`,
    [req.user.id, enabled, weekday, hour, timezone], (error) => {
      if (error) return res.status(500).json({ error: '周报设置暂时无法保存' });
      writeAudit(req, 'weekly_report_preference_update', 'user', String(req.user.id), 'success', { enabled, delivery_weekday: weekday, delivery_hour: hour, timezone });
      res.json({ success: true, preference: { enabled, delivery_weekday: weekday, delivery_hour: hour, timezone } });
    });
});

router.get('/admin/jobs', requireRole('admin'), (req, res) => {
  const status = String(req.query.status || 'failed');
  const view = String(req.query.view || '');
  if (view && !['active','history'].includes(view)) return res.status(400).json({ error: '任务视图无效' });
  if (status !== 'all' && !['pending','processing','retry','succeeded','failed'].includes(status)) return res.status(400).json({ error: '任务状态无效' });
  const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
  const limit = Math.max(1, Math.min(100, Number.parseInt(req.query.limit, 10) || 20));
  const offset = (page - 1) * limit;
  const statuses = view === 'active' ? ['pending','processing','retry','failed'] : view === 'history' ? ['succeeded'] : status === 'all' ? [] : [status];
  const where = statuses.length ? ` WHERE j.status IN (${statuses.map(() => '?').join(',')})` : '';
  const params = [...statuses, limit, offset];
  db.query(`SELECT j.id,j.child_id,j.user_id,j.week_start,j.week_end,j.status,j.attempt_count,j.next_attempt_at,
    j.report_id,j.notification_status,j.last_error,j.started_at,j.completed_at,j.updated_at
    FROM weekly_report_jobs j${where} ORDER BY j.updated_at DESC LIMIT ? OFFSET ?`, params, (error, rows) => {
      if (error) return res.status(500).json({ error: '读取周报任务失败' });
      db.query(`SELECT COUNT(*) total FROM weekly_report_jobs j${where}`, statuses, (countError, totals) => countError
        ? res.status(500).json({ error: '读取周报任务失败' })
        : res.json({ success: true, jobs: rows, total: Number(totals[0]?.total || 0), page, limit }));
    });
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
  const weekRange = String(req.body.week_range || 'this_week');
  if (!['this_week', 'last_week'].includes(weekRange)) {
    return res.status(400).json({ error: '周范围无效，只能选择本周或上周' });
  }
  const { startDate, endDate } = getWeekBounds(weekRange);
  
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
            'INSERT IGNORE INTO weekly_reports (child_id, user_id, week_start, week_end, content) VALUES (?, ?, ?, ?, ?)',
            [req.params.childId, req.user.id, startDate, endDate, JSON.stringify(reportContent)],
            (err, result) => {
              if (err) return res.status(500).json({ error: err.message });
              const replayed = Number(result.affectedRows || 0) === 0;
              const respond = (reportId, content = reportContent, persistedEndDate = endDate) => res.status(replayed ? 200 : 201).json({
                success: true, replayed,
                message: replayed ? '该周周报此前已生成' : '周报生成成功',
                report: { id: reportId, week_start: startDate, week_end: persistedEndDate, content }
              });
              if (!replayed) return respond(result.insertId);
              db.query('SELECT id,week_end,content FROM weekly_reports WHERE child_id=? AND week_start=? LIMIT 1', [req.params.childId, startDate], (lookupError, rows) => {
                if (lookupError || !rows.length) return res.status(500).json({ error: '周报重放恢复失败，请稍后重试' });
                respond(rows[0].id, parseDbJson(rows[0].content, {}), rows[0].week_end);
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

function getWeekBounds(range, today = new Date()) {
  const monday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const weekday = monday.getDay() || 7;
  monday.setDate(monday.getDate() - weekday + 1 - (range === 'last_week' ? 7 : 0));
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const format = value => `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
  return { startDate: format(monday), endDate: format(sunday) };
}

function generateReportContent(recordStats, categoryStats, feedbackStats, strategyResults, startDate, endDate) {
  const effectiveCount = Number(feedbackStats.find(f => f.effectiveness === 'effective')?.count || 0);
  const totalFeedback = feedbackStats.reduce((sum, f) => sum + Number(f.count || 0), 0);
  
  return {
    week_start: startDate,
    week_end: endDate,
    summary: {
      total_records: recordStats.total_records || 0,
      high_intensity_count: recordStats.high_intensity_count || 0,
      medium_intensity_count: recordStats.medium_intensity_count || 0,
      low_intensity_count: recordStats.low_intensity_count || 0,
      effective_rate: totalFeedback > 0 ? Math.round((effectiveCount / totalFeedback) * 100) : null,
      feedback_count: totalFeedback
    },
    category_distribution: categoryStats,
    strategy_effectiveness: feedbackStats,
    strategy_rankings: strategyResults.slice(0, 5),
    observation_summary: generateObservationSummary(recordStats, categoryStats, effectiveCount, totalFeedback),
    top_questions: generateTopQuestions(categoryStats),
    next_week_planning: generateNextWeekPlanning(categoryStats)
  };
}

function generateObservationSummary(recordStats, categoryStats, effectiveCount, totalFeedback) {
  const total = Number(recordStats.total_records || 0);
  
  if (total === 0) {
    return '所选周暂无家庭记录，无法据此判断变化或效果。';
  }
  
  const mainCategory = categoryStats[0];
  
  if (totalFeedback > 0) {
    return `所选周共记录${total}条家庭观察，记录最多的类别是${mainCategory?.behavior_category || '日常行为'}；${totalFeedback}次策略反馈中${effectiveCount}次由家长标记为有效。该摘要不代表疗效或趋势。`;
  }
  return `所选周共记录${total}条家庭观察，记录最多的类别是${mainCategory?.behavior_category || '日常行为'}。尚无策略反馈，不能判断效果。`;
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

function generateNextWeekPlanning(categoryStats) {
  const highRiskCategories = ['情绪爆发', '攻击行为', '自伤行为'];
  const highRisk = categoryStats.filter(c => highRiskCategories.includes(c.behavior_category) && c.count >= 2);
  
  if (highRisk.length > 0) {
    return {
      message: `所选周记录中，${highRisk.map(c => c.behavior_category).join('、')}各出现至少2次。请先核对是否存在即时危险，再与孩子和专业人员讨论支持安排。`,
      suggestions: [
        '核对发生前后的可观察事实和安全风险',
        '准备孩子可接受的暂停、拒绝和求助方式',
        '如风险升高或拿不准，联系既往就诊机构或120/110'
      ]
    };
  }
  
  return {
    message: '所选周记录未触发高关注频次提示；这不代表没有风险，也不能据此判断情况稳定。',
    suggestions: [
      '与孩子核对哪些支持让其更舒适',
      '只选择一项低风险、可停止的小步骤',
      '继续记录事实，并在需要时请专业人员复核'
    ]
  };
}

module.exports = router;
