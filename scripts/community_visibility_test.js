const fs = require('fs');
const path = require('path');
const source = fs.readFileSync(path.resolve(__dirname, '../backend/routes/community.js'), 'utf8');
const visiblePostChecks = source.match(/community_posts WHERE id = \? AND moderation_status = 'visible'/g) || [];
if (visiblePostChecks.length < 4) throw new Error('社区详情、点赞、评论读取或评论写入仍可能访问暂缓内容');
if (!source.includes("community_comments WHERE post_id = ? AND moderation_status = 'visible'")) throw new Error('评论列表未限制为可见内容');
console.log('PASS community visibility boundary checks');
