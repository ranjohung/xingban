const express = require('express');
const router = express.Router();
const db = require('../config/db');
const auth = require('../middleware/auth');
const { v4: uuidv4 } = require('uuid');

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
          
          const shareToken = uuidv4();
          const expiresAt = new Date();
          expiresAt.setDate(expiresAt.getDate() + 30);
          
          const reportContent = generateReportContent(
            recordStats[0],
            categoryStats,
            feedbackStats,
            strategyResults,
            startDate,
            endDate
          );
          
          db.query(
            'INSERT INTO weekly_reports (child_id, user_id, week_start, week_end, content, share_token, share_expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [req.params.childId, req.user.id, startDate, endDate, JSON.stringify(reportContent), shareToken, expiresAt],
            (err, result) => {
              if (err) return res.status(500).json({ error: err.message });
              
              res.status(201).json({
                success: true,
                message: '周报生成成功',
                report: {
                  id: result.insertId,
                  week_start: startDate,
                  week_end: endDate,
                  share_token: shareToken,
                  share_url: `${process.env.BASE_URL || 'http://localhost:3001'}/api/report/share/${shareToken}`,
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
    'SELECT id, week_start, week_end, generated_at, share_token FROM weekly_reports WHERE child_id = ? ORDER BY week_start DESC LIMIT ? OFFSET ?',
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
        content: JSON.parse(report.content || '{}'),
        share_url: `${process.env.BASE_URL || 'http://localhost:3001'}/api/report/share/${report.share_token}`
      }
    });
  });
});

router.get('/share/:token', (req, res) => {
  db.query('SELECT * FROM weekly_reports WHERE share_token = ? AND share_expires_at > NOW()', [req.params.token], (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    
    if (results.length === 0) {
      return res.status(404).json({ error: '分享链接无效或已过期' });
    }
    
    const report = results[0];
    
    db.query('SELECT * FROM report_comments WHERE report_id = ? ORDER BY timestamp DESC', [report.id], (err, comments) => {
      if (err) return res.status(500).json({ error: err.message });
      
      res.json({ 
        success: true, 
        report: {
          ...report,
          content: JSON.parse(report.content || '{}'),
          comments
        }
      });
    });
  });
});

router.post('/share/:token/comment', (req, res) => {
  const { content, therapist_id } = req.body;
  
  if (!content) {
    return res.status(400).json({ error: '评论内容不能为空' });
  }
  
  db.query('SELECT id FROM weekly_reports WHERE share_token = ? AND share_expires_at > NOW()', [req.params.token], (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    
    if (results.length === 0) {
      return res.status(404).json({ error: '分享链接无效或已过期' });
    }
    
    const reportId = results[0].id;
    
    db.query(
      'INSERT INTO report_comments (report_id, therapist_id, content) VALUES (?, ?, ?)',
      [reportId, therapist_id || null, content],
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

router.post('/:reportId/comment', auth, (req, res) => {
  const { content } = req.body;
  
  if (!content) {
    return res.status(400).json({ error: '评论内容不能为空' });
  }
  
  db.query('SELECT * FROM weekly_reports WHERE id = ?', [req.params.reportId], (err, results) => {
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
  db.query('SELECT * FROM report_comments WHERE report_id = ? ORDER BY timestamp DESC', [req.params.reportId], (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    
    res.json({ success: true, comments: results });
  });
});

router.post('/:reportId/extend-share', auth, (req, res) => {
  const newExpiresAt = new Date();
  newExpiresAt.setDate(newExpiresAt.getDate() + 30);
  
  db.query('UPDATE weekly_reports SET share_expires_at = ? WHERE id = ?', [newExpiresAt, req.params.reportId], (err) => {
    if (err) return res.status(500).json({ error: err.message });
    
    res.json({ success: true, message: '分享有效期已延长30天' });
  });
});

router.post('/:reportId/revoke-share', auth, (req, res) => {
  db.query('UPDATE weekly_reports SET share_expires_at = NOW() WHERE id = ?', [req.params.reportId], (err) => {
    if (err) return res.status(500).json({ error: err.message });
    
    res.json({ success: true, message: '分享链接已失效' });
  });
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
