const fs=require('fs');const assert=require('assert');const path=require('path');const html=fs.readFileSync(path.resolve(__dirname,'..','index.html'),'utf8');
[
  "textContent = '专业协作'", 'AI会前问题整理', 'AI不诊断、不决定治疗、不修改药物',
  'getProfessionalRoute', 'generateProfessionalBrief', 'copyProfessionalBrief', 'clearProfessionalBrief',
  '现在无法保证安全，或我不确定', "navigateTo('emergency')", '持续多久', '频率或强度',
  '与平时相比', '发生前后与可能诱因', '已经尝试过什么，孩子如何反应',
  '药物、补充剂和近期变化', '这次最想得到什么帮助', '演示资料·未核验',
  '加入待确认计划', '确认目标、频率、执行人、停止条件和复查日期', 'escapeText'
].forEach(marker=>assert(html.includes(marker),`专业协作缺少关键内容: ${marker}`));
['发育行为儿科','儿童精神科','言语语言治疗师','作业治疗师','营养/吞咽团队','特教老师','开药医生'].forEach(role=>assert(html.includes(role),`缺少专业分流角色: ${role}`));
assert(!html.includes('${t.rating}'),'不得展示未核验人员星级');
assert(html.includes("sessionStorage.setItem('xingban_professional_brief'"),'敏感会前摘要应仅保存在当前标签页');
console.log('专业协作回归通过：会前整理、风险分流、角色匹配、隐私边界、计划转化与未核验标识齐全。');