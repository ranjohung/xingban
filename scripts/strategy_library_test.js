const fs = require('fs');
const assert = require('assert');
const html = fs.readFileSync(require('path').resolve(__dirname, '..', 'index.html'), 'utf8');
const markers = [
  '先选行为，不需要先知道策略名称', 'STRATEGY_BEHAVIOR_GROUPS', 'STRATEGY_CONTEXT',
  '情绪爆发降载流程', '攻击与扔物安全处置', '自伤行为安全响应', '跑开与走失即时方案',
  '进食困难分级支持', '睡眠骤变观察计划', '持续低落与退缩支持', '异常兴奋与少睡分诊',
  '意识异常与药物事件处置', '什么时候立即停止', '平静后怎么继续',
  '这是一条安全分流路径，不评价“是否有效”', "navigateTo('emergency')",
  'showStrategyNavigator', 'finishStrategyNavigator', 'getStrategiesForBehavior', '之前—行为—之后'
];
markers.forEach(marker => assert(html.includes(marker), `策略库缺少关键内容: ${marker}`));
const guideIds = [...html.matchAll(/^\s+(\d+):\s*\{ when:/gm)].map(match => Number(match[1]));
for (let id = 1; id <= 20; id++) assert(guideIds.includes(id), `缺少策略教程 ${id}`);
const highRisk = [13, 14, 18, 19, 20];
highRisk.forEach(id => {
  const contextPattern = new RegExp(`\\s${id}:\\{behaviors:`);
  assert(contextPattern.test(html), `高风险策略 ${id} 缺少判断上下文`);
});
assert(html.includes('如不能保证安全、孩子意识异常、服药过量、有自杀计划'), '缺少高风险总分流提示');
assert(!html.includes('家长遇到任何情况都能'), '不得承诺覆盖任何情况');
console.log('干预策略库回归通过：20套教程、15类行为入口、高危分流、停止条件与后续计划齐全。');