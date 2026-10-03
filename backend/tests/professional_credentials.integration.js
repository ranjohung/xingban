'use strict';

require('dotenv').config();
const { spawn } = require('child_process');
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const path = require('path');

const PORT = 3307;
const BASE = `http://127.0.0.1:${PORT}/api`;
const suffix = String(Date.now()).slice(-7);
const password = 'Xingban-Credential-2026!';
const ids = { users: [], therapist: null, credential: null };

const server = spawn(process.execPath, ['server.js'], {
  cwd: path.resolve(__dirname, '..'),
  env: { ...process.env, PORT: String(PORT), NODE_ENV: 'development', USE_MOCK_DB: 'false', ALLOW_MOCK_DB: 'false' },
  stdio: ['ignore', 'pipe', 'pipe']
});
let serverLog = '';
server.stdout.on('data', chunk => { serverLog += chunk.toString(); });
server.stderr.on('data', chunk => { serverLog += chunk.toString(); });

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
async function call(pathname, { token, ...options } = {}) {
  const headers = new Headers(options.headers || {});
  if (token) headers.set('Authorization', `Bearer ${token}`);
  const response = await fetch(BASE + pathname, { ...options, headers });
  const contentType = response.headers.get('content-type') || '';
  const body = contentType.includes('application/json') ? await response.json() : Buffer.from(await response.arrayBuffer());
  return { response, body };
}

