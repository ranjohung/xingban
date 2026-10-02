'use strict';

require('dotenv').config();
const mysql = require('mysql2/promise');
const jwt = require('jsonwebtoken');
const { spawn } = require('child_process');
const path = require('path');
const db = require('../config/db');
const { completedWeek, runWeeklyReportCycle } = require('../services/weeklyReportScheduler');

const reference = new Date('2026-10-02T04:00:00Z');
let connection;
let userId;
let adminId;
let server;

async function main() {
  connection = await mysql.createConnection({ host: process.env.DB_HOST, port: Number(process.env.DB_PORT || 3306), user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_NAME });
  const suffix = String(Date.now()).slice(-8);
  const [user] = await connection.execute("INSERT INTO users (phone,password,nickname,role) VALUES (?,?,'周报任务测试','parent')", [`16${suffix}3`.slice(0, 11), 'not-used']);
  userId = user.insertId;
  const [admin] = await connection.execute("INSERT INTO users (phone,password,nickname,role) VALUES (?,?,'周报管理员测试','admin')", [`15${suffix}4`.slice(0, 11), 'not-used']);
  adminId = admin.insertId;
  const [child] = await connection.execute("INSERT INTO children (user_id,nickname,birth_date,diagnosis_type) VALUES (?, '周报测试儿童','2020-01-02','UNCONFIRMED')", [userId]);
  const { weekStart } = completedWeek(reference);
  await connection.execute(`INSERT INTO behavior_records (child_id,user_id,input_type,content,behavior_category,intensity_level,created_at)
    VALUES (?,?,'text','转换前哭泣，给出预告后平静','情绪爆发','medium',?)`, [child.insertId, userId, `${weekStart} 10:00:00`]);

  db.connect(() => {});
  await new Promise(resolve => setTimeout(resolve, 100));
  const first = await runWeeklyReportCycle(reference);
  const second = await runWeeklyReportCycle(reference);
  const [reports] = await connection.execute('SELECT id,content FROM weekly_reports WHERE child_id=? AND week_start=?', [child.insertId, weekStart]);
  const [jobs] = await connection.execute('SELECT status,attempt_count,notification_status,last_error FROM weekly_report_jobs WHERE child_id=? AND week_start=?', [child.insertId, weekStart]);
  const [notifications] = await connection.execute("SELECT id FROM notifications WHERE user_id=? AND title='本周家庭观察周报已生成'", [userId]);
  if (first.succeeded !== 1 || second.attempted !== 0) throw new Error(`任务未保持幂等：${JSON.stringify({ first, second })}`);
  const reportContent = typeof reports[0]?.content === 'string' ? JSON.parse(reports[0].content) : reports[0]?.content;
  if (reports.length !== 1 || Number(reportContent?.summary?.total_records) !== 1) throw new Error('周报数量或统计内容错误');
  if (jobs.length !== 1 || jobs[0].status !== 'succeeded' || jobs[0].notification_status !== 'delivered' || jobs[0].last_error) throw new Error(`任务状态错误：${JSON.stringify(jobs)}`);
  if (notifications.length !== 1) throw new Error(`通知重复或缺失：${notifications.length}`);

  const port = 3312;
  server = spawn(process.execPath, ['server.js'], { cwd: path.resolve(__dirname, '..'), env: { ...process.env, PORT: String(port), NODE_ENV: 'development', USE_MOCK_DB: 'false', WEEKLY_REPORT_SCAN_INTERVAL_MINUTES: '0' }, stdio: 'ignore' });
  for (let i = 0; i < 80; i += 1) {
    try { if ((await fetch(`http://127.0.0.1:${port}/api/health/ready`)).ok) break; } catch (_) {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  const token = id => jwt.sign({ id, role: id === adminId ? 'admin' : 'parent', jti: `weekly-${id}` }, process.env.JWT_SECRET, { expiresIn: '5m' });
  const parentQueue = await fetch(`http://127.0.0.1:${port}/api/report/admin/jobs?status=succeeded`, { headers: { Authorization: `Bearer ${token(userId)}` } });
  const adminQueue = await fetch(`http://127.0.0.1:${port}/api/report/admin/jobs?status=succeeded`, { headers: { Authorization: `Bearer ${token(adminId)}` } });
  const parentRun = await fetch(`http://127.0.0.1:${port}/api/report/admin/jobs/run`, { method: 'POST', headers: { Authorization: `Bearer ${token(userId)}`, 'Content-Type': 'application/json' }, body: '{}' });
  if (parentQueue.status !== 403 || parentRun.status !== 403 || !adminQueue.ok) throw new Error(`周报管理权限隔离失败：${parentQueue.status}/${parentRun.status}/${adminQueue.status}`);
  console.log('PASS real MySQL weekly jobs: completed-week window, idempotent report, one notification, truthful delivery state, admin isolation');
}

main().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
  if (connection && userId) await connection.execute('DELETE FROM users WHERE id=?', [userId]).catch(() => {});
  if (connection && adminId) await connection.execute('DELETE FROM users WHERE id=?', [adminId]).catch(() => {});
  if (connection) await connection.end().catch(() => {});
  if (server) server.kill();
  process.exit(process.exitCode || 0);
});
