'use strict';

const db = require('../config/db');

const query = (sql, params = []) => new Promise((resolve, reject) => {
  db.query(sql, params, (error, rows) => error ? reject(error) : resolve(rows));
});

function isoDate(date) { return date.toISOString().slice(0, 10); }
function completedWeek(reference = new Date()) {
  const cursor = new Date(Date.UTC(reference.getUTCFullYear(), reference.getUTCMonth(), reference.getUTCDate()));
  const sinceMonday = (cursor.getUTCDay() + 6) % 7;
  cursor.setUTCDate(cursor.getUTCDate() - sinceMonday - 7);
  const end = new Date(cursor); end.setUTCDate(end.getUTCDate() + 6);
  return { weekStart: isoDate(cursor), weekEnd: isoDate(end) };
}

async function enqueueCompletedWeek(reference) {
  const { weekStart, weekEnd } = completedWeek(reference);
  const result = await query(`INSERT IGNORE INTO weekly_report_jobs (child_id,user_id,week_start,week_end)
    SELECT id,user_id,?,? FROM children`, [weekStart, weekEnd]);
  return { weekStart, weekEnd, enqueued: Number(result.affectedRows || 0) };
}

async function buildContent(tx, job) {
  const [recordRows, categoryRows, feedbackRows] = await Promise.all([
    tx.query(`SELECT COUNT(*) total_records,
      SUM(intensity_level='high') high_intensity_count,
      SUM(intensity_level='medium') medium_intensity_count,
      SUM(intensity_level='low') low_intensity_count
      FROM behavior_records WHERE child_id=? AND DATE(created_at) BETWEEN ? AND ?`, [job.child_id, job.week_start, job.week_end]),
    tx.query(`SELECT behavior_category,COUNT(*) count FROM behavior_records
      WHERE child_id=? AND DATE(created_at) BETWEEN ? AND ? GROUP BY behavior_category ORDER BY count DESC`, [job.child_id, job.week_start, job.week_end]),
    tx.query(`SELECT effectiveness,COUNT(*) count FROM strategy_feedback
      WHERE child_id=? AND DATE(created_at) BETWEEN ? AND ? GROUP BY effectiveness`, [job.child_id, job.week_start, job.week_end])
  ]);
  const stats = recordRows[0] || {};
  const totalFeedback = feedbackRows.reduce((sum, row) => sum + Number(row.count || 0), 0);
  const effective = feedbackRows.find(row => row.effectiveness === 'effective');
  return {
    week_start: job.week_start,
    week_end: job.week_end,
    summary: {
      total_records: Number(stats.total_records || 0),
      high_intensity_count: Number(stats.high_intensity_count || 0),
      medium_intensity_count: Number(stats.medium_intensity_count || 0),
      low_intensity_count: Number(stats.low_intensity_count || 0),
      effective_rate: totalFeedback ? Math.round(Number(effective?.count || 0) * 100 / totalFeedback) : 0
    },
    category_distribution: categoryRows,
    strategy_effectiveness: feedbackRows,
    ai_comment: stats.total_records ? '这是基于本周记录生成的观察摘要，请结合具体情境判断，不替代医疗诊断。' : '本周暂无行为记录；周报已如实保留空数据状态，不据此推断孩子情况。'
  };
}

async function processJob(job) {
  const claimed = await query(`UPDATE weekly_report_jobs SET status='processing',attempt_count=attempt_count+1,started_at=NOW(),last_error=NULL
    WHERE id=? AND status IN ('pending','retry') AND (next_attempt_at IS NULL OR next_attempt_at<=NOW())`, [job.id]);
  if (!claimed.affectedRows) return false;
  try {
    await db.withTransaction(async tx => {
      const content = await buildContent(tx, job);
      const reportResult = await tx.query(`INSERT INTO weekly_reports (child_id,user_id,week_start,week_end,content)
        VALUES (?,?,?,?,?) ON DUPLICATE KEY UPDATE id=LAST_INSERT_ID(id)`, [job.child_id, job.user_id, job.week_start, job.week_end, JSON.stringify(content)]);
      const reportId = Number(reportResult.insertId);
      await tx.query(`INSERT INTO notifications (user_id,title,content,type) VALUES (?,?,?,'system')`, [job.user_id, '本周家庭观察周报已生成', `${job.week_start} 至 ${job.week_end} 的周报已生成，可在儿童档案中查看。`]);
      await tx.query(`UPDATE weekly_report_jobs SET status='succeeded',report_id=?,notification_status='delivered',completed_at=NOW(),next_attempt_at=NULL,last_error=NULL WHERE id=?`, [reportId, job.id]);
    });
    return true;
  } catch (error) {
    const attempts = Number(job.attempt_count || 0) + 1;
    const terminal = attempts >= Number(process.env.WEEKLY_REPORT_MAX_ATTEMPTS || 5);
    const delayMinutes = Math.min(360, 5 * (2 ** Math.max(0, attempts - 1)));
    await query(`UPDATE weekly_report_jobs SET status=?,notification_status='failed',last_error=?,next_attempt_at=${terminal ? 'NULL' : 'DATE_ADD(NOW(), INTERVAL ? MINUTE)'} WHERE id=?`,
      terminal ? ['failed', String(error.message).slice(0, 500), job.id] : ['retry', String(error.message).slice(0, 500), delayMinutes, job.id]);
    return false;
  }
}

async function runWeeklyReportCycle(reference = new Date()) {
  await query(`UPDATE weekly_report_jobs SET status='retry',next_attempt_at=NOW(),last_error='任务执行中断，已自动重新排队'
    WHERE status='processing' AND started_at<DATE_SUB(NOW(), INTERVAL 30 MINUTE)`);
  const queued = await enqueueCompletedWeek(reference);
  const jobs = await query(`SELECT id,child_id,user_id,DATE_FORMAT(week_start,'%Y-%m-%d') week_start,
    DATE_FORMAT(week_end,'%Y-%m-%d') week_end,attempt_count FROM weekly_report_jobs
    WHERE status IN ('pending','retry') AND (next_attempt_at IS NULL OR next_attempt_at<=NOW()) ORDER BY id LIMIT 50`);
  let succeeded = 0;
  for (const job of jobs) if (await processJob(job)) succeeded += 1;
  return { ...queued, attempted: jobs.length, succeeded };
}

module.exports = { completedWeek, enqueueCompletedWeek, runWeeklyReportCycle };
