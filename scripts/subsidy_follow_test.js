const fs = require('fs');
const path = require('path');
for (const file of ['assets/app.js','docs/assets/app.js']) {
  const source=fs.readFileSync(path.resolve(__dirname,'..',file),'utf8');
  if(!source.includes("apiRequest('/finance/subsidies', 'GET')"))throw new Error(`${file} 未从服务端恢复关注状态`);
  if(!source.includes('subsidyFollowInFlight'))throw new Error(`${file} 缺少防重复交互`);
  if(!source.includes('关注状态未改变'))throw new Error(`${file} 缺少断网真实状态`);
}
const route=fs.readFileSync(path.resolve(__dirname,'../backend/routes/finance.js'),'utf8');
if(route.includes('关注成功，到期前将提醒您'))throw new Error('后端仍承诺不存在的到期提醒');
if(!route.includes('平台不会自动发送到期提醒'))throw new Error('后端未明确提醒能力边界');
if(!route.includes("deadline.match(/^每年(\\d{1,2})月$/)"))throw new Error('补贴周期日期仍可能按固定月份崩溃解析');
console.log('PASS subsidy follow reliability checks');
