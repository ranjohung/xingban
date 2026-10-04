const fs = require('fs');
const path = require('path');

const source = fs.readFileSync(path.resolve(__dirname, '../backend/routes/strategy.js'), 'utf8');
const checks = [
  [source.includes('const requireOwnedChild'), '缺少儿童归属核验函数'],
  [(source.match(/requireOwnedChild\(req\.user\.id, childId/g) || []).length >= 2, '技能泛化读写未全部核验当前账号'],
  [source.includes('WHERE id = ? AND child_id = ?'), '技能泛化更新未限制儿童归属'],
  [source.includes("if (!owned) return res.status(404)"), '越权请求未使用不可枚举的404响应'],
  [source.includes('GENERALIZATION_STATUSES'), '技能泛化状态未使用白名单']
];

for (const [ok, message] of checks) if (!ok) throw new Error(message);
console.log('PASS strategy ownership regression checks');
