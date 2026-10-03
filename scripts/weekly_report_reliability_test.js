const fs = require('fs');
const assert = require('assert');
const path = require('path');

const app = fs.readFileSync(path.resolve(__dirname, '..', 'assets', 'app.js'), 'utf8');
const report = fs.readFileSync(path.resolve(__dirname, '..', 'backend', 'routes', 'report.js'), 'utf8');

['report-generate-status', 'report-generate-button', 'reportGenerateInFlight', "{ week_range }", '该周周报此前已生成', '未确认生成'].forEach(marker =>
  assert(app.includes(marker), `周报前端可靠性缺少: ${marker}`));
['getWeekBounds', "['this_week', 'last_week']", 'replayed', 'observation_summary', 'next_week_planning', '不能据此判断情况稳定'].forEach(marker =>
  assert(report.includes(marker), `周报接口边界缺少: ${marker}`));
['next_week_prediction', 'confidence:', '本周行为记录较为平稳', '继续保持！'].forEach(marker =>
  assert(!report.includes(marker), `周报仍含误导性预测或评价: ${marker}`));

console.log('周报可靠性回归通过：周范围契约、防重复交互、重放状态和非预测边界齐全。');
