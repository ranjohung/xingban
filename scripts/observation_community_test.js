const fs=require('fs');const assert=require('assert');const path=require('path');
const html=fs.readFileSync(path.resolve(__dirname,'..','index.html'),'utf8');
const community=fs.readFileSync(path.resolve(__dirname,'..','backend','routes','community.js'),'utf8');
[
 '未提供标准化能力分数','不能据此证明因果','标签分布不代表诊断或情绪趋势',
 '当前体验数据不足以判断哭闹是否增加','不能自动选择干预',
 '$'+'{escapeText(p.title)}','$'+'{escapeText(post.content)}','$'+'{escapeText(c.content)}','$'+'{escapeText(n.content)}',
 'maxlength="80"','maxlength="2000"','maxlength="500"'
].forEach(marker=>assert(html.includes(marker),'观察/社区缺少: '+marker));
['const CATEGORIES = new Set','cleanText(req.body.title, 80)','cleanText(req.body.content, 2000)','cleanText(req.body.content, 500)','results.map(publicPost)','results.map(publicComment)','帖子编号无效'].forEach(marker=>assert(community.includes(marker),'社区接口缺少: '+marker));
assert(!html.includes('识别到最近一周哭闹行为增加'),'不得显示无数据依据趋势');
assert(!html.includes('const currentScores ='),'不得显示虚构本次能力分数');
assert(!community.includes('posts: results,'),'不得直接返回含用户ID的帖子数据库行');
console.log('观察摘要与社区回归通过：移除虚构评估，用户内容转义，接口最小化与输入校验齐全。');