async function login(phone) {
  const result = await call('/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone, password }) });
  if (!result.response.ok || !result.body.token) throw new Error(`登录失败：${phone} ${JSON.stringify(result.body)}`);
  return result.body.token;
}

async function main() {
  let ready = false;
  for (let i = 0; i < 150; i += 1) {
    try { const health = await call('/health/ready'); if (health.response.ok) { ready = true; break; } } catch (_) {}
    await wait(100);
  }
  if (!ready) throw new Error(`后端未就绪：${serverLog.slice(-1000)}`);

  const connection = await mysql.createConnection({ host: process.env.DB_HOST, port: Number(process.env.DB_PORT || 3306), user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_NAME });
  const phones = [`15${suffix}01`, `15${suffix}02`, `15${suffix}03`, `15${suffix}04`].map(value => value.slice(0, 11));
  try {
    const hash = await bcrypt.hash(password, 10);
    for (let index = 0; index < phones.length; index += 1) {
      const role = index < 3 ? 'admin' : 'therapist';
      const [result] = await connection.execute('INSERT INTO users (phone,password,nickname,role) VALUES (?,?,?,?)', [phones[index], hash, `资质测试账号${index + 1}`, role]);
      ids.users.push(result.insertId);
    }
    const [profile] = await connection.execute("INSERT INTO therapists (user_id,name,phone,professional_title,specialty,is_certified) VALUES (?,?,?,?,?,FALSE)", [ids.users[3], '资质测试专业人员', phones[3], '儿童心理专业人员', '家庭支持']);
    ids.therapist = profile.insertId;
  } finally { await connection.end(); }

  const [submitter, reviewerOne, reviewerTwo, therapistToken] = await Promise.all(phones.map(login));
  const deniedForm = new FormData();
  deniedForm.append('credential_type', 'license'); deniedForm.append('issuing_authority', '测试机构'); deniedForm.append('expires_on', '2030-12-31');
  deniedForm.append('evidence', new Blob(['%PDF-1.4\ncredential-proof'], { type: 'application/pdf' }), 'proof.pdf');
  const denied = await call(`/therapist/admin/profiles/${ids.therapist}/credentials`, { method: 'POST', token: therapistToken, body: deniedForm });
  if (denied.response.status !== 403) throw new Error('专业人员可以自行提交并核验资质');

  const spoofedForm = new FormData();
  spoofedForm.append('credential_type', 'license'); spoofedForm.append('issuing_authority', '测试机构'); spoofedForm.append('expires_on', '2030-12-31');
  spoofedForm.append('evidence', new Blob(['not-a-real-pdf'], { type: 'application/pdf' }), 'spoofed.pdf');
  const spoofed = await call(`/therapist/admin/profiles/${ids.therapist}/credentials`, { method: 'POST', token: submitter, body: spoofedForm });
  if (spoofed.response.status !== 400) throw new Error('仅伪造MIME的文件被当作资质证据接受');

  const form = new FormData();
  form.append('credential_type', 'license'); form.append('reference_last4', 'A123'); form.append('issuing_authority', '测试儿童专业协会');
  form.append('issued_on', '2026-01-01'); form.append('expires_on', '2030-12-31');
  form.append('evidence', new Blob(['%PDF-1.4\ncredential-proof'], { type: 'application/pdf' }), 'proof.pdf');
  const submitted = await call(`/therapist/admin/profiles/${ids.therapist}/credentials`, { method: 'POST', token: submitter, body: form });
  if (submitted.response.status !== 201 || submitted.body.credential?.status !== 'pending') throw new Error(`资质证据提交失败：${JSON.stringify(submitted.body)}`);
  ids.credential = submitted.body.credential.id;

  const submitterReview = await call(`/therapist/admin/credentials/${ids.credential}/review`, { method: 'POST', token: submitter, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ decision: 'approve', note: '提交人尝试自审应被拒绝' }) });
  if (submitterReview.response.status !== 403) throw new Error('证据提交人可以审核自己的材料');
  const first = await call(`/therapist/admin/credentials/${ids.credential}/review`, { method: 'POST', token: reviewerOne, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ decision: 'approve', note: '已核对签发机构、姓名与有效期' }) });
  if (!first.response.ok || first.body.status !== 'first_approved' || first.body.is_certified) throw new Error('第一次复核错误地完成了认证');
  const sameReviewer = await call(`/therapist/admin/credentials/${ids.credential}/review`, { method: 'POST', token: reviewerOne, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ decision: 'approve', note: '同一复核人不得完成第二次复核' }) });
  if (sameReviewer.response.status !== 403) throw new Error('同一管理员可以完成两次复核');
  const second = await call(`/therapist/admin/credentials/${ids.credential}/review`, { method: 'POST', token: reviewerTwo, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ decision: 'approve', note: '独立复核证据摘要与原文件一致' }) });
  if (!second.response.ok || second.body.status !== 'approved' || !second.body.is_certified) throw new Error('第二次独立复核未完成认证');

  const history = await call('/therapist/admin/credentials?view=history&page=1&limit=10', { token: reviewerTwo });
  if (!history.response.ok || !history.body.credentials?.some(item => item.id === ids.credential && item.status === 'approved' && item.evidence_sha256?.length === 64)) throw new Error('资质历史或文件摘要不可追踪');
  const evidence = await call(`/therapist/admin/credentials/${ids.credential}/evidence`, { token: reviewerTwo });
  if (!evidence.response.ok || evidence.body.toString() !== '%PDF-1.4\ncredential-proof') throw new Error('加密证据下载内容不一致');
  const deniedEvidence = await call(`/therapist/admin/credentials/${ids.credential}/evidence`, { token: therapistToken });
  if (deniedEvidence.response.status !== 403) throw new Error('非管理员可以下载资质证据');
  const publicProfile = await call(`/therapist/${ids.therapist}`);
  if (!publicProfile.response.ok || !publicProfile.body.therapist?.is_certified) throw new Error('双人复核后公开目录仍不可见');

  console.log('PASS professional credential governance: encrypted evidence, submitter isolation, two distinct reviewers, audit-ready history');
}

async function cleanup() {
  const connection = await mysql.createConnection({ host: process.env.DB_HOST, port: Number(process.env.DB_PORT || 3306), user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_NAME });
  try {
    if (ids.credential) await connection.execute('DELETE FROM professional_credentials WHERE public_id=?', [ids.credential]);
    if (ids.therapist) await connection.execute('DELETE FROM therapists WHERE id=?', [ids.therapist]);
    for (const id of ids.users.reverse()) await connection.execute('DELETE FROM users WHERE id=?', [id]);
  } finally { await connection.end(); }
}

main().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
  try { await cleanup(); } catch (error) { console.error(`清理失败：${error.message}`); process.exitCode = 1; }
  server.kill();
});
