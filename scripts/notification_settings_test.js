const fs = require('fs');
const html = fs.readFileSync('index.html', 'utf8');
const route = fs.readFileSync('backend/routes/notification.js', 'utf8');
const checks = [
  ['notification output minimized', route.includes('SELECT id, title, content, type, is_read, created_at')],
  ['pagination clamped', route.includes('Math.min(50')],
  ['ids normalized', route.includes('new Set(req.body.ids.map(Number)')],
  ['send cannot target arbitrary user', !route.includes('const { user_id') && route.includes('[req.user.id, title, content, type]')],
  ['safety notification protected', route.includes("req.body.type) && req.body.type !== 'safety'")],
  ['notification content limits', route.includes('clean(req.body.title, 80)') && route.includes('clean(req.body.content, 500)')],
  ['preferences capability boundary', html.includes('尚未注册操作系统推送或后台定时任务')],
  ['anonymous boundary', html.includes('仅控制前台昵称显示，不等于不可识别')],
  ['export confirmation', html.includes('export-risk-confirm') && html.includes('文件是未加密的 JSON')],
  ['current version', html.includes('4.0.0 受监督测试版')]
];
const failed=checks.filter(([,ok])=>!ok);if(failed.length){console.error(failed.map(([n])=>'FAIL: '+n).join('\n'));process.exit(1);}console.log('notification_settings_test: 10/10 passed');