const fs = require('fs');
const html = fs.readFileSync('index.html', 'utf8');
const child = fs.readFileSync('backend/routes/child.js', 'utf8');
const assert = (ok, msg) => { if (!ok) throw new Error(msg); };
[
  ['detail uses selected id', html.includes('showChildDetail(${Number(c.id)})')],
  ['child text escaped', html.includes('${escapeText(c.name)}')],
  ['diagnosis boundary', html.includes('家庭记录情况（不代表平台诊断）')],
  ['support not ability label', html.includes('当前支持需要观察')],
  ['real profile display', html.includes('supportLabel(child.profile?.selfcare)')],
  ['nickname privacy', html.includes('建议使用昵称，不填写真实姓名')],
  ['no offline child storage', !html.includes("localStorage.setItem('xingban_children'")],
  ['server contract aligned', html.includes('communication_level: profileExtras.communication')],
  ['owner param', child.includes("router.param('id'") && child.includes('WHERE id = ? AND user_id = ?')],
  ['no forced eye contact goal', !child.includes('每天累计达到5分钟')],
  ['no automatic goals', child.includes('function generateInitialGoals() { return []; }')],
  ['field validation', child.includes('DIAGNOSIS_TYPES') && child.includes('validDate(birth_date)')],
  ['report not outcome', html.includes('只汇总家庭记录，不判断进步、退步或疗效')]
].forEach(([name, ok]) => assert(ok, `FAIL: ${name}`));
console.log('child_profile_test: 13/13 passed');
