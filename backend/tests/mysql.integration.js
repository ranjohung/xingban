'use strict';

require('dotenv').config();
const { spawn } = require('child_process');
const mysql = require('mysql2/promise');
const path = require('path');

const PORT = 3299;
const BASE = `http://127.0.0.1:${PORT}/api`;
const suffix = String(Date.now()).slice(-8);
const phone = `18${suffix}1`.slice(0, 11);
const password = 'Xingban-Test-2026!';
let userId = null;

const server = spawn(process.execPath, ['server.js'], {
  cwd: path.resolve(__dirname, '..'),
  env: { ...process.env, PORT: String(PORT), NODE_ENV: 'development', USE_MOCK_DB: 'false', ALLOW_MOCK_DB: 'false' },
  stdio: ['ignore', 'pipe', 'pipe']
});
let serverLog = '';
server.stdout.on('data', chunk => { serverLog += chunk.toString(); });
server.stderr.on('data', chunk => { serverLog += chunk.toString(); });

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
async function request(pathname, options = {}) {
  const response = await fetch(BASE + pathname, options);
  const body = await response.json();
  return { response, body };
}

async function main() {
  let ready = false;
  for (let i = 0; i < 150; i += 1) {
    try {
      const health = await request('/health/ready');
      if (health.response.ok && health.body.database === 'mysql') { ready = true; break; }
    } catch (_) {}
    await wait(100);
  }
  if (!ready) throw new Error(`真实MySQL后端未就绪：${serverLog.slice(-1200)}`);

  const registered = await request('/auth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone, password, nickname: '集成测试家长' }) });
  if (registered.response.status !== 201 || !registered.body.token) throw new Error(`注册失败：${JSON.stringify(registered.body)}`);
  userId = registered.body.user.id;
  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${registered.body.token}` };

  const child = await request('/child', { method: 'POST', headers, body: JSON.stringify({ nickname: '测试儿童', birth_date: '2020-01-02', diagnosis_type: 'UNCONFIRMED' }) });
  if (child.response.status !== 201) throw new Error(`建档失败：${JSON.stringify(child.body)}`);
  const childId = child.body.child.id;

  const behavior = await request('/behavior', { method: 'POST', headers, body: JSON.stringify({ child_id: childId, input_type: 'text', content: '活动转换前哭泣约三分钟，提供选择后平静', behavior_category: '情绪爆发', emotion_state: '难过', intensity_level: 'medium' }) });
  if (behavior.response.status !== 201) throw new Error(`记录失败：${JSON.stringify(behavior.body)}`);
  const report = await request(`/report/generate/${childId}`, { method: 'POST', headers, body: '{}' });
  if (report.response.status !== 201) throw new Error(`周报失败：${JSON.stringify(report.body)}`);
  const plan = await request('/therapist/plans', { method: 'POST', headers, body: JSON.stringify({ title: '待确认的转换支持计划', goal: '孩子可表达暂停', status: 'pending_confirmation' }) });
  if (plan.response.status !== 201) throw new Error(`计划失败：${JSON.stringify(plan.body)}`);
  const held = await request('/community/posts', { method: 'POST', headers, body: JSON.stringify({ title: '需要马上帮助', content: '孩子说不想活并准备吞药', category: 'emotion' }) });
  if (held.response.status !== 202 || !held.body.case_ref) throw new Error(`危机审核失败：${JSON.stringify(held.body)}`);

  const [children, records, reports, plans, cases] = await Promise.all([
    request('/child', { headers }), request(`/behavior/${childId}`, { headers }), request(`/report/${childId}/list`, { headers }),
    request('/therapist/plans/mine', { headers }), request('/community/reports/mine', { headers })
  ]);
  if (children.body.children?.length !== 1 || records.body.records?.length !== 1 || reports.body.reports?.length !== 1 || plans.body.plans?.length !== 1 || cases.body.reports?.length !== 1) {
    throw new Error('真实数据库回读数量不一致');
  }
  console.log(JSON.stringify({ database: 'mysql', child_id: childId, behavior_id: behavior.body.record.id, report_id: report.body.report.id, plan_id: plan.body.plan.id, moderation_case: held.body.case_ref }));
  console.log('PASS real MySQL integration: register, child, behavior, report, plan, crisis moderation, readback');
}

async function cleanup() {
  if (!userId) return;
  const connection = await mysql.createConnection({ host: process.env.DB_HOST, port: Number(process.env.DB_PORT || 3306), user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_NAME });
  try { await connection.execute('DELETE FROM users WHERE id=?', [userId]); }
  finally { await connection.end(); }
}

main().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
  try { await cleanup(); } catch (error) { console.error(`清理失败：${error.message}`); process.exitCode = 1; }
  server.kill();
});
