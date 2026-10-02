'use strict';

require('dotenv').config();
const { spawn } = require('child_process');
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const path = require('path');

const PORT = 3298;
const BASE = `http://127.0.0.1:${PORT}/api`;
const suffix = String(Date.now()).slice(-8);
const password = 'Xingban-Delete-2026!';
const ids = { users: [], requests: [] };

const server = spawn(process.execPath, ['server.js'], {
  cwd: path.resolve(__dirname, '..'),
  env: { ...process.env, PORT: String(PORT), NODE_ENV: 'development', USE_MOCK_DB: 'false', ALLOW_MOCK_DB: 'false' },
  stdio: ['ignore', 'pipe', 'pipe']
});
let logs = '';
server.stdout.on('data', chunk => { logs += chunk.toString(); });
server.stderr.on('data', chunk => { logs += chunk.toString(); });

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
async function call(pathname, options = {}) {
  const response = await fetch(BASE + pathname, options);
  return { response, body: await response.json() };
}
const headers = token => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${token}` });
const dbOptions = () => ({ host: process.env.DB_HOST, port: Number(process.env.DB_PORT || 3306), user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_NAME });

async function register(phone, nickname) {
  const result = await call('/auth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone, password, nickname }) });
  if (result.response.status !== 201) throw new Error(`注册失败：${JSON.stringify(result.body)}`);
  ids.users.push(result.body.user.id);
  return { id: result.body.user.id, token: result.body.token };
}

async function main() {
  let ready = false;
  for (let i = 0; i < 150; i += 1) {
    try { const health = await call('/health/ready'); if (health.response.ok && health.body.database === 'mysql') { ready = true; break; } } catch (_) {}
    await wait(100);
  }
  if (!ready) throw new Error(`真实MySQL后端未就绪：${logs.slice(-1200)}`);

  const parentCancel = await register(`15${suffix}1`.slice(0, 11), '删除撤销测试家长');
  const parentDelete = await register(`16${suffix}2`.slice(0, 11), '账号删除测试家长');
  const adminPhone = `14${suffix}3`.slice(0, 11);
  const setup = await mysql.createConnection(dbOptions());
  let adminId;
  try {
    const passwordHash = await bcrypt.hash(password, 10);
    const [adminResult] = await setup.execute("INSERT INTO users (phone,password,nickname,role) VALUES (?,?,?,'admin')", [adminPhone, passwordHash, '删除工单管理员']);
    adminId = adminResult.insertId; ids.users.push(adminId);
  } finally { await setup.end(); }
  const adminLogin = await call('/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone: adminPhone, password }) });
  if (!adminLogin.response.ok) throw new Error('管理员登录失败');

  const child1 = await call('/child', { method: 'POST', headers: headers(parentCancel.token), body: JSON.stringify({ nickname: '应保留儿童', birth_date: '2020-01-01', diagnosis_type: 'UNCONFIRMED' }) });
  const child2 = await call('/child', { method: 'POST', headers: headers(parentDelete.token), body: JSON.stringify({ nickname: '应删除儿童', birth_date: '2021-01-01', diagnosis_type: 'UNCONFIRMED' }) });
  if (child1.response.status !== 201 || child2.response.status !== 201) throw new Error('测试儿童建档失败');

  const invalid = await call('/sensitive/deletion-requests', { method: 'POST', headers: headers(parentCancel.token), body: JSON.stringify({ scope: 'child', child_id: child1.body.child.id, confirmation: 'delete' }) });
  if (invalid.response.status !== 400) throw new Error('删除申请未强制大写DELETE确认');
  const cancellable = await call('/sensitive/deletion-requests', { method: 'POST', headers: headers(parentCancel.token), body: JSON.stringify({ scope: 'child', child_id: child1.body.child.id, reason: '测试撤销', confirmation: 'DELETE' }) });
  if (cancellable.response.status !== 201) throw new Error(`儿童删除申请失败：${JSON.stringify(cancellable.body)}`);
  ids.requests.push(cancellable.body.request.id);
  const duplicate = await call('/sensitive/deletion-requests', { method: 'POST', headers: headers(parentCancel.token), body: JSON.stringify({ scope: 'child', child_id: child1.body.child.id, confirmation: 'DELETE' }) });
  if (duplicate.response.status !== 409) throw new Error('重复活动删除申请未被拒绝');
  const unauthorizedQueue = await call('/sensitive/admin/deletion-requests', { headers: headers(parentCancel.token) });
  if (unauthorizedQueue.response.status !== 403) throw new Error('普通家长可读取管理员删除队列');
  const cancelled = await call(`/sensitive/deletion-requests/${cancellable.body.request.id}`, { method: 'DELETE', headers: headers(parentCancel.token) });
  if (!cancelled.response.ok || cancelled.body.status !== 'cancelled') throw new Error('待处理申请无法撤销');

  const stored = await call(`/sensitive/record/safety_plan/${child2.body.child.id}`, { method: 'PUT', headers: headers(parentDelete.token), body: JSON.stringify({ data: { warning: '仅用于删除链路测试' } }) });
  if (!stored.response.ok) throw new Error(`敏感记录写入失败：${JSON.stringify(stored.body)}`);
  const shared = await call('/sensitive/share/create', { method: 'POST', headers: headers(parentDelete.token), body: JSON.stringify({ resource_id: stored.body.id, recipient_user_id: adminId, scopes: ['safety'], expires_days: 7 }) });
  if (shared.response.status !== 201) throw new Error(`测试分享创建失败：${JSON.stringify(shared.body)}`);
  const accountRequest = await call('/sensitive/deletion-requests', { method: 'POST', headers: headers(parentDelete.token), body: JSON.stringify({ scope: 'account', reason: '完整账号删除集成测试', confirmation: 'DELETE' }) });
  if (accountRequest.response.status !== 201 || !accountRequest.body.shares_revoked) throw new Error(`账号删除申请失败：${JSON.stringify(accountRequest.body)}`);
  ids.requests.push(accountRequest.body.request.id);
  const mine = await call('/sensitive/deletion-requests/mine', { headers: headers(parentDelete.token) });
  if (!mine.response.ok || mine.body.requests?.[0]?.id !== accountRequest.body.request.id) throw new Error('申请人无法查询自己的删除工单');

  const queue = await call('/sensitive/admin/deletion-requests?status=pending', { headers: headers(adminLogin.body.token) });
  const queued = queue.body.requests?.find(item => item.id === accountRequest.body.request.id);
  if (!queue.response.ok || !queued || queued.requester_user_id !== parentDelete.id) throw new Error('管理员队列缺少账号删除申请或最小申请人标识');
  const processing = await call(`/sensitive/admin/deletion-requests/${accountRequest.body.request.id}`, { method: 'PATCH', headers: headers(adminLogin.body.token), body: JSON.stringify({ status: 'processing', resolution_note: '已核对范围' }) });
  if (!processing.response.ok) throw new Error('管理员无法标记处理中');
  const lateCancel = await call(`/sensitive/deletion-requests/${accountRequest.body.request.id}`, { method: 'DELETE', headers: headers(parentDelete.token) });
  if (lateCancel.response.status !== 409) throw new Error('处理中申请仍可由申请人撤销');
  const completed = await call(`/sensitive/admin/deletion-requests/${accountRequest.body.request.id}`, { method: 'PATCH', headers: headers(adminLogin.body.token), body: JSON.stringify({ status: 'completed', resolution_note: '事务级联删除完成' }) });
  if (!completed.response.ok || completed.body.scope !== 'account') throw new Error(`账号删除执行失败：${JSON.stringify(completed.body)}`);
  const replay = await call('/auth/me', { headers: headers(parentDelete.token) });
  if (replay.response.status !== 401) throw new Error('账号删除后旧会话仍可访问');

  const verify = await mysql.createConnection(dbOptions());
  try {
    const [[userCount]] = await verify.execute('SELECT COUNT(*) count FROM users WHERE id=?', [parentDelete.id]);
    const [[childCount]] = await verify.execute('SELECT COUNT(*) count FROM children WHERE id=?', [child2.body.child.id]);
    const [[keptChild]] = await verify.execute('SELECT COUNT(*) count FROM children WHERE id=?', [child1.body.child.id]);
    const [[requestRow]] = await verify.execute('SELECT status,requester_user_id FROM data_deletion_requests WHERE public_id=?', [accountRequest.body.request.id]);
    const [[shareCount]] = await verify.execute('SELECT COUNT(*) count FROM data_shares WHERE public_id=?', [shared.body.share.id]);
    const [[auditCount]] = await verify.execute("SELECT COUNT(*) count FROM audit_logs WHERE action='deletion_completed' AND resource_public_id=?", [accountRequest.body.request.id]);
    if (userCount.count !== 0 || childCount.count !== 0 || keptChild.count !== 1 || requestRow.status !== 'completed' || requestRow.requester_user_id !== null || shareCount.count !== 0 || auditCount.count < 1) {
      throw new Error(`删除后数据库状态不一致：${JSON.stringify({ userCount, childCount, keptChild, requestRow, shareCount, auditCount })}`);
    }
  } finally { await verify.end(); }
  console.log('PASS real MySQL deletion workflow: explicit confirmation, duplicate rejection, revoke, admin isolation, transaction delete, audit');
}

async function cleanup() {
  const connection = await mysql.createConnection(dbOptions());
  try {
    for (const requestId of ids.requests) await connection.execute('DELETE FROM data_deletion_requests WHERE public_id=?', [requestId]);
    for (const userId of ids.users) await connection.execute('DELETE FROM users WHERE id=?', [userId]);
  } finally { await connection.end(); }
}

main().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
  try { await cleanup(); } catch (error) { console.error(`清理失败：${error.message}`); process.exitCode = 1; }
  server.kill();
});
