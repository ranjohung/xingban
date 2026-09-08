const fs=require('fs');const assert=require('assert');const path=require('path');
const html=fs.readFileSync(path.resolve(__dirname,'..','index.html'),'utf8');
const story=fs.readFileSync(path.resolve(__dirname,'..','backend','routes','story.js'),'utf8');
const safety=fs.readFileSync(path.resolve(__dirname,'..','backend','routes','safety.js'),'utf8');
['记录完成一次真实练习','成人陪同、真实完成练习后记录','sessionStorage.setItem(\'xingban_safety_skill_progress\'','activeStoryForReader','不是服从脚本','maxlength="3000"','$'+'{escapeText(story.title)}','$'+'{escapeText(s.trim())}'].forEach(marker=>assert(html.includes(marker),'安全/故事前端缺少: '+marker));
['const CATEGORIES','clean(req.body.title, 80)','clean(req.body.content, 3000)','SELECT id FROM children WHERE id = ? AND user_id = ?','results.map(publicStory)','rating < 1 || rating > 5'].forEach(marker=>assert(story.includes(marker),'故事接口缺少: '+marker));
['const verifyChild','SELECT id FROM children WHERE id = ? AND user_id = ?','req.body.completed === true','results.map(item =>','儿童或技能编号无效'].forEach(marker=>assert(safety.includes(marker),'安全接口缺少: '+marker));
assert(!html.includes("localStorage.setItem('xingban_safety_skill_progress'"),'离线练习不得长期明文保存');
console.log('安全与故事回归通过：真实练习确认、标签页降级、文本转义、故事播放链、归属和接口校验齐全。');