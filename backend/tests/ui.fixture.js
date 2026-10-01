'use strict';

const mysql = require('mysql2/promise');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

const BASE = process.env.UI_FIXTURE_API || 'http://127.0.0.1:3001/api';
const PASSWORD = 'Xingban-Ui-2026!';

async function request(pathname, options = {}) {
  const response = await fetch(BASE + pathname, options);
  const body = await response.json();
  if (!response.ok) throw new Error(`${pathname} ${response.status}: ${JSON.stringify(body)}`);
  return body;
}

async function setup() {
  const phone = `18${String(Date.now()).slice(-9)}`;
  const registered = await request('/auth/register', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone, password: PASSWORD, nickname: '真机验收家长' })
  });
  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${registered.token}` };
  const created = await request('/child', {
    method: 'POST', headers,
    body: JSON.stringify({ nickname: '真机验收儿童', birth_date: '2020-01-02', diagnosis_type: 'UNCONFIRMED' })
  });
  await request('/behavior', {
    method: 'POST', headers,
    body: JSON.stringify({ child_id: created.child.id, input_type: 'text', content: '转换活动前哭泣三分钟，给出两个选择后逐渐平静', behavior_category: '情绪爆发', emotion_state: '难过', intensity_level: 'medium' })
  });
  await request(`/report/generate/${created.child.id}`, { method: 'POST', headers, body: '{}' });
  await request('/strategy/feedback', { method: 'POST', headers, body: JSON.stringify({ child_id: created.child.id, strategy_id: 1, effectiveness: 'effective', note: '测试反馈', scene: '活动转换' }) });
  await request('/therapist/plans', { method: 'POST', headers, body: JSON.stringify({ title: '真机验收计划', goal: '表达暂停', status: 'pending_confirmation' }) });
  process.stdout.write(JSON.stringify({ phone, password: PASSWORD }));
}

async function cleanup(phone) {
  if (!/^1\d{10}$/.test(phone || '')) throw new Error('cleanup requires a valid fixture phone');
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST, port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_NAME
  });
  try { await connection.execute('DELETE FROM users WHERE phone=?', [phone]); }
  finally { await connection.end(); }
  process.stdout.write('fixture cleaned');
}

const [action, value] = process.argv.slice(2);
(action === 'cleanup' ? cleanup(value) : setup()).catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
