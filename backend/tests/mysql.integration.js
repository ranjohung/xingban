'use strict';

require('dotenv').config();
const { spawn } = require('child_process');
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const path = require('path');
const { randomUUID } = require('crypto');

const PORT = 3299;
const BASE = `http://127.0.0.1:${PORT}/api`;
const suffix = String(Date.now()).slice(-8);
const phone = `18${suffix}1`.slice(0, 11);
const password = 'Xingban-Test-2026!';
let userId = null;
let therapistUserId = null;
let therapistId = null;
let adminUserId = null;

const server = spawn(process.execPath, ['server.js'], {
  cwd: path.resolve(__dirname, '..'),
  env: { ...process.env, PORT: String(PORT), NODE_ENV: 'development', USE_MOCK_DB: 'false', ALLOW_MOCK_DB: 'false' },
  stdio: ['ignore', 'pipe', 'pipe']
});
let serverLog = '';
server.stdout.on('data', chunk => { serverLog += chunk.toString(); });
server.stderr.on('data', chunk => { serverLog += chunk.toString(); });

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
async function request(pathname, options = {}) {
  const response = await fetch(BASE + pathname, options);
  const body = await response.json();
  return { response, body };
}

async function main() {
  let ready = false;
  for (let i = 0; i < 150; i += 1) {
    try {
      const health = await request('/health/ready');
      if (health.response.ok && health.body.database === 'mysql') { ready = true; break; }
    } catch (_) {}
    await wait(100);
  }
  if (!ready) throw new Error(`真实MySQL后端未就绪：${serverLog.slice(-1200)}`);

  const registered = await request('/auth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone, password, nickname: '集成测试家长' }) });
  if (registered.response.status !== 201 || !registered.body.token) throw new Error(`注册失败：${JSON.stringify(registered.body)}`);
  userId = registered.body.user.id;
  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${registered.body.token}` };

  const therapistPhone = `17${suffix}2`.slice(0, 11);
  const adminPhone = `16${suffix}3`.slice(0, 11);
  const setupConnection = await mysql.createConnection({ host: process.env.DB_HOST, port: Number(process.env.DB_PORT || 3306), user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_NAME });
  try {
    const passwordHash = await bcrypt.hash(password, 10);
    const [userResult] = await setupConnection.execute("INSERT INTO users (phone, password, nickname, role) VALUES (?, ?, ?, 'therapist')", [therapistPhone, passwordHash, '集成测试专业人员']);
    therapistUserId = userResult.insertId;
    const [therapistResult] = await setupConnection.execute("INSERT INTO therapists (user_id, name, phone, professional_title, specialty, is_certified) VALUES (?, ?, ?, ?, ?, TRUE)", [therapistUserId, '集成测试专业人员', therapistPhone, '临床心理专业人员', '儿童家庭支持']);
    therapistId = therapistResult.insertId;
    const [adminResult] = await setupConnection.execute("INSERT INTO users (phone, password, nickname, role) VALUES (?, ?, ?, 'admin')", [adminPhone, passwordHash, '集成测试管理员']);
    adminUserId = adminResult.insertId;
  } finally { await setupConnection.end(); }
  const therapistLogin = await request('/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone: therapistPhone, password }) });
  if (!therapistLogin.response.ok || !therapistLogin.body.token) throw new Error(`专业账号登录失败：${JSON.stringify(therapistLogin.body)}`);
  const therapistHeaders = { 'Content-Type': 'application/json', Authorization: `Bearer ${therapistLogin.body.token}` };
  const adminLogin = await request('/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone: adminPhone, password }) });
  if (!adminLogin.response.ok || !adminLogin.body.token) throw new Error(`管理员登录失败：${JSON.stringify(adminLogin.body)}`);
  const adminHeaders = { 'Content-Type': 'application/json', Authorization: `Bearer ${adminLogin.body.token}` };

  const childPayload = { client_request_id: randomUUID(), nickname: '测试儿童', birth_date: '2020-01-02', diagnosis_type: 'UNCONFIRMED', communication_level: 3, sensory_hearing: 'unknown', sensory_visual: 'sensitive' };
  const child = await request('/child', { method: 'POST', headers, body: JSON.stringify(childPayload) });
  if (child.response.status !== 201) throw new Error(`建档失败：${JSON.stringify(child.body)}`);
  const childReplay = await request('/child', { method: 'POST', headers, body: JSON.stringify(childPayload) });
  if (!childReplay.response.ok || !childReplay.body.replayed || Number(childReplay.body.child?.id) !== Number(child.body.child.id)) throw new Error('儿童档案重复提交未返回原档案');
  const childId = child.body.child.id;
  const childRead = await request(`/child/${childId}`, { headers });
  if (!childRead.response.ok || childRead.body.child.communication_level !== 'phrase' || childRead.body.child.sensory_visual !== 'sensitive' || childRead.body.child.sensory_hearing !== 'unknown') throw new Error('儿童支持等级或感官字段映射不正确');

  const interventionGoalPayload = { client_request_id: randomUUID(), goal_type: '沟通', description: '支持孩子表达暂停与拒绝', target_date: '2026-11-01' };
  const interventionGoal = await request(`/child/${childId}/goals`, { method: 'POST', headers, body: JSON.stringify(interventionGoalPayload) });
  if (interventionGoal.response.status !== 201) throw new Error(`干预目标创建失败：${JSON.stringify(interventionGoal.body)}`);
  const interventionGoalReplay = await request(`/child/${childId}/goals`, { method: 'POST', headers, body: JSON.stringify(interventionGoalPayload) });
  if (!interventionGoalReplay.response.ok || !interventionGoalReplay.body.replayed || Number(interventionGoalReplay.body.goal?.id) !== Number(interventionGoal.body.goal.id)) throw new Error('干预目标重复提交未返回原记录');

  const milestonePayload = { client_request_id: randomUUID(), milestone_id: 2, title: '找到舒适的活动节奏', description: '孩子能够表达暂停' };
  const milestone = await request(`/career/milestones/${childId}`, { method: 'POST', headers, body: JSON.stringify(milestonePayload) });
  if (milestone.response.status !== 201) throw new Error(`成长里程碑创建失败：${JSON.stringify(milestone.body)}`);
  const milestoneReplay = await request(`/career/milestones/${childId}`, { method: 'POST', headers, body: JSON.stringify(milestonePayload) });
  if (!milestoneReplay.response.ok || !milestoneReplay.body.replayed || Number(milestoneReplay.body.achievement?.id) !== Number(milestone.body.achievement.id)) throw new Error('成长里程碑重复提交未返回原记录');

  const careerGoalPayload = { client_request_id: randomUUID(), category: 'life', title: '参与选择家庭活动', description: '每周提供两个可拒绝的选择', target_date: '2026-11-15' };
  const careerGoal = await request(`/career/goals/${childId}`, { method: 'POST', headers, body: JSON.stringify(careerGoalPayload) });
  if (careerGoal.response.status !== 201) throw new Error(`生涯目标创建失败：${JSON.stringify(careerGoal.body)}`);
  const careerGoalReplay = await request(`/career/goals/${childId}`, { method: 'POST', headers, body: JSON.stringify(careerGoalPayload) });
  if (!careerGoalReplay.response.ok || !careerGoalReplay.body.replayed || Number(careerGoalReplay.body.goal?.id) !== Number(careerGoal.body.goal.id)) throw new Error('生涯目标重复提交未返回原记录');

  const financePayload = { client_request_id: randomUUID(), category: '教育用品', amount: 88.5, description: '测试记录' };
  const finance = await request(`/finance/expenses/${childId}`, { method: 'POST', headers, body: JSON.stringify(financePayload) });
  if (finance.response.status !== 201) throw new Error(`家庭记账创建失败：${JSON.stringify(finance.body)}`);
  const financeReplay = await request(`/finance/expenses/${childId}`, { method: 'POST', headers, body: JSON.stringify(financePayload) });
  if (!financeReplay.response.ok || !financeReplay.body.replayed || Number(financeReplay.body.record?.id) !== Number(finance.body.record.id)) throw new Error('家庭记账重复提交未返回原记录');

  const moodPayload = { client_request_id: randomUUID(), mood: '压力', emoji: '😰', note: '需要安排短暂替班休息' };
  const mood = await request('/family/mood', { method: 'POST', headers, body: JSON.stringify(moodPayload) });
  if (!mood.response.ok || !mood.body.record?.id) throw new Error(`照护者心情记录失败：${JSON.stringify(mood.body)}`);
  const moodReplay = await request('/family/mood', { method: 'POST', headers, body: JSON.stringify(moodPayload) });
  if (!moodReplay.response.ok || !moodReplay.body.replayed || Number(moodReplay.body.record?.id) !== Number(mood.body.record.id)) throw new Error('照护者心情重复提交未返回原记录');

  const gratitudePayload = { client_request_id: randomUUID(), partner: '共同照护者', content: '谢谢你今天接手了半小时。' };
  const gratitude = await request('/family/gratitude', { method: 'POST', headers, body: JSON.stringify(gratitudePayload) });
  if (!gratitude.response.ok || !gratitude.body.card?.id) throw new Error(`感谢卡创建失败：${JSON.stringify(gratitude.body)}`);
  const gratitudeReplay = await request('/family/gratitude', { method: 'POST', headers, body: JSON.stringify(gratitudePayload) });
  if (!gratitudeReplay.response.ok || !gratitudeReplay.body.replayed || Number(gratitudeReplay.body.card?.id) !== Number(gratitude.body.card.id)) throw new Error('感谢卡重复提交未返回原记录');

  const fraudPayload = { client_request_id: randomUUID(), title: '机构要求私下转账', type: 'institution', description: '对方要求脱离正规平台支付，作为测试线索保存。', location: '测试地区' };
  const fraud = await request('/finance/fraud-report', { method: 'POST', headers, body: JSON.stringify(fraudPayload) });
  if (fraud.response.status !== 201 || fraud.body.service_connected !== false) throw new Error(`防骗线索保存失败或服务边界错误：${JSON.stringify(fraud.body)}`);
  const fraudReplay = await request('/finance/fraud-report', { method: 'POST', headers, body: JSON.stringify(fraudPayload) });
  if (!fraudReplay.response.ok || !fraudReplay.body.replayed || Number(fraudReplay.body.report?.id) !== Number(fraud.body.report.id)) throw new Error('防骗线索重复提交未返回原记录');

  const storyPayload = { client_request_id: randomUUID(), child_id: childId, title: '去医院前我可以知道什么', category: 'daily', content: '我可以先看流程，也可以说暂停并请可信成人帮助。' };
  const story = await request('/story/custom', { method: 'POST', headers, body: JSON.stringify(storyPayload) });
  if (story.response.status !== 201 || Number(story.body.story?.child_id) !== Number(childId)) throw new Error(`自定义故事儿童归属失败：${JSON.stringify(story.body)}`);
  const storyReplay = await request('/story/custom', { method: 'POST', headers, body: JSON.stringify(storyPayload) });
  if (!storyReplay.response.ok || !storyReplay.body.replayed || Number(storyReplay.body.story?.id) !== Number(story.body.story.id)) throw new Error('自定义故事重复提交未返回原记录');

  const contactData = { contacts: [{ id: 1, name: '共同监护人', fullPhone: '13800138001' }] };
  const contactSave = await request(`/sensitive/record/emergency_contacts/${childId}`, { method: 'PUT', headers, body: JSON.stringify({ data: contactData }) });
  if (!contactSave.response.ok) throw new Error(`紧急联系人加密保存失败：${JSON.stringify(contactSave.body)}`);
  const contactRead = await request(`/sensitive/record/emergency_contacts/${childId}`, { headers });
  if (!contactRead.response.ok || contactRead.body.resource?.data?.contacts?.[0]?.fullPhone !== '13800138001') throw new Error('紧急联系人加密回读不一致');
  const foreignContactRead = await request(`/sensitive/record/emergency_contacts/${childId}`, { headers: therapistHeaders });
  if (foreignContactRead.response.status !== 404) throw new Error('紧急联系人存在跨账号读取');

  const emergencyPayload = { child_id: childId, client_request_id: randomUUID(), level: 'yellow' };
  const emergency = await request('/emergency/start', { method: 'POST', headers, body: JSON.stringify(emergencyPayload) });
  if (emergency.response.status !== 201 || !emergency.body.session?.id) throw new Error(`紧急支持会话启动失败：${JSON.stringify(emergency.body)}`);
  const emergencyReplay = await request('/emergency/start', { method: 'POST', headers, body: JSON.stringify(emergencyPayload) });
  if (!emergencyReplay.response.ok || !emergencyReplay.body.replayed || Number(emergencyReplay.body.session?.id) !== Number(emergency.body.session.id)) throw new Error('紧急支持会话重复提交未返回原会话');
  const foreignEmergencyHistory = await request(`/emergency/${childId}/history`, { headers: therapistHeaders });
  if (!foreignEmergencyHistory.response.ok || foreignEmergencyHistory.body.sessions?.length !== 0) throw new Error('紧急支持历史存在跨账号读取');
  const emergencyEnd = await request(`/emergency/end/${emergency.body.session.id}`, { method: 'POST', headers, body: JSON.stringify({ outcome: 'calm', energy_station: true }) });
  if (!emergencyEnd.response.ok || emergencyEnd.body.replayed) throw new Error(`紧急支持会话结束失败：${JSON.stringify(emergencyEnd.body)}`);
  const emergencyEndReplay = await request(`/emergency/end/${emergency.body.session.id}`, { method: 'POST', headers, body: JSON.stringify({ outcome: 'angry', energy_station: true }) });
  if (!emergencyEndReplay.response.ok || !emergencyEndReplay.body.replayed || emergencyEndReplay.body.outcome !== 'calm') throw new Error('紧急支持结果重试未保留原结果');
  const emergencyHistory = await request(`/emergency/${childId}/history`, { headers });
  if (!emergencyHistory.response.ok || emergencyHistory.body.sessions?.length !== 1 || emergencyHistory.body.sessions[0].outcome !== 'calm') throw new Error('紧急支持历史回读不一致');

  const practicePayload = { child_id: childId, client_request_id: randomUUID(), completed: true };
  const practice = await request('/safety/skills/1/practice', { method: 'POST', headers, body: JSON.stringify(practicePayload) });
  if (!practice.response.ok) throw new Error(`安全技能练习记录失败：${JSON.stringify(practice.body)}`);
  const practiceReplay = await request('/safety/skills/1/practice', { method: 'POST', headers, body: JSON.stringify(practicePayload) });
  if (!practiceReplay.response.ok || !practiceReplay.body.replayed || Number(practiceReplay.body.record?.id) !== Number(practice.body.record.id)) throw new Error('安全技能练习重复提交未返回原记录');

  const behaviorPayload = { child_id: childId, client_request_id: randomUUID(), input_type: 'text', content: '活动转换前哭泣约三分钟，提供选择后平静', behavior_category: '情绪爆发', emotion_state: '难过', intensity_level: 'medium' };
  const behavior = await request('/behavior', { method: 'POST', headers, body: JSON.stringify(behaviorPayload) });
  if (behavior.response.status !== 201) throw new Error(`记录失败：${JSON.stringify(behavior.body)}`);
  const behaviorReplay = await request('/behavior', { method: 'POST', headers, body: JSON.stringify(behaviorPayload) });
  if (!behaviorReplay.response.ok || !behaviorReplay.body.replayed || Number(behaviorReplay.body.record?.id) !== Number(behavior.body.record.id)) throw new Error('行为记录重复提交未返回原记录');
  const report = await request(`/report/generate/${childId}`, { method: 'POST', headers, body: '{}' });
  if (report.response.status !== 201) throw new Error(`周报失败：${JSON.stringify(report.body)}`);
  const reportReplay = await request(`/report/generate/${childId}`, { method: 'POST', headers, body: JSON.stringify({ week_range: 'this_week' }) });
  if (!reportReplay.response.ok || !reportReplay.body.replayed || Number(reportReplay.body.report?.id) !== Number(report.body.report.id)) throw new Error('同一周周报重试未返回原周报');
  const lastWeekReport = await request(`/report/generate/${childId}`, { method: 'POST', headers, body: JSON.stringify({ week_range: 'last_week' }) });
  if (lastWeekReport.response.status !== 201 || lastWeekReport.body.report?.week_start === report.body.report.week_start) throw new Error('上周周范围未正确生效');
  const invalidWeekReport = await request(`/report/generate/${childId}`, { method: 'POST', headers, body: JSON.stringify({ week_range: 'arbitrary' }) });
  if (invalidWeekReport.response.status !== 400) throw new Error('周报接受了任意周范围');
  const sharePayload = { report_id: report.body.report.id, therapist_id: therapistId, client_request_id: randomUUID(), scope: ['summary'], expires_days: 7, note: '供协作复核' };
  const share = await request('/therapist/share', { method: 'POST', headers, body: JSON.stringify(sharePayload) });
  if (share.response.status !== 201) throw new Error(`周报分享失败：${JSON.stringify(share.body)}`);
  const shareReplay = await request('/therapist/share', { method: 'POST', headers, body: JSON.stringify(sharePayload) });
  if (!shareReplay.response.ok || !shareReplay.body.replayed || Number(shareReplay.body.share?.id) !== Number(share.body.share.id)) throw new Error('周报分享重复提交未返回原授权');
  const feedbackPayload = { client_request_id: randomUUID(), child_id: childId, strategy_id: 1, behavior_record_id: behavior.body.record.id, effectiveness: 'effective', note: '转换支持有效', scene: '活动转换' };
  const feedback = await request('/strategy/feedback', { method: 'POST', headers, body: JSON.stringify(feedbackPayload) });
  if (feedback.response.status !== 201) throw new Error(`策略反馈失败：${JSON.stringify(feedback.body)}`);
  const feedbackReplay = await request('/strategy/feedback', { method: 'POST', headers, body: JSON.stringify(feedbackPayload) });
  if (!feedbackReplay.response.ok || !feedbackReplay.body.replayed || Number(feedbackReplay.body.feedback?.id) !== Number(feedback.body.feedback.id)) throw new Error('策略反馈重复提交未返回原反馈');
  const planPayload = { client_request_id: randomUUID(), therapist_id: therapistId, title: '待确认的转换支持计划', goal: '孩子可表达暂停', frequency: '每天一次', responsible_person: '家长', stop_conditions: '孩子不适或风险升级', review_date: '2026-10-20', status: 'pending_confirmation' };
  const plan = await request('/therapist/plans', { method: 'POST', headers, body: JSON.stringify(planPayload) });
  if (plan.response.status !== 201) throw new Error(`计划失败：${JSON.stringify(plan.body)}`);
  if (plan.body.plan.confirmation_status !== 'pending') throw new Error('关联专业人员的计划未进入待专业确认状态');
  const planReplay = await request('/therapist/plans', { method: 'POST', headers, body: JSON.stringify(planPayload) });
  if (!planReplay.response.ok || !planReplay.body.replayed || Number(planReplay.body.plan?.id) !== Number(plan.body.plan.id)) throw new Error('协作计划重复提交未返回原计划');
  const premature = await request(`/therapist/plans/${plan.body.plan.id}`, { method: 'PATCH', headers, body: JSON.stringify({ title: '待确认的转换支持计划', goal: '孩子可表达暂停', frequency: '每天一次', responsible_person: '家长', stop_conditions: '孩子不适或风险升级', review_date: '2026-10-20', status: 'active' }) });
  if (premature.response.status !== 409) throw new Error('家长在专业确认前不应启动已指派计划');
  const parentAssigned = await request('/therapist/plans/assigned', { headers });
  if (parentAssigned.response.status !== 403) throw new Error('家长不应读取专业人员待审计划队列');
  const assigned = await request('/therapist/plans/assigned', { headers: therapistHeaders });
  if (!assigned.response.ok || assigned.body.plans?.length !== 1) throw new Error('专业人员未读到指派计划');
  const reviewed = await request(`/therapist/plans/${plan.body.plan.id}/review`, { method: 'POST', headers: therapistHeaders, body: JSON.stringify({ decision: 'confirmed', note: '目标、频率和停止条件清晰，可由家长决定开始。' }) });
  if (!reviewed.response.ok || reviewed.body.confirmation_status !== 'confirmed') throw new Error(`专业确认失败：${JSON.stringify(reviewed.body)}`);
  const activated = await request(`/therapist/plans/${plan.body.plan.id}`, { method: 'PATCH', headers, body: JSON.stringify({ title: '待确认的转换支持计划', goal: '孩子可表达暂停', frequency: '每天一次', responsible_person: '家长', stop_conditions: '孩子不适或风险升级', review_date: '2026-10-20', status: 'active' }) });
  if (!activated.response.ok) throw new Error(`专业确认后仍无法启动计划：${JSON.stringify(activated.body)}`);
  const postPayload = { client_request_id: randomUUID(), title: '转换时如何提前提示', content: '想交流不含身份信息的家庭观察。', category: 'question' };
  const communityPost = await request('/community/posts', { method: 'POST', headers, body: JSON.stringify(postPayload) });
  if (communityPost.response.status !== 201) throw new Error(`社区发帖失败：${JSON.stringify(communityPost.body)}`);
  const communityPostReplay = await request('/community/posts', { method: 'POST', headers, body: JSON.stringify(postPayload) });
  if (!communityPostReplay.response.ok || !communityPostReplay.body.replayed || Number(communityPostReplay.body.post?.id) !== Number(communityPost.body.post.id)) throw new Error('社区帖子重复提交未返回原帖子');
  const commentPayload = { client_request_id: randomUUID(), content: '可以先用视觉提示说明还有两分钟。' };
  const communityComment = await request(`/community/posts/${communityPost.body.post.id}/comments`, { method: 'POST', headers, body: JSON.stringify(commentPayload) });
  if (communityComment.response.status !== 201) throw new Error(`社区评论失败：${JSON.stringify(communityComment.body)}`);
  const communityCommentReplay = await request(`/community/posts/${communityPost.body.post.id}/comments`, { method: 'POST', headers, body: JSON.stringify(commentPayload) });
  if (!communityCommentReplay.response.ok || !communityCommentReplay.body.replayed || Number(communityCommentReplay.body.comment?.id) !== Number(communityComment.body.comment.id)) throw new Error('社区评论重复提交未返回原评论');
  const communityPostRead = await request(`/community/posts/${communityPost.body.post.id}`, { headers });
  if (!communityPostRead.response.ok || Number(communityPostRead.body.post.comments_count) !== 1) throw new Error('重复评论导致评论计数不一致');
  const held = await request('/community/posts', { method: 'POST', headers, body: JSON.stringify({ title: '需要马上帮助', content: '孩子说不想活并准备吞药', category: 'emotion' }) });
  if (held.response.status !== 202 || !held.body.case_ref) throw new Error(`危机审核失败：${JSON.stringify(held.body)}`);
  const reportPayload={client_request_id:randomUUID(),target_type:'post',target_id:held.body.post_id,reason:'privacy',details:'帖子包含不必要的儿童身份信息'};
  const communityReport=await request('/community/reports',{method:'POST',headers,body:JSON.stringify(reportPayload)});if(communityReport.response.status!==201)throw new Error(`社区举报失败：${JSON.stringify(communityReport.body)}`);
  const communityReportReplay=await request('/community/reports',{method:'POST',headers,body:JSON.stringify(reportPayload)});if(!communityReportReplay.response.ok||!communityReportReplay.body.replayed||communityReportReplay.body.case_ref!==communityReport.body.case_ref)throw new Error('社区举报重复提交未返回原工单');
  const deniedProfiles = await request('/therapist/admin/profiles', { headers });
  if (deniedProfiles.response.status !== 403) throw new Error('普通家长不应读取专业资质运营清单');
  const profiles = await request('/therapist/admin/profiles', { headers: adminHeaders });
  if (!profiles.response.ok || !profiles.body.profiles?.some(item => item.id === therapistId && item.phone.includes('****'))) throw new Error('管理员专业资质清单缺失或联系方式未脱敏');
  const moderation = await request('/community/moderation/reports?status=open', { headers: adminHeaders });
  if (!moderation.response.ok || !moderation.body.reports?.some(item => item.case_ref === held.body.case_ref)) throw new Error('管理员未读取到社区危机工单');
  const resolvedCase = await request(`/community/moderation/reports/${held.body.case_ref}`, { method: 'PATCH', headers: adminHeaders, body: JSON.stringify({ status: 'resolved', resolution_note: '已按安全流程核查并完成升级联系' }) });
  if (!resolvedCase.response.ok) throw new Error('管理员无法完成社区工单处置');
  const moderationHistory = await request('/community/moderation/reports?view=history&page=1&limit=1', { headers: adminHeaders });
  if (!moderationHistory.response.ok || !moderationHistory.body.reports?.some(item => item.case_ref === held.body.case_ref) || Number(moderationHistory.body.total) < 1 || Number(moderationHistory.body.limit) !== 1) throw new Error('社区处理历史或服务端分页不可追踪');
  const pagedProfiles = await request('/therapist/admin/profiles?page=1&limit=1&certified=true', { headers: adminHeaders });
  if (!pagedProfiles.response.ok || pagedProfiles.body.profiles?.length !== 1 || Number(pagedProfiles.body.total) < 1 || Number(pagedProfiles.body.limit) !== 1) throw new Error('专业资质档案筛选分页失败');

  const [children, records, reports, feedbackList, plans, cases, events, notifications] = await Promise.all([
    request('/child', { headers }), request(`/behavior/${childId}`, { headers }), request(`/report/${childId}/list`, { headers }),
    request('/strategy/feedback/mine', { headers }),
    request('/therapist/plans/mine', { headers }), request('/community/reports/mine', { headers }),
    request(`/therapist/plans/${plan.body.plan.id}/events`, { headers }), request('/notification', { headers })
  ]);
  if (children.body.children?.length !== 1 || records.body.records?.length !== 1 || reports.body.reports?.length !== 2 || feedbackList.body.feedback?.length !== 1 || plans.body.plans?.length !== 1 || cases.body.reports?.length !== 2 || events.body.events?.length < 3 || notifications.body.notifications?.length < 1) {
    throw new Error('真实数据库回读数量不一致');
  }
  console.log(JSON.stringify({ database: 'mysql', child_id: childId, behavior_id: behavior.body.record.id, report_id: report.body.report.id, feedback_id: feedback.body.feedback.id, plan_id: plan.body.plan.id, moderation_case: held.body.case_ref }));
  console.log('PASS real MySQL integration: register, child, emergency session, behavior, strategy feedback, report, plan, moderation history pagination, readback');
}

async function cleanup() {
  if (!userId && !therapistUserId && !adminUserId) return;
  const connection = await mysql.createConnection({ host: process.env.DB_HOST, port: Number(process.env.DB_PORT || 3306), user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_NAME });
  try {
    if (userId) await connection.execute('DELETE FROM users WHERE id=?', [userId]);
    if (therapistId) await connection.execute('DELETE FROM therapists WHERE id=?', [therapistId]);
    if (therapistUserId) await connection.execute('DELETE FROM users WHERE id=?', [therapistUserId]);
    if (adminUserId) await connection.execute('DELETE FROM users WHERE id=?', [adminUserId]);
  }
  finally { await connection.end(); }
}

main().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
  try { await cleanup(); } catch (error) { console.error(`清理失败：${error.message}`); process.exitCode = 1; }
  server.kill();
});
