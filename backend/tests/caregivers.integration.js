'use strict';
require('dotenv').config();
const mysql=require('mysql2/promise');const jwt=require('jsonwebtoken');const {spawn}=require('child_process');const path=require('path');
const port=3313,base=`http://127.0.0.1:${port}/api`;let db,server,serverLog='';const ids=[];
const token=(id)=>jwt.sign({id,role:'parent',jti:`cg-${id}`},process.env.JWT_SECRET,{expiresIn:'5m'});
const request=async(p,id,method='GET',body)=>{const r=await fetch(base+p,{method,headers:{Authorization:`Bearer ${token(id)}`,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});let data={};try{data=await r.json()}catch(_){}return{r,data}};
async function main(){
 db=await mysql.createConnection({host:process.env.DB_HOST,port:Number(process.env.DB_PORT||3306),user:process.env.DB_USER,password:process.env.DB_PASSWORD,database:process.env.DB_NAME});
 const suffix=String(Date.now()).slice(-8),phones=[`14${suffix}1`,`14${suffix}2`,`14${suffix}3`].map(v=>v.slice(0,11));
 for(let i=0;i<3;i++){const[u]=await db.execute("INSERT INTO users(phone,password,nickname,role) VALUES (?,?,'照护权限测试','parent')",[phones[i],'unused']);ids.push(u.insertId)}
 const[c]=await db.execute("INSERT INTO children(user_id,nickname,birth_date,diagnosis_type) VALUES (?,'授权测试儿童','2020-01-02','ASD')",[ids[0]]);
 server=spawn(process.execPath,['server.js'],{cwd:path.resolve(__dirname,'..'),env:{...process.env,PORT:String(port),NODE_ENV:'development',USE_MOCK_DB:'false',WEEKLY_REPORT_SCAN_INTERVAL_MINUTES:'0'},stdio:['ignore','pipe','pipe']});
 server.stdout.on('data',c=>serverLog+=c);server.stderr.on('data',c=>serverLog+=c);
 for(let i=0;i<80;i++){try{if((await fetch(base+'/health/ready')).ok)break}catch(_){}await new Promise(r=>setTimeout(r,100))}
 const created=await request('/family/caregivers/invitations',ids[0],'POST',{child_id:c.insertId,phone:phones[1],permissions:['profile_summary','weekly_reports','invalid']});
 if(created.r.status!==201||created.data.invitation.permissions.length!==2||created.data.delivery!=='manual')throw new Error(`创建邀请失败 ${created.r.status}`);
 const wrong=await request('/family/caregivers/invitations/accept',ids[2],'POST',{invitation_code:created.data.invitation_code});if(wrong.r.status!==403)throw new Error('非目标手机号接受邀请未被拒绝');
 const accepted=await request('/family/caregivers/invitations/accept',ids[1],'POST',{invitation_code:created.data.invitation_code});if(!accepted.r.ok)throw new Error('目标照护者接受失败');
 const children=await request('/family/caregivers/children',ids[1]);if(children.data.children?.length!==1||children.data.children[0].diagnosis_type!=='ASD'||children.data.children[0].permissions.includes('invalid'))throw new Error('儿童级字段授权错误');
 const listed=await request('/family/caregivers',ids[0]);const membership=listed.data.caregivers?.[0];if(!membership||!String(membership.phone).includes('****'))throw new Error('所有者列表或手机号脱敏错误');
 const foreignRevoke=await request(`/family/caregivers/${membership.id}`,ids[2],'DELETE');if(foreignRevoke.r.status!==404)throw new Error('非所有者能够撤销授权');
 const revoked=await request(`/family/caregivers/${membership.id}`,ids[0],'DELETE');if(!revoked.r.ok)throw new Error('所有者撤销失败');
 const after=await request('/family/caregivers/children',ids[1]);if(after.data.children?.length)throw new Error('撤销后仍可读取儿童摘要');
 const[events]=await db.execute("SELECT action FROM audit_logs WHERE actor_user_id IN (?,?) AND action LIKE 'caregiver_%'",[ids[0],ids[1]]);if(events.length<3)throw new Error('共同照护操作审计不完整');
 console.log('PASS real MySQL caregivers: own-account invite, phone binding, scoped child fields, owner-only revoke, audit');
}
main().catch(e=>{console.error(e);console.error(serverLog.slice(-2000));process.exitCode=1}).finally(async()=>{if(server)server.kill();if(db){for(const id of ids)await db.execute('DELETE FROM users WHERE id=?',[id]).catch(()=>{});await db.end()}process.exit(process.exitCode||0)});
