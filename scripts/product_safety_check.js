const fs = require('fs');
const vm = require('vm');

const pages = ['index.html', '星伴体验版.html', 'docs/index.html'];
const required = [
  'showMentalHealthTriage', 'showImmediateDangerHelp', 'showSafetyPlan',
  '心理健康照护档案', '不用于精神科紧急情况', '临床有效率</span> <strong>尚未经验证',
  '家庭观察自动摘要', '社区不是危机热线', 'share-consent', '低负担模式'
];

for (const page of pages) {
  const html = fs.readFileSync(page, 'utf8');
  for (const marker of required) {
    if (!html.includes(marker)) throw new Error(`${page} 缺少安全标记: ${marker}`);
  }
  [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].forEach((match, index) => {
    if (match[1].trim()) new vm.Script(match[1], { filename: `${page}:script-${index}` });
  });
  if (html.includes("document.querySelectorAll('.fixed').forEach(el => el.remove())")) {
    throw new Error(`${page} 仍存在无差别删除 fixed 元素的逻辑`);
  }
}

const hashes = pages.map(page => fs.readFileSync(page).toString('base64'));
if (!hashes.every(value => value === hashes[0])) throw new Error('三个发布入口内容不一致');

console.log(`产品安全静态回归通过：${pages.length} 个入口，${required.length} 项关键保护。`);
