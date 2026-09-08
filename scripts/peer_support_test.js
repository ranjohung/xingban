const fs = require('fs');
const html = fs.readFileSync('index.html', 'utf8');
const checks = [
  ['single item boundary', html.includes('单题主观记录，不是量表、诊断或风险评估')],
  ['demo community warning', html.includes('群组、动态和活动均为演示数据，没有真实成员、报名或实时值守')],
  ['not crisis service', html.includes('这里不是危机热线')],
  ['high score route', html.includes('if (score >= 8) showPeerSafetyCheck()')],
  ['direct safety question', html.includes('伤害自己、结束生命、伤害他人的想法')],
  ['emergency route', html.includes("navigateTo('emergency')")],
  ['professional route', html.includes("navigateTo('therapist')")],
  ['message privacy and limit', html.includes('maxlength="500" placeholder="体验消息：不要填写姓名、电话、住址、病历或学校信息"')],
  ['no fake send success', !html.includes("showToast('消息发送成功')")],
  ['demo send status', html.includes('未发送到真实群组')],
  ['escaped group name', html.includes('${escapeText(g.name)}')],
  ['escaped message', html.includes('${escapeText(m.content)}')],
  ['tried not completed', html.includes('标记已尝试')]
];
const failed = checks.filter(([, ok]) => !ok);
if (failed.length) {
  console.error(failed.map(([name]) => `FAIL: ${name}`).join('\n'));
  process.exit(1);
}
console.log(`peer_support_test: ${checks.length}/${checks.length} passed`);