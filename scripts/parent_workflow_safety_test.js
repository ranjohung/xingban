const fs=require('fs');const assert=require('assert');const path=require('path');
const html=fs.readFileSync(path.resolve(__dirname,'..','index.html'),'utf8');
[
  "['攻击行为','自伤行为','跑开/走失','异常兴奋/活动骤增','绝望/谈论死亡','幻觉/妄想/意识异常']",
  "if (value === '3') showMentalHealthTriage()",
  '当前版本未接入语音识别服务',
  '本版本不会伪造识别结果',
  "file.size > 5 * 1024 * 1024",
  '图片只在本页预览，不会上传或自动分析',
  '$'+'{escapeText(b.description)}',
  '$'+'{escapeText(record.description)}',
  '$'+'{escapeText(report.aiComment)}',
  '分享给专业人员',
  '选择已核验的专业人员',
  '下次沟通建议'
].forEach(marker=>assert(html.includes(marker),'主链安全缺少: '+marker));
assert(!html.includes('已切换到语音输入模拟模式'),'麦克风失败不得伪装录音');
assert(!html.includes('（演示）孩子今天情绪波动较大'),'不得伪造识别文本');
assert(!html.includes('继续保持正向强化训练，注意观察孩子的情绪变化。'),'周报不得给无依据固定干预建议');
console.log('主链家长安全回归通过：风险分流、语音/图片真实能力边界、动态文本转义与专业分享用语齐全。');