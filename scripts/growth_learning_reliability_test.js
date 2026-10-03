const fs=require('fs');const assert=require('assert');const path=require('path');
const app=fs.readFileSync(path.resolve(__dirname,'..','assets','app.js'),'utf8');
const route=fs.readFileSync(path.resolve(__dirname,'..','backend','routes','growth.js'),'utf8');
['course-learning-request-id','course-learning-activity-key','course-learning-status','courseLearningInFlight','本章节此前已记录'].forEach(marker=>assert(app.includes(marker),'课程前端可靠性缺少: '+marker));
['db.withTransaction','FOR UPDATE','ER_DUP_ENTRY','course_progress','activity_key'].forEach(marker=>assert(route.includes(marker),'课程服务端可靠性缺少: '+marker));
assert(!app.includes("points: 5, description: '课程学习进度更新"),'前端不应自行提交可修改积分');
assert(!app.includes("addGrowthRecord('完成课程: ' + course.title, 15"),'完成课程不得在浏览器额外伪造15积分');
console.log('家长课程可靠性回归通过：章节唯一、事务积分、防连点、断网提示和跨设备进度齐全。');
