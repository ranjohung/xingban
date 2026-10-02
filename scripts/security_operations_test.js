const fs = require('fs');
const path = require('path');

const app = fs.readFileSync(path.resolve(__dirname, '..', 'assets', 'app.js'), 'utf8');
const mirror = fs.readFileSync(path.resolve(__dirname, '..', 'docs', 'assets', 'app.js'), 'utf8');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const checks = [
  ['release mirror matches source', mirror === app],
  ['admin entry is role gated', app.includes("currentUser?.role==='admin'?`<button onclick=\"showSecurityOperations()\"" )],
  ['direct access is role gated', app.includes("if(currentUser?.role!=='admin'){showToast('当前账号无权访问安全运营台');return}" )],
  ['loads pending deletion requests', app.includes("/sensitive/admin/deletion-requests?status=pending" )],
  ['loads processing deletion requests', app.includes("/sensitive/admin/deletion-requests?status=processing" )],
  ['loads open security alerts', app.includes("/sensitive/admin/security-alerts?status=open" )],
  ['loads acknowledged security alerts', app.includes("/sensitive/admin/security-alerts?status=acknowledged" )],
  ['supports manual alert scan', app.includes("/sensitive/admin/security-alerts/scan" )],
  ['requires meaningful resolution note', app.includes("if(note.length<5){showToast('请填写至少5字处理说明');return}" )],
  ['uses encoded record identifiers', app.includes("encodeURIComponent(id)" )],
  ['discloses minimized evidence policy', app.includes('仅显示最小工单标识与聚合证据，不展示儿童内容')],
  ['does not render raw deletion reason', !app.includes('${item.reason}')],
];

for (const [name, ok] of checks) assert(ok, `FAIL: ${name}`);
console.log(`security_operations_test: ${checks.length}/${checks.length} passed`);
