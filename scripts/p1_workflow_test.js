const fs = require('fs');
const assert = require('assert');
const root = require('path').resolve(__dirname, '..');
const read = file => fs.readFileSync(require('path').join(root, file), 'utf8');
const html = read('index.html');
const behavior = read('backend/routes/behavior.js');
const strategy = read('backend/routes/strategy.js');
const report = read('backend/routes/report.js');
[
  "await openRecommendedStrategies(newRecord, child_id, behavior_category)",
  "behavior_record_id: context?.behaviorRecordId || null",
  "addGrowthRecord('完成策略反馈'",
  "MOCK_DATA.reports = [generated",
  "serverContent.summary?.total_records"
].forEach(marker => assert(html.includes(marker), `缺少前端闭环标记: ${marker}`));
assert(behavior.indexOf("router.get('/categories'") < behavior.indexOf("router.get('/:childId'"), '分类路由必须位于动态路由之前');
assert(behavior.includes('SELECT id FROM children WHERE id = ? AND user_id = ?'), '行为创建缺少儿童归属校验');
assert(behavior.includes("router.get('/record/:id'"), '记录详情路由需避免与儿童列表冲突');
assert(strategy.includes('关联记录不存在或不属于当前家庭'), '策略反馈缺少原记录归属校验');
assert(strategy.includes('behavior_record_id: behavior_record_id || null'), '反馈结果缺少原记录ID');
assert(report.includes("router.param('childId'"), '周报路由缺少统一儿童归属校验');
assert(report.includes('WHERE id = ? AND user_id = ?'), '周报所有者操作缺少用户条件');
console.log('P1核心业务闭环静态回归通过：记录→推荐→执行→反馈→周报→分享归属。');