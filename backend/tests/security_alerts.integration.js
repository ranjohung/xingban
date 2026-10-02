'use strict';

require('dotenv').config();
const { spawn } = require('child_process');
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const path = require('path');

const PORT = 3297;
const BASE = `http://127.0.0.1:${PORT}/api`;
const suffix = String(Date.now()).slice(-8);
const password = 'Xingban-Alert-2026!';
const createdUsers = [];
const createdAlerts = [];
const auditResourceIds = [];
const dbOptions = () => ({ host: process.env.DB_HOST, port: Number(process.env.DB_PORT || 3306), user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_NAME });
const server = spawn(process.execPath, ['server.js'], { cwd: path.resolve(__dirname, '..'), env: { ...process.env, PORT: String(PORT), NODE_ENV: 'development', USE_MOCK_DB: 'false', ALLOW_MOCK_DB: 'false' }, stdio: ['ignore','pipe','pipe'] });
let logs=''; server.stdout.on('data',chunk=>logs+=chunk); server.stderr.on('data',chunk=>logs+=chunk);
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function call(pathname,options={}){const response=await fetch(BASE+pathname,options);return{response,body:await response.json()}}
const authHeaders=token=>({'Content-Type':'application/json',Authorization:`Bearer ${token}`});

async function main(){
  let ready=false;for(let i=0;i<150;i+=1){try{const h=await call('/health/ready');if(h.response.ok&&h.body.database==='mysql'){ready=true;break}}catch(_){}await wait(100)}
  if(!ready)throw new Error(`真实MySQL后端未就绪：${logs.slice(-1200)}`);
  const connection=await mysql.createConnection(dbOptions());
  let parentId,adminId,parentPhone,adminPhone;
  try{
    const hash=await bcrypt.hash(password,10);parentPhone=`13${suffix}4`.slice(0,11);adminPhone=`12${suffix}5`.slice(0,11);
    const [parent]=await connection.execute("INSERT INTO users(phone,password,nickname,role) VALUES(?,?,?,'parent')",[parentPhone,hash,'告警测试家长']);parentId=parent.insertId;createdUsers.push(parentId);
    const [admin]=await connection.execute("INSERT INTO users(phone,password,nickname,role) VALUES(?,?,?,'admin')",[adminPhone,hash,'告警测试管理员']);adminId=admin.insertId;createdUsers.push(adminId);
    const auditRows=[];for(let i=0;i<5;i+=1){const resource=`alert-${suffix}-denied-${i}`;auditResourceIds.push(resource);auditRows.push([parentId,'parent','read','sensitive_record',resource,'denied'])}
    const decryptResource=`alert-${suffix}-decrypt`;const shareResource=`alert-${suffix}-share`;auditResourceIds.push(decryptResource,shareResource);
    auditRows.push([parentId,'parent','read','safety_plan',decryptResource,'decrypt_failed']);
    auditRows.push([parentId,'parent','deletion_requested','account',shareResource,'share_revoke_failed']);
    for(const row of auditRows)await connection.execute('INSERT INTO audit_logs(actor_user_id,actor_role,action,resource_type,resource_public_id,outcome,metadata) VALUES(?,?,?,?,?,?,JSON_OBJECT())',row);
  }finally{await connection.end()}
  const parentLogin=await call('/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({phone:parentPhone,password})});
  const adminLogin=await call('/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({phone:adminPhone,password})});
  if(!parentLogin.response.ok||!adminLogin.response.ok)throw new Error('告警测试账号登录失败');
  const denied=await call('/sensitive/admin/security-alerts',{headers:authHeaders(parentLogin.body.token)});if(denied.response.status!==403)throw new Error('普通家长可以读取安全告警');
  const before=await call('/sensitive/admin/security-alerts?status=open',{headers:authHeaders(adminLogin.body.token)});const preexisting=new Set((before.body.alerts||[]).map(item=>item.id));
  const scan=await call('/sensitive/admin/security-alerts/scan',{method:'POST',headers:authHeaders(adminLogin.body.token),body:JSON.stringify({window_minutes:15})});
  if(!scan.response.ok||scan.body.matched_rules<3)throw new Error(`安全扫描未命中三类规则：${JSON.stringify(scan.body)}`);
  const open=await call('/sensitive/admin/security-alerts?status=open',{headers:authHeaders(adminLogin.body.token)});
  createdAlerts.push(...(open.body.alerts||[]).filter(item=>!preexisting.has(item.id)).map(item=>item.id));
  const ours=(open.body.alerts||[]).filter(item=>item.subject_user_id===parentId);
  if(ours.length!==3||!ours.some(item=>item.severity==='critical')||ours.some(item=>JSON.stringify(item.evidence).includes('denied-')))throw new Error('告警队列数量、严重度或证据最小化异常');
  const target=ours.find(item=>item.rule==='repeated_denied');
  const shortNote=await call(`/sensitive/admin/security-alerts/${target.id}`,{method:'PATCH',headers:authHeaders(adminLogin.body.token),body:JSON.stringify({status:'acknowledged',resolution_note:'短'})});if(shortNote.response.status!==400)throw new Error('告警处置未强制具体说明');
  const ack=await call(`/sensitive/admin/security-alerts/${target.id}`,{method:'PATCH',headers:authHeaders(adminLogin.body.token),body:JSON.stringify({status:'acknowledged',resolution_note:'已核对账号访问来源'})});if(!ack.response.ok)throw new Error('告警无法确认');
  const resolved=await call(`/sensitive/admin/security-alerts/${target.id}`,{method:'PATCH',headers:authHeaders(adminLogin.body.token),body:JSON.stringify({status:'resolved',resolution_note:'确认是客户端重复请求，已修复并观察'})});if(!resolved.response.ok)throw new Error('告警无法解决');
  const resolvedList=await call('/sensitive/admin/security-alerts?status=resolved',{headers:authHeaders(adminLogin.body.token)});if(!(resolvedList.body.alerts||[]).some(item=>item.id===target.id))throw new Error('已解决告警无法追踪');
  console.log('PASS real MySQL security alerts: three rules, admin isolation, minimized evidence, acknowledge and resolve');
}

async function cleanup(){const connection=await mysql.createConnection(dbOptions());try{for(const id of createdAlerts)await connection.execute('DELETE FROM security_alerts WHERE public_id=?',[id]);for(const id of auditResourceIds)await connection.execute('DELETE FROM audit_logs WHERE resource_public_id=?',[id]);for(const id of createdUsers)await connection.execute('DELETE FROM users WHERE id=?',[id])}finally{await connection.end()}}
main().catch(error=>{console.error(error);process.exitCode=1}).finally(async()=>{try{await cleanup()}catch(error){console.error(`清理失败：${error.message}`);process.exitCode=1}server.kill()});
