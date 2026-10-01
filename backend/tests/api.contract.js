'use strict';

const { spawn } = require('child_process');
const path = require('path');

const PORT = 3199;
const BASE = `http://127.0.0.1:${PORT}/api`;
const child = spawn(process.execPath, ['server.js'], {
  cwd: path.resolve(__dirname, '..'),
  env: {
    ...process.env,
    PORT: String(PORT),
    NODE_ENV: 'development',
    USE_MOCK_DB: 'true',
    JWT_SECRET: 'xingban-contract-test-secret-at-least-32-characters',
    CORS_ORIGINS: 'http://127.0.0.1:8001'
  },
  stdio: ['ignore', 'pipe', 'pipe']
});
let stderr = '';
child.stderr.on('data', chunk => { stderr += chunk.toString(); });

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
async function request(pathname, options = {}) {
  const response = await fetch(BASE + pathname, options);
  const body = await response.json();
  return { response, body };
}

async function main() {
  let ready = false;
  // 冷启动需要载入本地知识库索引；较慢磁盘上预留最多15秒，避免把启动耗时误判为接口故障。
  for (let i = 0; i < 150; i += 1) {
    try {
      const result = await request('/health/live');
      if (result.response.ok) { ready = true; break; }
    } catch (_) {}
    await wait(100);
  }
  if (!ready) throw new Error(`后端未在预期时间内启动：${stderr.slice(0, 1000)}`);

  const readiness = await request('/health/ready');
  if (readiness.response.status !== 200 || readiness.body.database !== 'mock') throw new Error('开发数据库就绪状态不正确');

  const forgedProfessional = await request('/therapist/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ user_id: 1, name: '冒用人员', phone: '13800000000' }) });
  if (forgedProfessional.response.status !== 401) throw new Error('专业人员自助注册未被阻止');

  const unauthorized = await request('/feedback', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'bug', content: '测试反馈' }) });
  if (unauthorized.response.status !== 401) throw new Error('反馈接口未保护');

  const login = await request('/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone: '13800138000', password: '123456' }) });
  if (!login.response.ok || !login.body.token) throw new Error('演示账号登录失败');
  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${login.body.token}` };

  const invalid = await request('/feedback', { method: 'POST', headers, body: JSON.stringify({ type: 'unknown', content: '测试反馈' }) });
  if (invalid.response.status !== 400) throw new Error('反馈类型校验未生效');

  const created = await request('/feedback', { method: 'POST', headers, body: JSON.stringify({ type: 'bug', content: '策略页按钮在小屏设备上无法点击' }) });
  if (created.response.status !== 201 || !created.body.feedback?.id) throw new Error('反馈保存失败');

  const mine = await request('/feedback/mine', { headers });
  if (!mine.response.ok || mine.body.feedback.length !== 1) throw new Error('反馈列表读取失败');

  const planCreated = await request('/therapist/plans', { method: 'POST', headers, body: JSON.stringify({
    title: '与专业人员确认情绪卡片使用方案', goal: '孩子能在升级前表达需要暂停', frequency: '每天一次自然练习',
    responsible_person: '家长', stop_conditions: '孩子明显不适或冲突升级', review_date: '2026-10-15'
  }) });
  if (planCreated.response.status !== 201 || !planCreated.body.plan?.id) throw new Error('专业协作计划保存失败');
  const planId = planCreated.body.plan.id;
  const plans = await request('/therapist/plans/mine', { headers });
  if (!plans.response.ok || plans.body.plans.length !== 1 || plans.body.plans[0].status !== 'pending_confirmation') throw new Error('专业协作计划读取失败');
  const planUpdated = await request(`/therapist/plans/${planId}`, { method: 'PATCH', headers, body: JSON.stringify({
    title: '情绪卡片使用方案', goal: '孩子表达暂停', frequency: '每天一次', responsible_person: '家长',
    stop_conditions: '孩子明显不适', review_date: '2026-10-15', status: 'active', notes: '已与专业人员确认'
  }) });
  if (!planUpdated.response.ok) throw new Error('专业协作计划状态更新失败');

  const lowhits = await request('/knowledge/lowhits');
  if (lowhits.response.status !== 401) throw new Error('低命中统计不应公开');

  const legacyShare = await request('/report/share/guessable-token');
  if (legacyShare.response.status !== 410) throw new Error('旧版匿名周报链接未停用');
  const legacyComment = await request('/report/share/guessable-token/comment', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content: '冒用评论', therapist_id: 1 }) });
  if (legacyComment.response.status !== 410) throw new Error('旧版匿名评论未停用');

  const wizard = await request('/child/wizard/step1', { method: 'POST', headers, body: JSON.stringify({ nickname: '测试昵称', birth_date: '2020-01-02', diagnosis_type: 'UNCONFIRMED' }) });
  if (wizard.response.status !== 201 || !wizard.body.draft_id) throw new Error('儿童建档第一步不可用');

  const crossFamilyGoals = await request('/child/2/goals', { headers });
  if (crossFamilyGoals.response.status !== 404) throw new Error(`跨家庭目标读取未被阻止：HTTP ${crossFamilyGoals.response.status} ${JSON.stringify(crossFamilyGoals.body)} ${stderr.slice(-1000)}`);
  const crossFamilyRadar = await request('/child/2/capacity-radar', { headers });
  if (crossFamilyRadar.response.status !== 404) throw new Error('跨家庭支持需要读取未被阻止');
  const crossFamilyReport = await request('/report/generate/2', { method: 'POST', headers, body: JSON.stringify({}) });
  if (crossFamilyReport.response.status !== 404) throw new Error('跨家庭周报生成未被阻止');

  console.log('PASS backend API contract: health, auth, feedback, professional plans, child wizard, ownership, analytics protection');
}

main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => child.kill());
