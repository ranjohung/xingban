const fs = require('fs');
const vm = require('vm');

const pages = ['index.html', '星伴体验版.html', 'docs/index.html'];
const appScript = fs.readFileSync('assets/app.js', 'utf8');
new vm.Script(appScript, { filename: 'assets/app.js' });
const required = [
  'showMentalHealthTriage', 'showImmediateDangerHelp', 'showSafetyPlan',
  '心理健康照护档案', '不用于精神科紧急情况', '证据状态</span> <strong>待专业复核，需个体化调整',
  '家庭观察自动摘要', '社区不是危机热线', 'share-consent', '低负担模式'
  , '已确认没有即时危险', '当前可尝试的支持', 'renderEmergencyStrategyList(fallbackStrategies'
];

for (const page of pages) {
  const html = fs.readFileSync(page, 'utf8');
  const source = html + appScript;
  if (!html.includes('<script src="assets/app.js"></script>')) throw new Error(`${page} 未引用受控外部脚本`);
  for (const marker of required) {
    if (!source.includes(marker)) throw new Error(`${page} 缺少安全标记: ${marker}`);
  }
  [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].forEach((match, index) => {
    if (match[1].trim()) new vm.Script(match[1], { filename: `${page}:script-${index}` });
  });
  if (source.includes("document.querySelectorAll('.fixed').forEach(el => el.remove())")) {
    throw new Error(`${page} 仍存在无差别删除 fixed 元素的逻辑`);
  }
  const clickCalls = [...source.matchAll(/data-ui-call="([A-Za-z_$][\w$]*)"/g)].map(match => match[1]);
  const functionDefs = new Set([...source.matchAll(/(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/g)].map(match => match[1]));
  const missingHandlers = [...new Set(clickCalls.filter(name => !functionDefs.has(name)))];
  if (missingHandlers.length) throw new Error(`${page} 存在未定义点击处理函数: ${missingHandlers.join(', ')}`);
  if (/on(?:click|change|input|submit|keydown|error)="/i.test(source)) throw new Error(`${page} 仍存在内联事件属性`);
  const whitelistSource = (appScript.match(/const calls=\{([^}]*)\}/) || [,''])[1] + ',' + (appScript.match(/Object\.assign\(calls,\{([^}]*)\}\)/) || [,''])[1];
  const allowedHandlers = new Set(whitelistSource.split(',').map(value => value.trim()).filter(Boolean));
  const unlistedHandlers = [...new Set(clickCalls.filter(name => !allowedHandlers.has(name)))];
  if (unlistedHandlers.length) throw new Error(`${page} 存在未加入显式白名单的点击处理函数: ${unlistedHandlers.join(', ')}`);
}

const hashes = pages.map(page => fs.readFileSync(page).toString('base64'));
if (!hashes.every(value => value === hashes[0])) throw new Error('三个发布入口内容不一致');

console.log(`产品安全静态回归通过：${pages.length} 个入口，${required.length} 项关键保护。`);
