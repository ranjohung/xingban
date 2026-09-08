const fs = require('fs');
const assert = require('assert');
const html = fs.readFileSync('index.html', 'utf8');

assert(html.includes('id="nav-children"'), '移动底栏应包含孩子入口');
assert(!html.includes('id="nav-community"'), '移动底栏不应保留低频社区入口');
assert(html.includes('现在要做什么'), '首页应有任务导向入口');
for (const label of ['快速记录','孩子与记录','按情况找策略','专业协作']) {
  assert(html.includes(label), `首页缺少核心入口：${label}`);
}
assert(html.includes('let strategiesDisplayLimit = 6'), '策略列表应默认渐进展示');
assert(html.includes('function showMoreStrategies()'), '策略列表应支持显示更多');
assert(html.includes('visibleStrategies.map'), '策略列表应只渲染当前批次');
assert(html.includes('MOCK_DATA.behaviors.slice(0, 3)'), '首页近期记录应限制为3条');
assert(html.includes('MOCK_DATA.strategies.slice(0, 2)'), '首页推荐策略应限制为2条');
console.log('PASS layout information architecture checks');
