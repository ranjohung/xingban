'use strict';

const { spawn } = require('child_process');
const path = require('path');

const PORT = 3300;
const BASE = `http://127.0.0.1:${PORT}/api`;
const server = spawn(process.execPath, ['server.js'], {
  cwd: path.resolve(__dirname, '..'),
  env: {
    ...process.env, PORT: String(PORT), NODE_ENV: 'production', USE_MOCK_DB: 'true', ALLOW_MOCK_DB: 'true',
    ALLOW_BEARER_AUTH: 'false', RETURN_BEARER_TOKEN: 'false', COOKIE_SAME_SITE: 'Strict',
    JWT_SECRET: process.env.JWT_SECRET || 'auth-session-test-secret-at-least-32-characters'
  },
  stdio: ['ignore', 'pipe', 'pipe']
});
let logs = '';
server.stdout.on('data', chunk => { logs += chunk.toString(); });
server.stderr.on('data', chunk => { logs += chunk.toString(); });

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
async function call(pathname, options = {}) {
  const response = await fetch(BASE + pathname, options);
  const body = await response.json();
  return { response, body };
}

function cookieJar(response) {
  const lines = typeof response.headers.getSetCookie === 'function' ? response.headers.getSetCookie() : [response.headers.get('set-cookie') || ''];
  const pairs = lines.map(line => line.split(';')[0]).filter(Boolean);
  return { header: pairs.join('; '), lines, csrf: pairs.find(item => item.startsWith('xingban_csrf='))?.slice('xingban_csrf='.length) || '' };
}

async function main() {
  let ready = false;
  for (let i = 0; i < 100; i += 1) {
    try { const health = await call('/health/live'); if (health.response.ok) { ready = true; break; } } catch (_) {}
    await wait(50);
  }
  if (!ready) throw new Error(`生产认证测试服务未就绪：${logs.slice(-1000)}`);

  const login = await call('/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone: '13800138000', password: '123456' }) });
  if (!login.response.ok || login.body.token) throw new Error('生产登录不得在JSON正文返回Bearer令牌');
  const jar = cookieJar(login.response);
  const sessionLine = jar.lines.find(line => line.startsWith('xingban_session=')) || '';
  const csrfLine = jar.lines.find(line => line.startsWith('xingban_csrf=')) || '';
  if (!sessionLine.includes('HttpOnly') || !sessionLine.includes('Secure') || !sessionLine.includes('SameSite=Strict')) throw new Error('生产会话Cookie缺少HttpOnly/Secure/SameSite=Strict');
  if (csrfLine.includes('HttpOnly') || !csrfLine.includes('Secure') || !jar.csrf) throw new Error('CSRF Cookie策略无效');

  const me = await call('/auth/me', { headers: { Cookie: jar.header } });
  if (!me.response.ok || me.body.user?.id !== 1) throw new Error('HttpOnly Cookie认证失败');
  const noCsrf = await call('/feedback', { method: 'POST', headers: { Cookie: jar.header, 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'bug', content: '缺少CSRF的请求不应成功' }) });
  if (noCsrf.response.status !== 403) throw new Error('Cookie写请求未强制CSRF');
  const withCsrf = await call('/feedback', { method: 'POST', headers: { Cookie: jar.header, 'Content-Type': 'application/json', 'X-CSRF-Token': decodeURIComponent(jar.csrf) }, body: JSON.stringify({ type: 'bug', content: '带CSRF的生产会话请求' }) });
  if (withCsrf.response.status !== 201) throw new Error(`合法CSRF写请求失败：${JSON.stringify(withCsrf.body)}`);
  const bearerOnly = await call('/auth/me', { headers: { Authorization: 'Bearer invalid-production-token' } });
  if (bearerOnly.response.status !== 401) throw new Error('生产环境不应接受Bearer认证');
  const logout = await call('/auth/logout', { method: 'POST', headers: { Cookie: jar.header, 'X-CSRF-Token': decodeURIComponent(jar.csrf) } });
  if (!logout.response.ok) throw new Error(`退出失败：${JSON.stringify(logout.body)}`);
  const replay = await call('/auth/me', { headers: { Cookie: jar.header } });
  if (replay.response.status !== 401) throw new Error('退出后的会话Cookie仍可重放');
  console.log('PASS production auth: HttpOnly Secure SameSite cookie, CSRF, bearer rejection, logout revocation');
}

main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => server.kill());
