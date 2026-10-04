const fs = require('fs');
const path = require('path');
const source = fs.readFileSync(path.resolve(__dirname, '../backend/routes/story.js'), 'utf8');
const checks = [
  [source.includes('verifyPlayableStory'), '故事资源未执行归属核验'],
  [source.includes('custom_stories WHERE id = ? AND user_id = ?'), '自定义故事未限制当前账号'],
  [source.includes('children WHERE id = ? AND user_id = ?'), '播放记录未核验儿童归属'],
  [(source.match(/if \(!playable\) return res\.status\(404\)/g) || []).length === 2, '播放与反馈未同时拒绝不可访问故事']
];
for (const [ok, message] of checks) if (!ok) throw new Error(message);
console.log('PASS story ownership regression checks');
