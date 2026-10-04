const fs = require('fs');
const path = require('path');
const route = fs.readFileSync(path.resolve(__dirname, '../backend/routes/therapist.js'), 'utf8');
const schema = fs.readFileSync(path.resolve(__dirname, '../backend/config/init_db.sql'), 'utf8');
const checks = [
  [schema.includes('UNIQUE KEY uq_therapist_rating_parent'), '评分缺少家长与专业人员唯一约束'],
  [route.includes('EXISTS (SELECT 1 FROM report_shares'), '评分未核验真实协作关系'],
  [route.includes('ON DUPLICATE KEY UPDATE rating=VALUES(rating)'), '重复评分未更新原记录'],
  [route.includes("SELECT AVG(rating) average,COUNT(*) count FROM therapist_ratings"), '汇总未从评分明细重算'],
  [route.includes('db.withTransaction'), '评分明细与汇总未使用事务']
];
for (const [ok, message] of checks) if (!ok) throw new Error(message);
console.log('PASS therapist rating reliability checks');
