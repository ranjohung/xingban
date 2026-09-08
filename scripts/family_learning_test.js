const fs=require('fs');const assert=require('assert');const path=require('path');
const html=fs.readFileSync(path.resolve(__dirname,'..','index.html'),'utf8');
const growth=fs.readFileSync(path.resolve(__dirname,'..','backend','routes','growth.js'),'utf8');
['COURSE_CONTENT','本章跟着做','完成前核对','边界与停止条件','course-complete-confirm','请先阅读并确认本章边界','不重复增加积分','保存到当前标签页','sessionStorage.setItem','学习积分','学习活动分布'].forEach(marker=>assert(html.includes(marker),'家庭/课程缺少: '+marker));
['const EARNING_RULES','const rule = EARNING_RULES[action]','points: rule.points','不支持的学习记录类型'].forEach(marker=>assert(growth.includes(marker),'成长接口缺少: '+marker));
assert(!html.includes('>保存到本机</button>'),'家庭压力笔记不得误导为长期安全保存');
assert(!growth.includes('const { action, points'),'服务端不得接受客户端任意积分');
console.log('家庭支持与家长课程回归通过：标签页隐私、实质课程、完成确认、去能力评分化和服务端固定积分齐全。');