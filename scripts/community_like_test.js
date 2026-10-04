const fs=require('fs'),path=require('path');
const route=fs.readFileSync(path.resolve(__dirname,'../backend/routes/community.js'),'utf8');
const schema=fs.readFileSync(path.resolve(__dirname,'../backend/config/init_db.sql'),'utf8');
const checks=[
 [schema.includes('PRIMARY KEY (post_id, user_id)'),'点赞缺少用户与帖子唯一约束'],
 [route.includes("moderation_status='visible' FOR UPDATE"),'点赞未锁定可见帖子'],
 [route.includes('INSERT INTO community_post_likes'),'点赞未写独立明细'],
 [route.includes('SELECT COUNT(*) total FROM community_post_likes'),'点赞数未从明细重算'],
 [route.includes('db.withTransaction'),'点赞切换未使用事务']
];
for(const [ok,message] of checks)if(!ok)throw new Error(message);
console.log('PASS transactional community like checks');
