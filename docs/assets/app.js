// === API配置 ===
    const isLocalPreview = location.protocol === 'file:' || ['localhost', '127.0.0.1'].includes(location.hostname);
    function resolveConfiguredApiBase() {
      const raw = Object.prototype.hasOwnProperty.call(window, 'XINGBAN_API_BASE') ? window.XINGBAN_API_BASE : '';
      if (typeof raw !== 'string' || !raw.trim()) return '';
      try {
        const parsed = new URL(raw.trim(), location.href);
        const localHttp = parsed.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(parsed.hostname);
        if (parsed.protocol !== 'https:' && !localHttp) return '';
        return parsed.href.replace(/\/$/, '');
      } catch (_) { return ''; }
    }
    const configuredApiBase = resolveConfiguredApiBase();
    const API_BASE = configuredApiBase || (isLocalPreview ? 'http://127.0.0.1:3001/api' : '');
    let useMockMode = !API_BASE;

    let token = null;
    let authenticatedSession = false;

    function setToken(newToken) {
      token = newToken;
      // Bearer仅供本地兼容测试；生产会话由HttpOnly Cookie承载，脚本无法读取。
      localStorage.removeItem('xingban_token');
    }

    function getToken() {
      return token;
    }

    function getCookie(name) {
      const prefix = `${name}=`;
      const item = document.cookie.split(';').map(value => value.trim()).find(value => value.startsWith(prefix));
      return item ? decodeURIComponent(item.slice(prefix.length)) : '';
    }

    function mockLogin(phone, password) {
      if (password !== '123456') {
        return { success: false, error: '密码错误' };
      }
      const mockUsers = [
        { id: 1, phone: '13800138000', nickname: '小明家长', role: 'parent' },
        { id: 2, phone: '13900139000', nickname: '小红妈妈', role: 'parent' },
        { id: 3, phone: '17351455944', nickname: '用户家长', role: 'parent' }
      ];
      const user = mockUsers.find(u => u.phone === phone);
      if (!user) {
        return { success: false, error: '该账号不存在，请先注册' };
      }
      return {
        success: true,
        message: '登录成功（演示模式）',
        token: 'mock_token_' + phone,
        user: user
      };
    }

    function mockRegister(phone, password, nickname) {
      if (password !== '123456') {
        return { success: false, error: '密码错误' };
      }
      return {
        success: true,
        message: '注册成功（演示模式）',
        token: 'mock_token_' + phone,
        user: { id: 99, phone: phone, nickname: nickname || '家长', role: 'parent' }
      };
    }

    async function apiRequest(url, method = 'GET', data = null) {
      if (useMockMode) {
        // 知识库依赖本地后端服务，离线时明确告知，不伪造答案
        if (url.startsWith('/knowledge/')) {
          return {
            success: false,
            error: '知识库服务未连接。请先启动后端服务（backend 目录执行 npm start），再回到本页提问。'
          };
        }
        if (url === '/auth/login' && method === 'POST') {
          return mockLogin(data.phone, data.password);
        }
        if (url === '/auth/register' && method === 'POST') {
          return mockRegister(data.phone, data.password, data.nickname);
        }
        if (url === '/auth/me' && method === 'GET') {
          return { success: true, user: { id: 1, phone: '13800138000', nickname: '小明家长', role: 'parent' } };
        }
        if (url.startsWith('/child') && method === 'GET') {
          return { success: true, children: [] };
        }
        if (url.startsWith('/strategy') && method === 'GET') {
          return { success: true, strategies: MOCK_DATA.strategies };
        }
        if (url.startsWith('/community/posts') && method === 'GET') {
          return { success: true, posts: MOCK_DATA.communityPosts, pagination: { page: 1, limit: 10, total: 5 } };
        }
        if (url.startsWith('/notification') && method === 'GET') {
          return { success: true, notifications: MOCK_DATA.notifications, pagination: { page: 1, limit: 20, total: 4 }, unread_count: 2 };
        }
        if (url.startsWith('/behavior') && method === 'GET') {
          return { success: true, records: [] };
        }
        if (url === '/behavior' && method === 'POST') {
          return { success: true, record: { id: Date.now(), child_id: data.child_id, ai_analysis: { behavior_category: data.behavior_category } } };
        }
        if (url.startsWith('/strategy/recommend/') && method === 'GET') {
          return { success: true, strategies: MOCK_DATA.strategies.slice(0, 3), consistency_check: null };
        }
        if (url === '/strategy/feedback' && method === 'POST') {
          return { success: true, feedback: { id: Date.now(), effectiveness: data.effectiveness } };
        }
        if (url.startsWith('/report/generate/') && method === 'POST') {
          return { success: true, report: { id: Date.now(), content: { summary: {} } } };
        }
        if (url.startsWith('/report') && method === 'GET') {
          return { success: true, report: MOCK_DATA.report };
        }
        if (url.startsWith('/family') && method === 'GET') {
          return { success: true, records: [], gratitude: [], insights: [] };
        }
        if (url.startsWith('/growth') && method === 'GET') {
          return { success: true, profile: MOCK_DATA.growthProfile, records: MOCK_DATA.growthRecords };
        }
        if (url.startsWith('/safety') && method === 'GET') {
          return { success: true, profile: {}, skills: MOCK_DATA.safetySkills, records: [] };
        }
        if (url === '/career/simulator' && method === 'POST') {
          return { success: true, disclaimer: '体验模式本地生成：这是讨论清单，未上传或保存，不预测孩子未来，也不替代专业评估。', support_plan: buildLocalCareerSupportPlan(data.focus_domains, data.support_level) };
        }
        if (url.startsWith('/story') && method === 'GET') {
                  const path = url.replace('/story', '');
                  if (path === '/library' || path.startsWith('/library?')) {
                    return { success: true, stories: MOCK_DATA.storyLibrary, custom: [], records: [] };
                  }
                  if (path.startsWith('/library/') && !path.includes('play')) {
                    const id = parseInt(path.split('/')[2]);
                    const story = activeStoryForReader && Number(activeStoryForReader.id) === Number(id) ? activeStoryForReader : MOCK_DATA.storyLibrary.find(s => Number(s.id) === Number(id));
                    return { success: true, story: story || null };
                  }
                  return { success: true, stories: MOCK_DATA.storyLibrary, custom: [], records: [] };
                }
                if (url === '/therapist/plans/mine' && method === 'GET') {
                  return { success: true, plans: JSON.parse(sessionStorage.getItem('xingban_professional_actions') || '[]') };
                }
                if (url === '/therapist/plans' && method === 'POST') {
                  return { success: true, plan: { id: Date.now(), ...data, created_at: new Date().toISOString() } };
                }
                if (url.startsWith('/therapist') && method === 'GET') {
                  if (url.includes('/feedback')) {
                    return { success: true, feedback: MOCK_DATA.therapistFeedback };
                  }
                  return { success: true, therapists: MOCK_DATA.therapists };
                }
                if (url.startsWith('/therapist/share') && method === 'POST') {
                  return { success: true, message: '周报已分享给康复师' };
                }
                if (url.startsWith('/growth/courses') && method === 'GET') {
                  return { success: true, courses: MOCK_DATA.growthCourses };
                }
                if (url.startsWith('/growth/course/') && method === 'POST') {
                  return { success: true, message: '学习进度已更新' };
                }
                if (url.startsWith('/achievements') && method === 'GET') {
                  return { success: true, achievements: MOCK_DATA.achievements };
                }
                if (url.startsWith('/emergency/strategies') && method === 'GET') {
                  const level = url.includes('level=') ? url.split('level=')[1].split('&')[0] : 'green';
                  const allStrategies = {
                    green: [
                      { name: '停止-思考-行动', description: '引导孩子停下来，深呼吸，思考接下来该怎么做' },
                      { name: '有限选择法', description: '给出2个简单选择，让孩子感受到控制感' },
                      { name: '视觉提示卡', description: '出示图片卡片，帮助孩子理解当前情况' },
                      { name: '陪伴等待', description: '安静地陪在孩子身边，等待情绪自然平复' }
                    ],
                    yellow: [
                      { name: '深呼吸引导', description: '带孩子一起做深呼吸：吸气4秒、保持4秒、呼气6秒' },
                      { name: '安全空间', description: '引导孩子到预设的安全角落，提供安抚物品' },
                      { name: '感官调节', description: '提供感官玩具或压力背心，帮助孩子自我调节' },
                      { name: '转移注意力', description: '用孩子喜欢的活动或物品转移注意力' }
                    ],
                    red: [
                      { name: '立即安全分流', description: '无法保证安全或拿不准时，不让孩子独处，立即联系120/110和既往就诊机构' },
                      { name: '降低危险物可及性', description: '只在不危及成人安全、不引发对抗时，移开可安全移除的药物、刀具等危险物' },
                      { name: '保留关键信息', description: '准备发生时间、伤情、用药、睡眠、意识变化和位置信息交给急救人员' }
                    ]
                  };
                  return { success: true, strategies: allStrategies[level] || allStrategies.green };
                }
                if (url === '/community/posts' && method === 'POST') {
                  if (/自杀|不想活|结束生命|伤害自己|伤害孩子|服药过量|吞药|幻觉|妄想|意识不清/.test(`${data.title}\n${data.content}`)) {
                    return { success: true, held_for_review: true, case_ref: `demo-${Date.now()}`, safety: { title: '这条内容可能涉及即时安全风险，已暂缓公开', actions: ['不要等待社区回复', '陪伴处于风险中的孩子，不让其独处', '立即联系120/110、既往就诊机构或当地危机资源'] } };
                  }
                  const newPost = { id: MOCK_DATA.communityPosts.length + 1, user_id: 1, title: data.title, content: data.content, category: data.category, likes: 0, comments_count: 0, liked_user_ids: '[]', created_at: new Date().toISOString().split('T')[0] };
                  MOCK_DATA.communityPosts.unshift(newPost);
                  return { success: true, post: newPost, message: '发布成功' };
                }
                if (url === '/community/reports' && method === 'POST') {
                  const report={case_ref:`demo-${Date.now()}`,target_type:data.target_type,target_id:data.target_id,reason:data.reason,risk_level:data.reason==='crisis'?'urgent':'review',status:'open',created_at:new Date().toISOString()};mockCommunityReports.unshift(report);
                  return { success: true, ...report, safety: data.reason === 'crisis' ? { actions: ['不要等待社区回复', '立即联系120/110或既往就诊机构'] } : undefined };
                }
                if (url === '/community/reports/mine' && method === 'GET') {
                  return { success: true, reports: mockCommunityReports };
                }
                if (url.includes('/comments') && method === 'POST') {
                  if (/自杀|不想活|结束生命|伤害自己|伤害孩子|服药过量|吞药|幻觉|妄想|意识不清/.test(data.content || '')) {
                    return { success: true, held_for_review: true, case_ref: `demo-${Date.now()}`, safety: { title: '这条评论可能涉及即时安全风险，已暂缓公开', actions: ['不要等待社区回复', '立即联系120/110、既往就诊机构或当地危机资源'] } };
                  }
                  return { success: true, comment: { id: Date.now(), content: data.content, user_name: currentUser?.name || '我', created_at: new Date().toISOString().split('T')[0] }, message: '评论成功' };
                }
                if (url.startsWith('/community/posts/') && method === 'GET') {
                  const id = parseInt(url.split('/posts/')[1]);
                  const post = MOCK_DATA.communityPosts.find(p => p.id === id);
                  return { success: true, post: post || null };
                }
                if (url.includes('/comments') && method === 'GET') {
                  return { success: true, comments: [
                    { id: 1, content: '说得太好了，深有同感！', user_name: '小明家长', created_at: '2026-07-11' },
                    { id: 2, content: '谢谢分享，很实用！', user_name: '小红妈妈', created_at: '2026-07-10' }
                  ] };
                }
                if (url.includes('/like') && method === 'POST') {
                  return { success: true, likes: Math.floor(Math.random() * 50) + 5, message: '已点赞' };
                }
                if (url.startsWith('/growth/profile') && method === 'GET') {
                  return { success: true, profile: { level: 'L2', growth_index: 65, dimensions: { knowledge: 72, practice: 65, emotion: 58, communication: 70 } }, records: MOCK_DATA.growthRecords };
                }
                if (url.startsWith('/growth/history') && method === 'GET') {
                  return { success: true, records: MOCK_DATA.growthRecords.map(r => ({ ...r, action: r.activity, points: r.score, created_at: r.date })) };
                }
                if (url.startsWith('/safety/skills') && method === 'GET') {
                  return { success: true, skills: MOCK_DATA.safetySkills };
                }
                if (url.startsWith('/child/goals') && method === 'POST') {
                  return { success: true, message: '目标添加成功（演示模式）' };
                }
                if (url.startsWith('/career/milestones') && method === 'POST') {
                  return { success: true, message: '里程碑添加成功（演示模式）' };
                }
                if (url.startsWith('/career/goals') && method === 'POST') {
                  return { success: true, message: '目标添加成功（演示模式）' };
                }
                if (url.startsWith('/career/goals') && method === 'PUT') {
                  return { success: true, message: '目标状态已更新（演示模式）' };
                }
                if (url.startsWith('/finance/expenses') && method === 'POST') {
                  return { success: true, message: '记录添加成功（演示模式）' };
                }
                if (url.startsWith('/finance/subsidies') && method === 'POST') {
                  return { success: true, message: '操作成功（演示模式）' };
                }
                if (url.startsWith('/finance/fraud-report') && method === 'POST') {
                  return { success: true, service_connected: false, message: '体验模式仅在当前页面模拟保存，未发送给任何审核或执法机构', report: { id: Date.now(), title: data.title, status: 'demo' } };
                }
                if (url.startsWith('/peer/groups') && method === 'GET') {
                  return { success: true, groups: MOCK_DATA.peerGroups };
                }
                if (url.startsWith('/peer/messages') && method === 'GET') {
                  return { success: true, messages: MOCK_DATA.peerMessages };
                }
                if (url.startsWith('/peer/activities') && method === 'GET') {
                  return { success: true, activities: MOCK_DATA.peerActivities };
                }
                if (url.startsWith('/peer/join') && method === 'POST') {
                  return { success: true, message: '已加入群组' };
                }
                if (url.startsWith('/peer/message') && method === 'POST') {
                  return { success: true, message: '消息发送成功' };
                }
                if (url.startsWith('/peer/register') && method === 'POST') {
                  return { success: true, message: '报名成功' };
                }
                if (url.startsWith('/loneliness/assessment') && method === 'GET') {
                  return { success: true, assessment: MOCK_DATA.lonelinessAssessment };
                }
                if (url.startsWith('/loneliness/score') && method === 'POST') {
                  return { success: true, message: '评估已提交' };
                }
                if (method === 'POST') {
                  return { success: true, message: '操作成功（演示模式）' };
                }
                return { success: true, data: [] };
              }

      const options = {
        method,
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json'
        }
      };

      if (getToken()) {
        options.headers['Authorization'] = `Bearer ${getToken()}`;
      }
      if (!['GET', 'HEAD'].includes(method)) {
        const csrfToken = getCookie('xingban_csrf');
        if (csrfToken) options.headers['X-CSRF-Token'] = csrfToken;
      }

      if (data) {
        options.body = JSON.stringify(data);
      }

      try {
        const response = await fetch(`${API_BASE}${url}`, options);
        const result = await response.json().catch(() => ({ error: `服务返回了无效响应（HTTP ${response.status}）` }));
        if (!response.ok) return { success: false, ...result, status: response.status };
        return result;
      } catch (error) {
        // 只允许“尚未登录的本机预览”进入演示模式。真实会话中任何网络失败都必须显式暴露，
        // 不能把演示儿童或演示周报混入家庭账号数据。
        if (!authenticatedSession && !getToken() && isLocalPreview) {
          console.log('本机后端不可用，进入明确演示模式');
          useMockMode = true;
          return apiRequest(url, method, data);
        }
        return { success: false, error: '服务连接失败，请检查网络后重试；本次未切换到演示数据', network_error: true };
      }
    }

    // === 数据管理 ===
    const MOCK_DATA = {
      strategies: [
        { id: 1, name: '深呼吸引导法', category: '情绪安抚', description: '通过深呼吸帮助孩子平静下来', difficulty: '简单', effectivenessRate: 85, usageCount: 128 },
        { id: 2, name: '感官安抚法', category: '情绪安抚', description: '使用触觉、视觉等感官刺激帮助孩子放松', difficulty: '中等', effectivenessRate: 78, usageCount: 96 },
        { id: 3, name: '视觉提示卡', category: '沟通辅助', description: '通过图片卡片帮助孩子理解指令', difficulty: '简单', effectivenessRate: 92, usageCount: 215 },
        { id: 4, name: '正向强化法', category: '行为引导', description: '通过奖励机制强化正向行为', difficulty: '中等', effectivenessRate: 88, usageCount: 175 },
        { id: 5, name: '代币系统', category: '行为引导', description: '用代币兑换奖励，培养良好习惯', difficulty: '中等', effectivenessRate: 82, usageCount: 142 },
        { id: 6, name: '步骤分解法', category: '生活自理', description: '将复杂任务分解为简单步骤', difficulty: '简单', effectivenessRate: 89, usageCount: 156 },
        { id: 7, name: '社交故事法', category: '社交训练', description: '通过故事帮助孩子学习社交技巧', difficulty: '困难', effectivenessRate: 75, usageCount: 68 },
        { id: 8, name: '安全角法', category: '安全防护', description: '设置安全区域帮助孩子自我调节', difficulty: '简单', effectivenessRate: 80, usageCount: 89 },
        { id: 9, name: '简单指令法', category: '沟通辅助', description: '使用简短清晰的指令', difficulty: '简单', effectivenessRate: 91, usageCount: 234 },
        { id: 10, name: '选择提问法', category: '沟通辅助', description: '给孩子提供有限的选择', difficulty: '中等', effectivenessRate: 86, usageCount: 134 },
        { id: 11, name: '情绪爆发降载流程', category: '情绪爆发', description: '哭闹、尖叫或崩溃时先降刺激、保安全，再恢复沟通', difficulty: '中等', effectivenessRate: 0, usageCount: 0 },
        { id: 12, name: '攻击与扔物安全处置', category: '攻击行为', description: '推打、踢咬、扔物时保护所有人并减少升级', difficulty: '困难', effectivenessRate: 0, usageCount: 0 },
        { id: 13, name: '自伤行为安全响应', category: '自伤风险', description: '撞头、咬手或抓伤自己时的现场保护与医疗升级', difficulty: '困难', effectivenessRate: 0, usageCount: 0 },
        { id: 14, name: '跑开与走失即时方案', category: '跑开走失', description: '出现冲门、脱离照护或走失风险时立即分工处置', difficulty: '困难', effectivenessRate: 0, usageCount: 0 },
        { id: 15, name: '拒绝与活动转换支持', category: '拒绝转换', description: '上学、洗澡、结束屏幕等转换困难时降低冲突', difficulty: '中等', effectivenessRate: 0, usageCount: 0 },
        { id: 16, name: '进食困难分级支持', category: '进食问题', description: '挑食、拒食、呛咳或进餐冲突的分级观察与支持', difficulty: '中等', effectivenessRate: 0, usageCount: 0 },
        { id: 17, name: '睡眠骤变观察计划', category: '睡眠变化', description: '入睡困难、夜醒或睡眠突然减少时记录并判断是否就医', difficulty: '中等', effectivenessRate: 0, usageCount: 0 },
        { id: 18, name: '持续低落与退缩支持', category: '低落退缩', description: '兴趣下降、退缩、绝望表达时先陪伴、询问安全并转介', difficulty: '困难', effectivenessRate: 0, usageCount: 0 },
        { id: 19, name: '异常兴奋与少睡分诊', category: '异常兴奋', description: '极少睡眠、话多、冲动或冒险骤增时停止训练并寻求评估', difficulty: '困难', effectivenessRate: 0, usageCount: 0 },
        { id: 20, name: '意识异常与药物事件处置', category: '医疗事件', description: '幻觉、严重混乱、服药过量或明显不良反应时立即医疗求助', difficulty: '困难', effectivenessRate: 0, usageCount: 0 },
      ],
      behaviors: [
        { id: 1, childName: '小明', type: '行为', category: '哭闹', emotion: '消极', description: '早晨起床时不愿穿衣服，哭闹约15分钟', time: '今天 07:30', intensity: 7 },
        { id: 2, childName: '小明', type: '情绪', category: '平静', emotion: '平静', description: '下午玩拼图时状态很好，专注了20分钟', time: '今天 14:20', intensity: 2 },
        { id: 3, childName: '小明', type: '沟通', category: '用手指', emotion: '积极', description: '主动用手指向想要的玩具', time: '今天 10:15', intensity: 1 },
        { id: 4, childName: '小红', type: '行为', category: '拍手', emotion: '积极', description: '看到喜欢的动画时开心拍手', time: '昨天 16:45', intensity: 3 },
        { id: 5, childName: '小红', type: '行为', category: '跑开', emotion: '消极', description: '在商场突然跑开，家长追赶', time: '昨天 19:30', intensity: 8 },
      ],
      children: [
        { id: 1, name: '小明', gender: '男', age: 6, diagnosis: '孤独症', avatar: '👦' },
        { id: 2, name: '小红', gender: '女', age: 4, diagnosis: '孤独症', avatar: '👧' },
      ],
      reports: [
        { id: 1, week: '第30周', childName: '小明', records: 12, emotion: 'positive', aiComment: '演示周报：共汇总12条示例记录。记录数量和标签不能证明孩子进步或退步，请核对原始记录。' },
        { id: 2, week: '第29周', childName: '小明', records: 9, emotion: 'neutral', aiComment: '本周情绪波动较大，注意观察触发因素。' },
      ],
      familyMoods: [
        { id: 1, date: '今天', mood: '开心', note: '孩子今天主动打招呼了！', emoji: '😊' },
        { id: 2, date: '昨天', mood: '平静', note: '平稳的一天', emoji: '😌' },
        { id: 3, date: '前天', mood: '疲惫', note: '昨晚没睡好', emoji: '😴' },
      ],
      gratitudeCards: [
        { id: 1, partner: '孩子爸爸', content: '谢谢你一直支持我和孩子', sent: true, date: '2024-01-15' },
        { id: 2, partner: '老师', content: '感谢您的耐心教导', sent: false, date: '2024-01-14' },
      ],
      growth: { level: 'L2', index: 65, dimensions: [
        { name: '策略使用', value: 72 },
        { name: '记录习惯', value: 68 },
        { name: '情绪调节', value: 58 },
        { name: '学习活跃', value: 75 },
      ]},
      stories: [
        { id: 1, title: '我的ABA训练心得', content: '分享一下我们家孩子在ABA训练中的进步...', likes: 24, date: '3天前', tags: ['训练', 'ABA'] },
        { id: 2, title: '如何应对孩子的情绪爆发', content: '总结了一些实用的方法，希望能帮助到大家...', likes: 45, date: '5天前', tags: ['情绪', '策略'] },
        { id: 3, title: '孩子第一次主动说"妈妈"', content: '那一刻眼泪止不住地流，三年了终于等到了...', likes: 128, date: '1周前', tags: ['沟通', '感动'] },
      ],
      communityPosts: [
        { id: 1, user_id: 1, title: '分享我的训练心得', content: '最近开始使用星伴进行社交训练，感觉进步很大。特别是咖啡厅破冰那个场景，让我学会了如何自然地开启话题。推荐给所有有社交焦虑的朋友！', category: 'training', likes: 24, comments_count: 5, liked_user_ids: '[2,3]', created_at: '2026-07-10' },
        { id: 2, user_id: 2, title: '深夜emo求助', content: '今天工作不顺利，感觉很挫败。有没有人可以聊聊？', category: 'emotion', likes: 12, comments_count: 8, liked_user_ids: '[1]', created_at: '2026-07-11' },
        { id: 3, user_id: 3, title: '推荐一个好方法', content: '试试NVC非暴力沟通，真的很有效。当你感觉被误解时，试着用"观察-感受-需要-请求"的方式表达自己。', category: 'resource', likes: 38, comments_count: 12, liked_user_ids: '[1,2,4]', created_at: '2026-07-09' },
        { id: 4, user_id: 4, title: '第一次训练很紧张', content: '第一次进行场景训练，紧张到说不出话来。但是伴侣很耐心地引导我，让我慢慢放松下来。', category: 'question', likes: 15, comments_count: 6, liked_user_ids: '[]', created_at: '2026-07-12' },
        { id: 5, user_id: 1, title: '日常打卡', content: '今日训练完成！继续加油！', category: 'general', likes: 8, comments_count: 2, liked_user_ids: '[2]', created_at: '2026-07-12' }
      ],
      notifications: [
        { id: 1, user_id: 1, title: '新评论', content: '有人评论了你的帖子', type: 'comment', is_read: false, created_at: '2026-07-12' },
        { id: 2, user_id: 1, title: '点赞通知', content: '有人点赞了你的帖子', type: 'like', is_read: false, created_at: '2026-07-12' },
        { id: 3, user_id: 1, title: '系统通知', content: '本周报告已生成，请查收', type: 'system', is_read: true, created_at: '2026-07-11' },
        { id: 4, user_id: 1, title: '训练提醒', content: '今天还没有完成训练哦', type: 'training', is_read: true, created_at: '2026-07-10' }
      ],
      report: {
        weekly_summary: '本周孩子表现稳定，情绪波动较小，建议继续保持正向强化训练。',
        behavior_trends: { aggressive: 2, positive: 8, neutral: 5 },
        emotion_distribution: { happy: 45, calm: 35, sad: 10, angry: 10 },
        recommendations: ['继续使用深呼吸引导法', '增加社交故事训练频率', '注意观察情绪触发因素']
      },
      growthProfile: {
        total_score: 72,
        level: '进阶家长',
        dimensions: [
          { name: '策略使用', score: 78 },
          { name: '记录习惯', score: 65 },
          { name: '情绪调节', score: 70 },
          { name: '学习活跃', score: 75 }
        ]
      },
      growthRecords: [
        { id: 1, date: '2026-07-10', activity: '完成策略学习', score: 10, type: 'learning' },
        { id: 2, date: '2026-07-09', activity: '记录行为', score: 5, type: 'recording' },
        { id: 3, date: '2026-07-08', activity: '完成情绪管理课程', score: 15, type: 'learning' }
      ],
      therapists: [
        { id: 1, name: '王医生', title: '儿童发育行为科', hospital: '市儿童医院', avatar: '👨‍⚕️', specialty: 'ABA行为分析', rating: 4.8 },
        { id: 2, name: '李老师', title: '特殊教育', hospital: '阳光康复中心', avatar: '👩‍🏫', specialty: '感觉统合训练', rating: 4.9 },
      ],
      therapistFeedback: [
        { id: 1, report_id: 1, therapist_id: 1, therapist_name: '王医生', content: '小明本周社交互动进步明显，建议继续增加同伴互动场景的练习。情绪调节方面可以尝试使用情绪卡片辅助识别。', rating: 4, created_at: '2026-07-12', suggestions: ['增加同伴互动场景', '使用情绪卡片辅助'] },
        { id: 2, report_id: 2, therapist_id: 2, therapist_name: '李老师', content: '感觉统合训练效果良好，建议家中也配备一些感官调节工具。可以尝试本体感觉活动如跳床、推重物等。', rating: 5, created_at: '2026-07-05', suggestions: ['配备感官调节工具', '增加本体感觉活动'] },
      ],
      growthCourses: [
        { id: 1, title: '孤独症基础知识', category: '入门', duration: '30分钟', progress: 100, chapters: 5, completed_chapters: 5, description: '了解孤独症的核心特征和干预原则', icon: '📖' },
        { id: 2, title: '正向行为支持', category: '行为干预', duration: '45分钟', progress: 60, chapters: 6, completed_chapters: 4, description: '学习正向行为支持的核心理念和实操方法', icon: '💪' },
        { id: 3, title: '情绪调节策略', category: '情绪管理', duration: '40分钟', progress: 30, chapters: 5, completed_chapters: 2, description: '掌握帮助孩子情绪调节的实用策略', icon: '🧘' },
        { id: 4, title: '社交故事教学', category: '社交技能', duration: '35分钟', progress: 0, chapters: 4, completed_chapters: 0, description: '使用社交故事帮助孩子理解社交规则', icon: '👫' },
        { id: 5, title: '感觉统合训练指导', category: '感觉统合', duration: '50分钟', progress: 0, chapters: 7, completed_chapters: 0, description: '了解感觉统合失调及家庭训练方法', icon: '🎯' },
        { id: 6, title: '沟通辅助技术', category: '沟通', duration: '40分钟', progress: 80, chapters: 5, completed_chapters: 4, description: '学习使用AAC等辅助沟通工具', icon: '💬' },
      ],
      achievements: [
        { id: 1, title: '初心起航', description: '注册星伴账号', icon: '🌟', unlocked: true, unlocked_at: '2026-06-01', category: 'milestone' },
        { id: 2, title: '第一次记录', description: '完成第一条行为记录', icon: '📝', unlocked: true, unlocked_at: '2026-06-02', category: 'recording' },
        { id: 3, title: '周报达人', description: '生成5份周报', icon: '📊', unlocked: true, unlocked_at: '2026-07-01', category: 'report' },
        { id: 4, title: '学习先锋', description: '完成3门课程', icon: '🎓', unlocked: false, unlocked_at: null, category: 'learning', progress: 2, target: 3 },
        { id: 5, title: '策略大师', description: '使用10种不同策略', icon: '🏆', unlocked: false, unlocked_at: null, category: 'strategy', progress: 6, target: 10 },
        { id: 6, title: '社区之星', description: '发布5篇社区帖子', icon: '⭐', unlocked: false, unlocked_at: null, category: 'community', progress: 3, target: 5 },
        { id: 7, title: '安全守护者', description: '完成所有安全技能训练', icon: '🛡️', unlocked: false, unlocked_at: null, category: 'safety', progress: 2, target: 6 },
        { id: 8, title: '情绪管理达人', description: '完成情绪管理课程', icon: '🧘', unlocked: false, unlocked_at: null, category: 'learning', progress: 30, target: 100 },
        { id: 9, title: '坚持30天', description: '连续30天使用星伴', icon: '🔥', unlocked: false, unlocked_at: null, category: 'milestone', progress: 14, target: 30 },
        { id: 10, title: '分享达人', description: '分享3份周报给康复师', icon: '📤', unlocked: true, unlocked_at: '2026-07-10', category: 'report' },
      ],
      safetySkills: [
        { id: 1, name: '认识红绿灯', category: '交通安全', description: '学习红绿灯信号，知道红灯停绿灯行', difficulty: '简单' },
        { id: 2, name: '记住家庭住址', category: '防走失', description: '记住家庭住址和父母电话号码', difficulty: '简单' },
        { id: 3, name: '拒绝陌生人', category: '防拐骗', description: '学习如何拒绝陌生人的邀请', difficulty: '中等' },
        { id: 4, name: '拨打紧急电话', category: '应急能力', description: '学习拨打110、120、119等紧急电话', difficulty: '中等' },
        { id: 5, name: '寻找安全场所', category: '防走失', description: '知道在商场、公园走失时去哪里求助', difficulty: '中等' },
        { id: 6, name: '识别危险物品', category: '居家安全', description: '识别家中危险物品并学会远离', difficulty: '困难' }
      ],
      storyLibrary: [
        { id: 1, title: '小明的一天', category: '日常生活', content: '早上，小明起床后自己穿衣服...', cover_image: '📚' },
        { id: 2, title: '交朋友', category: '社交技能', content: '小红来到新学校，她有点紧张...', cover_image: '👫' },
        { id: 3, title: '分享快乐', category: '情绪管理', content: '小华有一盒漂亮的彩笔...', cover_image: '🎨' },
        { id: 4, title: '排队的规则', category: '社会规范', content: '幼儿园里，小朋友们在排队滑滑梯...', cover_image: '🎢' },
        { id: 5, title: '勇敢说不', category: '自我保护', content: '小美在公园里玩，一个陌生人走过来...', cover_image: '🛡️' }
      ],
      childProfile: {
        id: 1,
        name: '小明',
        gender: '男',
        age: 6,
        diagnosis: '孤独症',
        avatar: '👦',
        birth_date: '2020-05-15',
        diagnosis_date: '2022-10-20',
        diagnosis_level: '中度',
        main_symptoms: ['社交沟通障碍', '重复刻板行为', '感官敏感'],
        strengths: ['记忆力强', '对数字敏感', '专注力好'],
        challenges: ['情绪调节困难', '社交互动少', '语言表达有限'],
        sensory_hearing: '敏感',
        sensory_visual: '正常',
        sensory_tactile: '回避',
        sensory_taste: '敏感',
        sensory_smell: '寻求',
        sensory_vestibular: '寻求',
        reinforcers: ['拼图游戏', '数字卡片', '荡秋千', '音乐'],
        development_milestones: [
          { id: 1, age: '0-6月', title: '社交微笑', description: '对熟悉的人微笑', achieved: true, date: '2020-10' },
          { id: 2, age: '6-12月', title: '模仿动作', description: '模仿简单的动作如拍手', achieved: true, date: '2021-03' },
          { id: 3, age: '12-18月', title: '指物表达', description: '用手指向感兴趣的物品', achieved: true, date: '2021-08' },
          { id: 4, age: '18-24月', title: '简单词语', description: '说出2-3个有意义的词', achieved: true, date: '2022-02' },
          { id: 5, age: '2-3岁', title: '双词组合', description: '组合两个词表达需求', achieved: true, date: '2023-01' },
          { id: 6, age: '3-4岁', title: '简单对话', description: '能进行简单的来回对话', achieved: false },
          { id: 7, age: '4-5岁', title: '同伴游戏', description: '能与同伴进行合作性游戏', achieved: false },
          { id: 8, age: '5-6岁', title: '情绪识别', description: '能识别并表达基本情绪', achieved: false },
        ],
        personalized_recommendations: [
          { id: 1, title: '增加感官调节活动', description: '根据孩子的听觉和味觉敏感特点，建议增加感官饮食（Sensory Diet）活动', icon: '🎯', type: 'sensory' },
          { id: 2, title: '强化社交故事训练', description: '孩子社交能力评分较低，建议每天阅读1-2篇社交故事', icon: '📚', type: 'social' },
          { id: 3, title: '情绪识别卡片练习', description: '推荐使用情绪识别卡片帮助孩子学习情绪表达', icon: '😊', type: 'emotion' },
          { id: 4, title: '利用数字优势', description: '孩子对数字敏感，可使用数字相关教具辅助认知学习', icon: '🔢', type: 'cognition' },
        ],
        medical_info: {
          doctor_name: '李医生',
          hospital: '市儿童医院',
          phone: '021-12345678',
          medications: '无',
          allergies: '无',
          notes: '定期复诊，建议每周进行康复训练'
        },
        capacity_radar: {
          communication: 45,
          social: 30,
          self_care: 55,
          cognition: 70,
          motor: 60,
          emotion: 40
        },
        goals: [
          { id: 1, category: '沟通', target: '能主动用语言表达需求', current_level: 2, target_level: 4, deadline: '2026-12-31', status: 'in_progress' },
          { id: 2, category: '社交', target: '能与同龄人进行简单互动', current_level: 1, target_level: 3, deadline: '2026-12-31', status: 'in_progress' },
          { id: 3, category: '自理', target: '能独立完成穿衣洗漱', current_level: 3, target_level: 4, deadline: '2026-09-30', status: 'completed' }
        ]
      },
      careerMilestones: [
        { id: 1, child_id: 1, age: 6, title: '找到舒适的入学支持', description: '记录孩子愿意使用的沟通、感官和课堂支持', achieved: true, date: '2026-09-01' },
        { id: 2, child_id: 1, age: 8, title: '尝试喜欢的户外活动', description: '由孩子选择活动、节奏和需要的协助', achieved: false },
        { id: 3, child_id: 1, age: 12, title: '共同复核学习安排', description: '和孩子及学校讨论下一阶段愿望与合理便利', achieved: false },
        { id: 4, child_id: 1, age: 15, title: '练习表达选择与拒绝', description: '确保孩子能用适合自己的方式参与重要决定', achieved: false },
        { id: 5, child_id: 1, age: 18, title: '探索成年过渡支持', description: '核对健康、教育、生活、决策与社区支持', achieved: false },
        { id: 6, child_id: 1, age: 22, title: '尝试感兴趣的活动角色', description: '通过低风险体验了解偏好、优势与所需支持', achieved: false },
        { id: 7, child_id: 1, age: 24, title: '复核成年生活选择', description: '尊重本人意愿，持续调整居住、活动和支持安排', achieved: false }
      ],
      careerGoals: [
        { id: 1, child_id: 1, title: '探索孩子当前兴趣', description: '从孩子本人意愿和多场景参与出发尝试不同活动', type: 'skill', deadline: '2027-12-31', status: 'in_progress' },
        { id: 2, child_id: 1, title: '社交能力提升', description: '通过社交故事和角色扮演，提升社交互动能力', type: 'social', deadline: '2028-12-31', status: 'in_progress' },
        { id: 3, child_id: 1, title: '职业探索', description: '通过低风险体验了解孩子愿意尝试的不同活动与支持需要', type: 'career', deadline: '2030-12-31', status: 'pending' }
      ],
      financialRecords: [
        { id: 1, child_id: 1, type: 'training', category: '康复训练', amount: 3000, date: '2026-07-10', note: 'ABA训练费用' },
        { id: 2, child_id: 1, type: 'medical', category: '医疗检查', amount: 500, date: '2026-07-08', note: '定期复查费用' },
        { id: 3, child_id: 1, type: 'education', category: '教育用品', amount: 200, date: '2026-07-05', note: '购买教具和图书' },
        { id: 4, child_id: 1, type: 'subsidy', category: '政府补贴', amount: -1000, date: '2026-07-01', note: '每月康复补贴' },
        { id: 5, child_id: 1, type: 'living', category: '日常生活', amount: 800, date: '2026-07-03', note: '特殊饮食和用品' }
      ],
      subsidies: [
        { id: 1, name: '孤独症儿童康复补贴', amount: '1000元/月', requirement: '持有孤独症诊断证明', status: '关注中', deadline: '长期有效', type: 'monthly' },
        { id: 2, name: '特殊教育助学金', amount: '3000元/年', requirement: '在校学生，家庭困难', status: '未关注', deadline: '每年9月', type: 'yearly' },
        { id: 3, name: '残疾人生活补贴', amount: '500元/月', requirement: '持有残疾证', status: '关注中', deadline: '长期有效', type: 'monthly' },
        { id: 4, name: '康复训练补贴', amount: '5000元/年', requirement: '在定点机构接受康复训练', status: '未关注', deadline: '每年6月', type: 'yearly' }
      ],
      fraudAlerts: [
        { id: 1, type: '诈骗', title: '虚假康复机构诈骗', description: '近期发现有人冒充康复机构进行诈骗，声称可以"治愈"孤独症，收取高额费用。请警惕此类骗局。', severity: 'high', date: '2026-07-10' },
        { id: 2, type: '虚假信息', title: '虚假特效药广告', description: '网络上出现声称可以治疗孤独症的"特效药"广告，这些药物未经科学验证，请不要轻信。', severity: 'medium', date: '2026-07-08' },
        { id: 3, type: '风险提示', title: '个人信息泄露风险', description: '请注意保护孩子的隐私信息，不要在社交媒体上公开孩子的诊断信息和照片。', severity: 'low', date: '2026-07-05' }
      ],
      peerGroups: [
        { id: 1, name: '新手家长互助群', description: '刚确诊的家长互相支持，分享经验和情绪', member_count: 128, max_members: 200, category: '互助', tags: ['新手', '情感支持'], is_joined: true, avatar: '🤝', recent_activity: '5分钟前' },
        { id: 2, name: 'ABA训练交流群', description: 'ABA训练方法分享和讨论', member_count: 86, max_members: 150, category: '训练', tags: ['ABA', '训练方法'], is_joined: true, avatar: '📚', recent_activity: '10分钟前' },
        { id: 3, name: '大龄儿童家长群', description: '8岁以上孤独症儿童家长的交流空间', member_count: 64, max_members: 100, category: '年龄', tags: ['大龄', '青春期'], is_joined: false, avatar: '🌟', recent_activity: '1小时前' },
        { id: 4, name: '情绪调节经验分享', description: '分享帮助孩子情绪调节的实用方法', member_count: 45, max_members: 80, category: '技能', tags: ['情绪管理', '方法'], is_joined: false, avatar: '🧘', recent_activity: '3小时前' },
      ],
      peerMessages: [
        { id: 1, group_id: 1, user_name: '小雨妈妈', avatar: '👩', content: '今天孩子第一次主动跟小朋友打招呼了！激动得我眼泪都要掉下来', time: '5分钟前', likes: 12, replies: 5 },
        { id: 2, group_id: 1, user_name: '阳光爸爸', avatar: '👨', content: '我家孩子也是，训练了半年终于有进步了，坚持就是胜利！', time: '8分钟前', likes: 8, replies: 3 },
        { id: 3, group_id: 2, user_name: '乐乐妈妈', avatar: '👩', content: '请问大家ABA训练中，孩子不配合怎么办？', time: '10分钟前', likes: 3, replies: 7 },
        { id: 4, group_id: 1, user_name: '星宝奶奶', avatar: '👵', content: '加油！每个小进步都值得庆祝', time: '15分钟前', likes: 15, replies: 2 },
      ],
      peerActivities: [
        { id: 1, title: '线上分享会：如何应对孩子情绪爆发', date: '2026-07-18', time: '20:00-21:00', speaker: '王医生', participants: 34, max_participants: 50, type: '线上', is_registered: false },
        { id: 2, title: '家长线下聚会', date: '2026-07-20', time: '14:00-16:00', speaker: '社区志愿者', participants: 12, max_participants: 20, type: '线下', is_registered: true },
        { id: 3, title: '专题讲座：感觉统合训练实操', date: '2026-07-22', time: '19:30-20:30', speaker: '李老师', participants: 56, max_participants: 100, type: '线上', is_registered: false },
      ],
      lonelinessAssessment: {
        current_score: 6,
        history: [
          { date: '2026-07-08', score: 7 },
          { date: '2026-07-01', score: 8 },
          { date: '2026-06-24', score: 7 },
          { date: '2026-06-17', score: 9 },
        ],
        suggestions: [
          { title: '加入互助群组', description: '与有相似经历的家长交流，减少孤独感', icon: '🤝', completed: true },
          { title: '参加线上分享会', description: '聆听其他家长的经验分享', icon: '🎤', completed: false },
          { title: '发布一条社区动态', description: '分享你的经历，获得共鸣', icon: '💬', completed: true },
          { title: '完成一次家庭签到', description: '记录家庭中的积极时刻', icon: '❤️', completed: true },
          { title: '尝试情绪日记', description: '每天记录自己的情绪状态', icon: '📝', completed: false },
        ]
      },
      emergencyContacts: []
    };

    const STRATEGY_GUIDES = {
      1: { when:'孩子开始焦虑、呼吸变快，但仍能跟随简单指令时', prepare:['先降低环境噪声','家长先稳定语速','不要强迫孩子闭眼'], steps:[['靠近并确认安全','蹲到与孩子视线接近的位置，保持一臂距离，先说：“我在这里，你是安全的。”'],['家长先示范','把手轻放腹部，用鼻子缓慢吸气，嘴巴慢慢呼气；不要一开始就要求孩子做到。'],['用具体形象带领','说：“闻一闻小花，再慢慢吹蜡烛。”吸气约3秒、呼气约4秒。'],['一起重复3次','每次结束停顿2秒，观察肩膀、呼吸和声音是否放松。'],['平静后立即肯定','说：“你刚才让身体慢下来了。”随后提供喝水或安静活动。']], script:'“我陪你。闻小花——一、二、三；吹蜡烛——一、二、三、四。”', avoid:'孩子正在尖叫、屏息或强烈抗拒时不要反复命令“深呼吸”，先减少刺激并保证安全。' },
      2: { when:'出现捂耳、烦躁、来回走动等感官过载信号时', prepare:['准备孩子平时接受的压力球或安抚物','一次只提供一种刺激','预留安静区域'], steps:[['识别过载来源','快速查看声音、灯光、人群、衣物触感中哪一项突然变化。'],['减少外界刺激','关小声音、移开人群或调暗灯光，语言减到一句话。'],['提供两个熟悉选择','展示而不是强塞：“压力球，还是安静角？”等待5秒。'],['持续观察2分钟','关注呼吸、手部动作和逃离倾向；有效就继续，无效就停止该刺激。'],['记录有效组合','平静后记下场景、刺激来源和有效物品，供下次提前准备。']], script:'“这里有点吵。你可以选压力球，或者去安静角，我陪你。”', avoid:'不要使用孩子从未尝试过的强刺激，也不要在孩子拒绝触碰时强行拥抱。' },
      3: { when:'孩子难以理解“接下来做什么”，或活动转换时容易抗拒', prepare:['准备2—5张清晰图片','顺序从左到右','最后安排明确奖励'], steps:[['选一个短流程','第一次只做“收玩具→洗手→吃饭”三步。'],['逐张说明','指着每张卡，用相同短句说明，不额外讲大道理。'],['完成一项就操作卡片','让孩子把完成卡翻面、取下或打勾，形成结束感。'],['转换前提前预告','剩2分钟时指向下一张卡，使用计时器提示。'],['全部完成后兑现结果','立即给予约定的表扬或活动，保持规则稳定。']], script:'“先收玩具，再洗手，最后吃饭。做完这一张，我们就翻过去。”', avoid:'图片过多、临时频繁换顺序，都会降低孩子对时间表的信任。' },
      4: { when:'孩子出现了需要巩固的具体正向行为时', prepare:['选定一个可观察行为','准备孩子真正喜欢的强化物','所有照护者口径一致'], steps:[['把目标说具体','把“表现好”改成“听到名字后转身”或“把玩具放回盒子”。'],['提前说明结果','任务开始前用一句话说明完成后能得到什么。'],['行为出现后立即强化','在1—2秒内给予具体表扬，再兑现约定的活动或物品。'],['逐渐改为自然奖励','稳定后减少物质奖励，增加表扬、选择权和活动本身的成就感。'],['每天记录成功率','记录机会次数和成功次数，连续稳定后再提高要求。']], script:'“你把玩具放回盒子了，这就是自己整理。现在可以选一本故事书。”', avoid:'不要用事后临时许诺或取消已经获得的奖励；强化物也不能替代基本需求。' },
      5: { when:'孩子能理解延迟奖励，需要通过多个小成功完成较长任务时', prepare:['准备3—5格代币板','选定明确兑换物','先从很容易成功的要求开始'], steps:[['共同确认兑换规则','展示“集满3颗星可以玩5分钟积木”，让结果看得见。'],['一次只提一个要求','每完成一个明确动作，立刻发一枚代币并具体表扬。'],['让孩子亲手贴代币','边贴边数还差几个，帮助理解进度。'],['集满后立即兑换','不临时加任务，也不拖延兑现。'],['稳定后缓慢增加格数','从3格增加到4格，每次只调整一个变量。']], script:'“坐好完成这一题，就得到一颗星。三颗星集满，我们玩积木。”', avoid:'不要因问题行为扣掉已经获得的代币，也不要频繁更换兑换规则。' },
      6: { when:'穿衣、洗漱、收拾等任务步骤太多，孩子容易停住或抗拒时', prepare:['把任务拆成3—7个动作','准备图片提示','决定从第一步或最后一步开始教'], steps:[['观察并写下全部动作','以洗手为例：开水—打湿—抹皂—搓手—冲洗—擦干。'],['选择一个孩子能完成的起点','其余步骤由家长协助，先让孩子体验完整成功。'],['只教当前一步','使用简短指令和示范，等待5—10秒再辅助。'],['完成后立即标记','翻过图片卡或打勾，并给予具体表扬。'],['掌握后再增加一步','连续多次独立完成后才撤掉提示，不一次要求全部独立。']], script:'“现在只做第一步：打开水龙头。”（等待）“你自己打开了。”', avoid:'不要边做边连续纠正所有步骤；任务中断时先降低难度，而不是从头重复。' },
      7: { when:'需要练习打招呼、轮流、等待或适应新环境时', prepare:['故事主角与孩子相似','一次只教一个行为','使用真实场景图片更好'], steps:[['明确一个目标','例如只练“见到老师挥手”，不要同时要求眼神和完整问候。'],['用第一人称短句阅读','每页1—2句，描述发生什么、别人怎么想、我可以怎么做。'],['让孩子指出关键动作','问选择题：“小朋友现在可以挥手，还是跑开？”'],['在家角色扮演','家长扮演老师，练习2—3轮，每轮不超过3分钟。'],['真实场景前复习','出门前快速看一遍，完成后具体表扬目标行为。']], script:'“早上我看到老师。我可以挥挥手，说‘老师好’。老师会知道我来了。”', avoid:'故事不是训话工具；避免使用“必须、总是、不能犯错”等绝对化表达。' },
      8: { when:'孩子情绪升高，需要一个可主动进入、降低刺激的安全空间时', prepare:['与孩子平静时共同布置','放入熟悉安抚物','明确这不是惩罚区'], steps:[['平静时先参观','介绍角落里的物品和用途，让孩子自由进出。'],['建立进入信号','约定一句话或一张“休息”卡，家长也尊重孩子主动提出。'],['情绪前兆时提供选择','说“要在这里休息，还是去安静角？”避免拖拽。'],['保持陪伴但减少语言','在可观察范围内等待，除安全提醒外不过度提问。'],['孩子准备好后再返回','用简单选择确认下一步，并记录哪些物品有效。']], script:'“安静角是帮助身体休息的地方，不是惩罚。你准备好时可以回来。”', avoid:'绝不能锁门、阻止孩子离开或把安全角当隔离处罚。' },
      9: { when:'孩子能听懂关键词，但长句、连续命令或抽象表达让其困惑时', prepare:['先获得孩子注意','一次一个动作','配合手势或图片'], steps:[['走近再说','在孩子可感知范围内叫名字，等待短暂反应。'],['给出一个肯定式指令','说“脚放地上”，不说“不要爬来爬去”。'],['等待5—10秒','给孩子处理语言和启动动作的时间，不连续重复。'],['必要时增加视觉提示','指向物品、示范动作或出示图片，而不是提高音量。'],['完成后具体肯定','说“你把杯子放桌上了”，帮助建立语言和结果的联系。']], script:'“小明，看这里。杯子放桌上。”（等待）“你做到了。”', avoid:'避免一次说多个步骤、反问句、讽刺或不断提高音量。' },
      10:{ when:'孩子面对开放问题容易沉默、焦虑，或需要提升可控感时', prepare:['两个选项都必须可接受','用实物或图片展示','选择后立即执行'], steps:[['先明确不可选择的边界','例如已经需要穿鞋，但可以选择鞋的颜色。'],['提供两个具体选项','把选项放在眼前，用相同语气说出。'],['安静等待5—10秒','不要马上替孩子选，也不要连续追加第三个选项。'],['确认并执行选择','复述“你选蓝色鞋”，立即开始下一步。'],['无回应时温和缩小帮助','指着两项再问一次；仍无回应可说明将代选并保持平静。']], script:'“现在要穿鞋。你想穿蓝色，还是灰色？”', avoid:'不要提供虚假选择，例如孩子选了之后又否定；也不要用选择逃避必要的安全边界。' },
      11:{ when:'哭闹、尖叫、倒地或崩溃正在升级，但尚无即时伤害危险时', prepare:['先确认不是疼痛、发热、缺氧或其他急症','移开围观者与非必要要求','只留一名稳定照护者'], steps:[['先看安全','快速移开玻璃、热水和尖锐物；不围堵、不训问。'],['把语言减到最少','只说“我在这里”“先安全”，停止解释和讲道理。'],['降低刺激','关掉声音、降低灯光，允许孩子坐下、走动或使用熟悉安抚物。'],['等待强度下降','每30—60秒观察呼吸、动作和逃离倾向，不催促道歉。'],['恢复一个小选择','能回应后只给“喝水/坐一会儿”等两个可接受选择。'],['事后简记ABC','记录之前发生什么、孩子做了什么、之后得到什么，寻找可预防因素。']], script:'“我在这里。现在先安全。你可以坐这里，或去安静角。”', avoid:'不要多人围住、拍摄、连续追问、强迫眼神或在爆发中要求反省。' },
      12:{ when:'推、打、踢、咬、抓或扔物正在发生，但照护者仍能安全撤离时', prepare:['确认儿童和成人撤离路线','把其他儿童带离','不要尝试徒手制服'], steps:[['拉开距离','侧身站在可退出位置，避开正面争抢。'],['清空危险范围','在不靠近孩子的前提下移走可投掷物和易碎物。'],['一句话设边界','平静说“我不会让你打人”，不争论动机。'],['提供安全替代','指向可推墙、捏垫子或安静区；孩子拒绝时继续保持距离。'],['判断是否升级','出现武器、勒颈、头部重击或成人无法保证安全，立即联系110/120。'],['平静后记录','记录触发、持续时间、受伤情况和有效降载方式，交专业人员复盘。']], script:'“我不会让任何人受伤。我退到这里。你可以推墙，或坐到垫子旁。”', avoid:'不要压制、锁门、反击、威胁遗弃，也不要把危机行为当作故意挑衅。' },
      13:{ when:'撞头、咬手、抓伤、掐颈或其他伤害自己的行为出现时', prepare:['此方案只用于等待专业帮助期间的最低限度保护','准备急救用品','让另一成人联系急救'], steps:[['立即判断伤情','大量出血、失去意识、呼吸异常、疑似骨折或头部重击，立即拨打120。'],['减少二次伤害','移开硬物，放置软垫作为环境缓冲；不要压住胸颈。'],['保持观察陪伴','不要让孩子独处，减少语言，持续观察呼吸和意识。'],['直接询问安全','能沟通时可问“你现在想伤害自己或不想活了吗？”直接询问不会诱发自杀。'],['联系专业支持','有自杀想法、计划、工具或无法保证安全时拨打120/110并联系既往医院。'],['保存事实信息','记录时间、方式、伤处、用药和睡眠，供急救或医生判断。']], script:'“我会陪着你并保证安全。我们现在联系医生帮助你。”', avoid:'不要保证保密、责备、激将、强迫承诺“以后绝不这样”，也不要只靠应用观察。' },
      14:{ when:'孩子冲向门外、道路、水边，脱离视线或已经走失时', prepare:['先在安全中心保存近期照片、联系方式和常去地点','家庭明确谁追随、谁报警','外出使用可识别信息'], steps:[['立即指定分工','一人保持目视并安全跟随，一人拨打110和通知场所安保。'],['优先封锁高危方向','先查道路、水边、高处、停车场和交通站点，不盲目多人同向寻找。'],['提供关键特征','说明照片、衣着、沟通特点、是否怕声光、常去地点和接近方式。'],['保持电话畅通','留一名成人在最后出现地点，其他人按警方安排行动。'],['找到后先查身体','先处理脱水、外伤、惊吓，不立即训斥。'],['事后更新预案','与专业人员复盘触发与环境漏洞，训练停下、报姓名和找工作人员。']], script:'“小明，停下。我在这里。” 对外求助：“孩子需要沟通支持，请不要追喊或围堵。”', avoid:'真实走失不要先在社交平台等待回应；不要因羞耻延迟报警。' },
      15:{ when:'结束屏幕、出门、上学、洗澡或换活动时抗拒、拖延或哭闹', prepare:['提前准备“先—再”提示','给出可见计时器','新任务从最小一步开始'], steps:[['提前两次预告','在5分钟和1分钟时使用同一句短提示。'],['承认困难但不争辩','说“停下来很难”，避免反复解释规则。'],['给有限选择','边界不变，只选择顺序、工具或地点。'],['降低启动门槛','把“去洗澡”变成“先走到浴室门口”。'],['完成第一步就反馈','具体说出孩子完成了什么，并展示下一步。'],['复盘时间与难度','若反复失败，调整转换时机、视觉提示或任务要求。']], script:'“还有一分钟结束。先关屏幕，再选红毛巾或蓝毛巾。”', avoid:'不要突然拔电源、用虚假倒计时或在孩子完成选择后反悔。' },
      16:{ when:'挑食、拒绝新食物、进餐焦虑，但没有呛咳、脱水或明显体重下降时', prepare:['记录可接受食物与质地','新食物只放极少量','允许安全食物同桌'], steps:[['先排除医疗问题','持续疼痛、吞咽困难、频繁呛咳、脱水或体重下降需先就医。'],['稳定进餐结构','固定大致时间和座位，控制用餐时长，不追喂。'],['建立接触阶梯','从容忍在桌上、触碰、闻、舔到小口尝试，不要求一次吃完。'],['强化尝试而非数量','表扬接触新食物的具体步骤，不拿饥饿作为惩罚。'],['一次只改一个变量','质地、温度、品牌和形状不要同时变化。'],['持续记录并转介','记录摄入、呛咳、便秘与体重；营养风险请儿科/营养/吞咽团队评估。']], script:'“米饭是安全食物。胡萝卜今天只要放在小碟里，你可以先闻一闻。”', avoid:'不要强塞、捏鼻灌食、以撤掉全部安全食物逼迫进食。' },
      17:{ when:'入睡变难、夜醒增多、早醒，或睡眠时间较平时明显变化时', prepare:['连续记录睡眠、午睡、咖啡因/药物和日间精力','固定起床时间','检查疼痛与环境'], steps:[['先识别红旗','连续极少睡眠并伴异常兴奋、话多、冲动或意识变化，应尽快精神科评估。'],['固定起床锚点','每天在相近时间起床，白天安排适量自然光和活动。'],['建立短睡前序列','洗漱、安静活动、关灯保持相同顺序，避免复杂奖励。'],['减少睡前刺激','逐步降低屏幕、强光和剧烈活动；不突然强制造成冲突。'],['夜醒保持低刺激','灯光和语言最少，不把夜醒变成长时间娱乐。'],['带记录就医','持续两周、明显影响白天或涉及药物时，把睡眠图交儿科/精神科。']], script:'“现在按睡前图做三步：洗漱、故事、关灯。我会在附近。”', avoid:'不要自行增减精神科或助眠药物；不要把突然少睡仅归因于“不听话”。' },
      18:{ when:'连续低落、兴趣下降、明显退缩、无望表达或功能下降时', prepare:['选择安静且不被打断的空间','准备联系既往医生或可信成人','先放下训练目标'], steps:[['先陪伴而非纠正','描述观察：“我发现你这几天不想玩了。”'],['直接询问安全','问是否想伤害自己、不想活，是否有计划或工具。'],['有风险立即升级','回答有、含糊或无法保证安全时不让独处，联系120/110及精神科。'],['无即时危险也要支持','降低非必要要求，维持吃饭、睡眠、服药和基本陪伴。'],['记录变化时间线','记录持续天数、睡眠、食欲、活动、言语和近期事件。'],['尽快专业评估','明显持续或影响上学生活时联系儿童精神科/临床心理，不等待自行好转。']], script:'“我注意到你最近很难受。我想直接问：你有没有想伤害自己，或者不想活了？”', avoid:'不要说“你想太多”“别人更难”，不要以奖励逼孩子表现开心，也不要承诺保密。' },
      19:{ when:'睡眠显著减少却不困，同时话多、兴奋、易怒、冲动、冒险或活动骤增', prepare:['停止所有提高兴奋度的训练和奖励','核对处方与近期用药变化','安排持续成人陪同'], steps:[['把它视为健康变化','不要先按普通“不听话”处理，记录与平时的明显差异。'],['立即降低刺激','暂停外出、购物、网络发布、驾驶或高风险活动。'],['保护睡眠和环境','保持安静、减少争论，不强迫孩子靠意志“冷静”。'],['评估即时危险','若无法控制冲动、攻击、自伤、幻觉或意识异常，拨打120/110。'],['尽快联系精神科','说明睡眠小时数、持续天数、用药和异常行为，按医生指示处理。'],['保留连续观察','记录睡眠、精力、言语、消费/冒险和功能变化，交医生判断。']], script:'“你现在的睡眠和精力与平时很不一样。我们先停下活动，联系医生一起判断。”', avoid:'不要自行停药、加药或使用他人药物；不要把异常兴奋当成状态好而继续刺激。' },
      20:{ when:'出现幻觉、妄想、严重混乱、意识改变、服药过量或明显药物不良反应', prepare:['这不是家庭训练场景','准备药盒/处方与服用时间','立即安排成人陪同'], steps:[['立即联系急救','意识异常、呼吸困难、抽搐、服药过量或无法保证安全，拨打120。'],['保持现场安全','不让独处，移除危险物，保持出口通畅。'],['不要争辩体验真假','可说“我知道这让你害怕”，不附和也不激烈否定。'],['提供准确用药信息','向急救说明药名、剂量、时间、漏服/误服和近期调整。'],['避免自行处理','除非急救明确指导，不催吐、不喂不明食物、不自行加减药。'],['等待专业接管','持续观察呼吸、意识和行为变化，按急救指令行动。']], script:'“我知道你现在很害怕。我不和你争论，我们现在联系医生保证安全。”', avoid:'不要让孩子独处、驾车或接触危险物；不要用呼吸练习替代急救。' }
    };

    const STRATEGY_CONTEXT = {
      1:{behaviors:['轻度焦虑','呼吸变快','能跟随指令'],goal:'帮助身体节律放慢，不用于强烈抗拒或危机',observe:'呼吸速度、肩颈紧张、是否愿意跟随',stop:'屏息、头晕、明显抗拒时立即停止',followUp:'记录是否接受示范及哪种比喻更容易理解'},
      2:{behaviors:['捂耳','逃离噪声','烦躁走动','感官过载'],goal:'减少不可控刺激并恢复可选择感',observe:'声光触觉来源与逃离倾向',stop:'任何刺激令反应加重就撤掉',followUp:'建立孩子认可的感官工具清单'},
      3:{behaviors:['听不懂下一步','转换焦虑','反复询问'],goal:'让流程和结束点可见',observe:'能否看卡、完成后能否翻卡',stop:'图片本身引发焦虑时改用实物提示',followUp:'逐步将提示带到学校与社区'},
      4:{behaviors:['目标行为刚出现','需要建立新习惯'],goal:'增加可观察的安全、沟通或自理行为',observe:'机会数、成功数与强化是否及时',stop:'孩子只为基本需求被迫表现时调整方案',followUp:'与专业目标一致后逐渐自然化'},
      5:{behaviors:['长任务易放弃','能理解延迟结果'],goal:'把多个小成功连接成长任务',observe:'代币规则是否被理解、兑现是否及时',stop:'代币引发争抢或高度焦虑时暂停',followUp:'稳定后一次只增加一个要求'},
      6:{behaviors:['穿衣洗漱卡住','任务步骤过多'],goal:'降低工作记忆和启动负担',observe:'独立完成到哪一步、需要何种提示',stop:'疲劳疼痛或强烈抗拒时先暂停',followUp:'连续稳定后再撤掉一个提示'},
      7:{behaviors:['打招呼困难','轮流等待困难','新环境焦虑'],goal:'预演一个具体社交动作',observe:'是否理解关键动作而非强求眼神',stop:'故事造成羞耻或压力时重写',followUp:'从家中角色扮演泛化到真实场景'},
      8:{behaviors:['情绪升高','主动寻求独处','需要降刺激'],goal:'提供自愿、可退出的调节空间',observe:'孩子是否主动进入和何时准备返回',stop:'空间被当惩罚或限制自由时立即纠正',followUp:'平静时共同调整物品与进入信号'},
      9:{behaviors:['长句理解困难','连续指令后停住'],goal:'提高单一步骤的理解和启动',observe:'等待时间与视觉提示需求',stop:'提高音量仍无反应时不要继续施压',followUp:'记录最有效的关键词与提示形式'},
      10:{behaviors:['开放问题焦虑','选择困难','需要可控感'],goal:'在安全边界内给真实选择',observe:'选项数量和等待时间是否合适',stop:'两个选项都不可接受时重设边界',followUp:'逐渐练习表达拒绝和请求帮助'},
      11:{behaviors:['哭闹','尖叫','倒地','情绪崩溃'],goal:'先安全降载，恢复后再沟通',observe:'呼吸、动作、逃离与恢复信号',stop:'出现伤害、意识或呼吸风险立即升级',followUp:'用ABC记录寻找可预防的触发'},
      12:{behaviors:['推打','踢咬','抓人','扔东西'],goal:'保护所有人并避免冲突升级',observe:'武器、头颈攻击和撤离条件',stop:'成人无法保证安全时立即求助',followUp:'由专业人员做功能评估和安全计划'},
      13:{behaviors:['撞头','咬手','抓伤自己','掐颈'],goal:'最低限度保护并尽快获得医疗支持',observe:'伤情、意识、呼吸、自杀言语或计划',stop:'本策略本身就是升级入口',followUp:'完成医疗评估与家庭危机计划'},
      14:{behaviors:['冲门','突然跑开','脱离视线','走失'],goal:'尽快恢复目视并启动警方协作',observe:'道路水边高处与最后出现地点',stop:'真实走失不在应用内继续学习',followUp:'更新照片、常去地点和家庭分工'},
      15:{behaviors:['拒绝上学','结束屏幕哭闹','活动转换困难'],goal:'让变化可预期并降低启动难度',observe:'哪种预告、选择和第一步有效',stop:'升级到伤害风险时切换安全处置',followUp:'调整日程、要求与视觉支持'},
      16:{behaviors:['挑食','拒绝新食物','进餐焦虑'],goal:'安全扩大可接受范围而不强迫',observe:'摄入、呛咳、疼痛、便秘与体重',stop:'吞咽困难、脱水或体重下降先就医',followUp:'必要时转儿科、营养和吞咽团队'},
      17:{behaviors:['入睡困难','夜醒','早醒','突然少睡'],goal:'记录规律并识别健康红旗',observe:'睡眠小时、日间精力、用药与疼痛',stop:'少睡伴兴奋冲动时立即精神科评估',followUp:'带两周睡眠记录就医'},
      18:{behaviors:['持续低落','兴趣下降','退缩','无望表达'],goal:'确认安全、维持陪伴并及时转介',observe:'自伤想法、持续天数与功能下降',stop:'有或不确定自杀风险立即急救',followUp:'儿童精神科或临床心理评估'},
      19:{behaviors:['极少睡眠','异常兴奋','话多','冲动冒险'],goal:'停止刺激并尽快精神科分诊',observe:'与平时差异、持续时间和用药变化',stop:'攻击、自伤、幻觉或失控立即急救',followUp:'严格按医生意见处理，不自行改药'},
      20:{behaviors:['幻觉妄想','严重混乱','意识改变','药物过量'],goal:'立即医疗求助，不做家庭训练',observe:'呼吸、意识、药名剂量和服用时间',stop:'不要在应用内继续尝试其他策略',followUp:'按急救和精神科团队安排复诊'}
    };

    // 策略 → 知识库场景标签。方案名是星伴的说法（「深呼吸引导法」），书里不会这么写，
    // 直接拿方案名检索只能撞到词面巧合；所以改用它对应的场景标签 + 具体行为词（哭闹/尖叫/倒地）。
    const STRATEGY_KB_SCENE = {
      1:['焦虑与恐惧'], 2:['焦虑与恐惧','愤怒与情绪失控'], 3:['注意力与多动'],
      4:['对立违抗与品行问题'], 5:['对立违抗与品行问题'], 6:['注意力与多动','成长与适应'],
      7:['社交与人际'], 8:['愤怒与情绪失控','焦虑与恐惧'], 9:['对立违抗与品行问题','注意力与多动'],
      10:['对立违抗与品行问题'], 11:['愤怒与情绪失控'], 12:['愤怒与情绪失控','对立违抗与品行问题'],
      13:['自伤与自杀风险'], 14:['自伤与自杀风险','创伤与应激'], 15:['对立违抗与品行问题','屏幕与网络依赖'],
      16:['进食与身体形象'], 17:['睡眠问题'], 18:['抑郁与情绪低落'],
      19:['睡眠问题','自伤与自杀风险'], 20:['自伤与自杀风险','躯体症状与健康焦虑'],
    };

    // 行为记录分类 → 知识库场景（快速记录保存后推荐延伸阅读用）。
    // 与 STRATEGY_KB_SCENE 同一套思路：不问「分类名怎么写」，只问「这类事在书上属于哪个问题场景」。
    // 安全类分类（自伤/绝望/幻觉/走失）标了 highRisk —— 这几类不给「照着做」的东西，只给背景知识与就医优先提示。
    const RECORD_KB_SCENE = {
      '情绪爆发': ['愤怒与情绪失控', '焦虑与恐惧'],
      '刻板行为': ['强迫与重复行为'],
      '攻击行为': ['愤怒与情绪失控', '对立违抗与品行问题'],
      '自伤行为': ['自伤与自杀风险'],
      '跑开/走失': ['自伤与自杀风险', '创伤与应激'],
      '感官寻求': ['注意力与多动'],
      '感官回避': ['焦虑与恐惧'],
      '沟通尝试': ['亲子关系与家庭', '对立违抗与品行问题'],
      '适应性技能': ['成长与适应', '注意力与多动'],
      '社交发起': ['社交与人际'],
      '进食问题': ['进食与身体形象'],
      '睡眠问题': ['睡眠问题'],
      '异常兴奋/活动骤增': ['睡眠问题', '自伤与自杀风险'],
      '绝望/谈论死亡': ['自伤与自杀风险', '抑郁与情绪低落'],
      '幻觉/妄想/意识异常': ['自伤与自杀风险', '躯体症状与健康焦虑'],
      '其他': [],
    };
    // 记录后不该只给「相关章节」、必须先谈安全与就医的分类
    const RECORD_HIGH_RISK = ['自伤行为', '跑开/走失', '绝望/谈论死亡', '幻觉/妄想/意识异常'];

    // 分类 → 「家长看得见的具体动作」关键词组。
    // 为什么不能只拿家长原话去检索：实测「孩子今天用头撞墙，我怎么拦都拦不住」
    // 在「自伤与自杀风险」场景内命中 0 条（整句噪声太大、书上不这么成句），
    // 换成「撞头 咬手 抓伤自己」立刻有 3 条。所以分两级：先试原话（更贴当事人），
    // 不中就退到关键词组，并**在界面上如实说明是哪种找法**。
    const RECORD_KB_KEYWORDS = {
      '情绪爆发': '哭闹 尖叫 倒地 发脾气 摔东西',
      '刻板行为': '重复 固定顺序 必须一样 仪式',
      '攻击行为': '打人 咬人 踢人 推人 扔东西',
      '自伤行为': '撞头 咬手 抓伤自己 打自己',
      '跑开/走失': '跑开 走失 乱跑 冲出去',
      '感官寻求': '转圈 蹦跳 摸不停 寻求刺激',
      '感官回避': '捂耳 怕吵 回避触碰',
      '沟通尝试': '说不出来 表达 沟通 发脾气代替说话',
      '适应性技能': '穿衣服 洗漱 自理 完成任务',
      '社交发起': '交朋友 不敢说话 被孤立',
      '进食问题': '挑食 拒绝新食物 吃不下',
      '睡眠问题': '入睡困难 夜醒 早醒 睡得少',
      '异常兴奋/活动骤增': '话多 兴奋 精力旺盛 睡得少',
      '绝望/谈论死亡': '不想活 活着没意思 谈论死亡',
      '幻觉/妄想/意识异常': '听到声音 看到别人看不到 意识不清',
      '其他': '',
    };

    const STRATEGY_BEHAVIOR_GROUPS = [
      {id:'全部',label:'全部情况',icon:'⌕'}, {id:'情绪爆发',label:'哭闹/爆发',icon:'◔'}, {id:'攻击行为',label:'攻击/扔物',icon:'!'},
      {id:'自伤风险',label:'自伤风险',icon:'+'}, {id:'跑开走失',label:'跑开/走失',icon:'⌖'}, {id:'拒绝转换',label:'拒绝/转换',icon:'⇄'},
      {id:'沟通辅助',label:'沟通受挫',icon:'…'}, {id:'情绪安抚',label:'焦虑/过载',icon:'≈'}, {id:'进食问题',label:'进食困难',icon:'◇'},
      {id:'睡眠变化',label:'睡眠变化',icon:'☾'}, {id:'低落退缩',label:'低落/退缩',icon:'—'}, {id:'异常兴奋',label:'兴奋/少睡',icon:'↑'},
      {id:'医疗事件',label:'意识/药物',icon:'✚'}, {id:'生活自理',label:'生活自理',icon:'✓'}, {id:'社交训练',label:'社交困难',icon:'○'}
    ];

    // === 全局状态管理 ===
    const appState = {
      lastCheckIn: null,     // 最后签到日期 (YYYY-MM-DD)
      checkInStreak: 0,      // 连续签到天数
      totalCheckIns: 0,      // 总签到天数
    };

    function loadAppState() {
      const saved = localStorage.getItem('xingban_app_state');
      if (saved) {
        try {
          Object.assign(appState, JSON.parse(saved));
        } catch(e) {}
      }
    }

    function saveAppState() {
      localStorage.setItem('xingban_app_state', JSON.stringify(appState));
    }

    // === 辅助函数：添加成长记录并更新成长指数 ===
    function addGrowthRecord(activity, score, type) {
      const newRecord = {
        id: Date.now(),
        date: new Date().toISOString().split('T')[0],
        activity: activity,
        score: score,
        type: type
      };
      MOCK_DATA.growthRecords.unshift(newRecord);
      // 更新成长指数
      MOCK_DATA.growth.index = Math.min(100, MOCK_DATA.growth.index + Math.round(score / 5));
      // 更新成长Profile总分
      if (MOCK_DATA.growthProfile) {
        MOCK_DATA.growthProfile.total_score = Math.min(100, MOCK_DATA.growthProfile.total_score + Math.round(score / 5));
      }
    }

    let currentUser = null;
    let currentPage = 'login';
    let selectedChild = null;
    let activeEmergencySession = null;
    let emergencyStartInFlight = false;
    let emergencyEndInFlight = false;

    // === 工具函数 ===
    function showToast(message) {
      const toast = document.getElementById('toast');
      const msg = document.getElementById('toast-message');
      msg.textContent = message;
      toast.classList.remove('hidden');
      setTimeout(() => toast.classList.add('hidden'), 3000);
    }

    function mayUsePrototypeStorage() { return ['localhost', '127.0.0.1', ''].includes(location.hostname); }
    function currentChildId() { return Number(selectedChild?.id || MOCK_DATA.children?.[0]?.id || 0); }
    const sensitiveRecordCache = new Map();
    function sensitiveRecordKey(kind) { return `${currentChildId()}:${kind}`; }
    function readPrototypeSensitive(localKey, fallback = {}) {
      try {
        const scopedKey=`${localKey}:${currentChildId()}`;
        const current = sessionStorage.getItem(scopedKey);
        if (current) return JSON.parse(current);
        const legacy = localStorage.getItem(localKey);
        if (legacy) { localStorage.removeItem(localKey); sessionStorage.setItem(scopedKey, legacy); return JSON.parse(legacy); }
      } catch (_) {}
      return fallback;
    }
    async function loadSensitiveRecord(kind, localKey, fallback = {}) {
      const childId = currentChildId();
      if (!childId) return { data: fallback, server: false };
      const key=sensitiveRecordKey(kind);if(sensitiveRecordCache.has(key))return{data:sensitiveRecordCache.get(key),server:!useMockMode};
      if (!useMockMode) {
        try { const result = await apiRequest(`/sensitive/record/${kind}/${childId}`, 'GET'); if (result.success && result.resource?.data) { sensitiveRecordCache.set(key,result.resource.data); return { data: result.resource.data, server: true }; } } catch (_) {}
      }
      const data=readPrototypeSensitive(localKey, fallback);sensitiveRecordCache.set(key,data);return { data, server: false };
    }
    function cachedSensitiveRecord(kind,localKey,fallback={}){return sensitiveRecordCache.get(sensitiveRecordKey(kind))||readPrototypeSensitive(localKey,fallback)}
    async function persistSensitiveRecord(kind, data, localKey) {
      const childId = currentChildId();
      if (!childId) throw new Error('请先建立或选择儿童档案');
      sensitiveRecordCache.set(sensitiveRecordKey(kind),data);
      const scopedLocalKey=`${localKey}:${childId}`;
      if (useMockMode) { sessionStorage.setItem(scopedLocalKey, JSON.stringify(data)); localStorage.removeItem(localKey); return { server: false, demo: true }; }
      try {
        const result = await apiRequest(`/sensitive/record/${kind}/${childId}`, 'PUT', { data });
        if (!result.success) throw new Error('secure save failed');
        sessionStorage.removeItem(scopedLocalKey);
        localStorage.removeItem(localKey);
        return { server: true };
      } catch (error) {
        if (!mayUsePrototypeStorage()) throw error;
        sessionStorage.setItem(scopedLocalKey, JSON.stringify(data));
        localStorage.removeItem(localKey);
        return { server: false };
      }
    }

    function closeTopModal() {
      if ('speechSynthesis' in window) speechSynthesis.cancel();
      const visibleLayers = [...document.querySelectorAll('.fixed:not(.hidden), .modal-backdrop:not(.hidden)')]
        .filter(el => !el.matches('nav, #toast, #loading-overlay'));
      const modal = visibleLayers.at(-1);
      if (!modal) return;
      if (modal.id === 'register-modal') hideRegister();
      else modal.remove();
    }

    const modalObserver = new MutationObserver(mutations => {
      mutations.flatMap(m => [...m.addedNodes]).forEach(node => {
        if (!(node instanceof HTMLElement) || !node.classList.contains('fixed')) return;
        if (node.matches('nav, #toast, #loading-overlay')) return;
        node.setAttribute('role', 'dialog');
        node.setAttribute('aria-modal', 'true');
        const heading = node.querySelector('h2, h3');
        if (heading && !node.getAttribute('aria-label')) node.setAttribute('aria-label', heading.textContent.trim());
      });
    });
    modalObserver.observe(document.body, { childList: true });
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape') closeTopModal();
    });

    function formatDate(dateStr) {
      if (!dateStr) return '';
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return dateStr;
      const now = new Date();
      const diff = now - d;
      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      if (days === 0) return '今天';
      if (days === 1) return '昨天';
      if (days === 2) return '前天';
      if (days < 7) return days + '天前';
      return (d.getMonth() + 1) + '月' + d.getDate() + '日';
    }

    function showLoading() {
      document.getElementById('loading-overlay').classList.remove('hidden');
    }

    function hideLoading() {
      document.getElementById('loading-overlay').classList.add('hidden');
    }

    function saveUser(user) {
      // 统一用户数据结构，确保name/phone属性存在
      const normalizedUser = {
        ...user,
        name: user.nickname || user.name || '家长',
        phone: user.phone || ''
      };
      // 用户会话不跨页面刷新持久化，避免设备遗失后暴露家庭账号状态。
      localStorage.removeItem('xingban_user');
      currentUser = normalizedUser;
      authenticatedSession = true;
    }

    function getUser() {
      return currentUser;
    }

    const ageFromBirthDate = value => {
      const birth = new Date(value);
      if (Number.isNaN(birth.getTime())) return null;
      const now = new Date();
      let age = now.getFullYear() - birth.getFullYear();
      if (now < new Date(now.getFullYear(), birth.getMonth(), birth.getDate())) age -= 1;
      return Math.max(0, age);
    };

    async function hydrateAuthenticatedSession() {
      if (useMockMode) return { success: true, mode: 'demo' };
      // 真实账号只使用服务端返回的数据，避免本机演示缓存混入儿童健康信息。
      localStorage.removeItem('xingban_behaviors');
      localStorage.removeItem('xingban_children');
      if (currentUser?.role === 'therapist') {
        const [directoryResult, assignedResult] = await Promise.all([
          apiRequest('/therapist?limit=50', 'GET'),
          apiRequest('/therapist/plans/assigned', 'GET')
        ]);
        if (!directoryResult.success || !assignedResult.success) return { success: false, error: directoryResult.error || assignedResult.error };
        MOCK_DATA.children = [];
        MOCK_DATA.behaviors = [];
        MOCK_DATA.reports = [];
        MOCK_DATA.therapists = (directoryResult.therapists || []).map(item => ({ id: Number(item.id), name: item.name, title: item.professional_title || '专业人员', specialty: item.specialty || '服务范围待补充', avatar: '🩺', is_certified: !!item.is_certified, years_of_experience: Number(item.years_of_experience || 0) }));
        professionalActions = assignedResult.plans || [];
        reportShareRecords = [];
        strategyFeedbackHistory = [];
        sessionDataMode = 'server';
        return { success: true, mode: 'server' };
      }
      const childResult = await apiRequest('/child', 'GET');
      if (!childResult.success) return childResult;
      const children = (childResult.children || []).map(child => ({
        ...child,
        id: Number(child.id),
        name: child.nickname || '未命名儿童',
        age: ageFromBirthDate(child.birth_date),
        diagnosis: child.diagnosis_other || child.diagnosis_type || '未填写',
        avatar: child.avatar || '🧒'
      }));

      const bundles = await Promise.all(children.map(async child => {
        const [behaviorResult, reportListResult] = await Promise.all([
          apiRequest(`/behavior/${child.id}?limit=100`, 'GET'),
          apiRequest(`/report/${child.id}/list?limit=52`, 'GET')
        ]);
        if (!behaviorResult.success || !reportListResult.success) return { success: false, error: behaviorResult.error || reportListResult.error };
        const reportDetails = await Promise.all((reportListResult.reports || []).map(item => apiRequest(`/report/${child.id}/${Number(item.id)}`, 'GET')));
        if (reportDetails.some(item => !item.success)) return { success: false, error: '部分周报读取失败，请重试' };
        return { success: true, child, behaviors: behaviorResult.records || [], reports: reportDetails.map(item => item.report) };
      }));
      const failed = bundles.find(item => !item.success);
      if (failed) return failed;

      const [therapistResult, plansResult, sharesResult, feedbackResult] = await Promise.all([
        apiRequest('/therapist?limit=50', 'GET'),
        apiRequest('/therapist/plans/mine', 'GET'),
        apiRequest('/therapist/shares/mine', 'GET'),
        apiRequest('/strategy/feedback/mine?limit=200', 'GET')
      ]);
      const relatedFailure = [therapistResult, plansResult, sharesResult, feedbackResult].find(item => !item.success);
      if (relatedFailure) return relatedFailure;
      MOCK_DATA.children = children;
      MOCK_DATA.behaviors = bundles.flatMap(bundle => bundle.behaviors.map(record => ({
        id: Number(record.id), childId: bundle.child.id, childName: bundle.child.name,
        type: record.input_type === 'voice' ? '语音记录' : record.input_type === 'photo' ? '图片记录' : '文字记录',
        category: record.behavior_category || '其他', emotion: record.emotion_state || '未标注',
        description: record.content || '未填写文字说明', time: formatDate(record.created_at),
        intensity: record.intensity_level === 'high' ? 8 : record.intensity_level === 'low' ? 2 : 5,
        raw: record
      })));
      MOCK_DATA.reports = bundles.flatMap(bundle => bundle.reports.map(report => ({
        id: Number(report.id), childId: bundle.child.id, childName: bundle.child.name,
        week: `${String(report.week_start || '').slice(0,10)} 至 ${String(report.week_end || '').slice(0,10)}`,
        records: Number(report.content?.summary?.total_records || 0),
        emotion: 'neutral', content: report.content || {}, generated_at: report.generated_at,
        aiComment: '家庭观察汇总：请核对原始记录；记录数量和标签不构成诊断或因果判断。'
      })));
      MOCK_DATA.therapists = (therapistResult.therapists || []).map(item => ({
        id: Number(item.id), name: item.name, title: item.professional_title || '专业人员', specialty: item.specialty || '服务范围待补充',
        avatar: '🩺', is_certified: !!item.is_certified, years_of_experience: Number(item.years_of_experience || 0)
      }));
      professionalActions = plansResult.plans || [];
      reportShareRecords = sharesResult.shares || [];
      strategyFeedbackHistory = (feedbackResult.feedback || []).map(item => ({
        ...item, id: Number(item.id), childId: Number(item.child_id), strategyId: Number(item.strategy_id),
        behaviorRecordId: item.behavior_record_id ? Number(item.behavior_record_id) : null, createdAt: item.created_at
      }));
      sessionDataMode = 'server';
      return { success: true, mode: 'server' };
    }

    // === 登录/注册 ===
    async function handleLogin() {
      const phone = document.getElementById('login-phone').value;
      const password = document.getElementById('login-password').value;

      if (!phone) {
        showToast('请输入手机号');
        return;
      }
      if (!password) {
        showToast('请输入密码');
        return;
      }

      document.getElementById('login-btn-text').textContent = '登录中...';
      document.getElementById('login-spinner').classList.remove('hidden');

      try {
        const result = await apiRequest('/auth/login', 'POST', { phone, password });

        if (result.success) {
          setToken(result.token || null);
          saveUser(result.user);
          const hydrated = await hydrateAuthenticatedSession();
          if (!hydrated.success) {
            setToken(null);
            currentUser = null;
            authenticatedSession = false;
            showToast(hydrated.error || '家庭数据加载失败，请重试登录');
            return;
          }
          document.getElementById('login-page').classList.add('hidden');
          document.getElementById('main-app').classList.remove('hidden');
          navigateTo('home');
          showToast('登录成功！');
        } else {
          showToast(result.error || '登录失败');
        }
      } catch (error) {
        console.error('登录错误:', error);
        showToast('网络错误，请稍后重试');
      } finally {
        document.getElementById('login-btn-text').textContent = '登 录';
        document.getElementById('login-spinner').classList.add('hidden');
      }
    }

    function showCommunitySafetyHold(result) {
      const modal=document.createElement('div');modal.className='fixed inset-0 bg-red-950/80 flex items-end sm:items-center justify-center z-[80] p-0 sm:p-4';modal.dataset.modal='true';
      modal.innerHTML=`<div class="bg-white w-full max-w-lg rounded-t-3xl sm:rounded-2xl p-5"><div class="text-xs font-bold text-red-700">安全优先 · 内容未公开</div><h2 class="text-xl font-bold mt-1">${escapeText(result.safety?.title||'这条内容需要先进行安全核查')}</h2><p class="text-sm text-text-secondary mt-2">自动识别只用于安全分流，不代表对孩子或照护者作出诊断。审核编号：${escapeText(result.case_ref||'待生成')}</p><ol class="mt-4 space-y-2">${(result.safety?.actions||[]).map((item,index)=>`<li class="flex gap-3 p-3 rounded-xl bg-red-50 text-sm"><strong class="text-red-700">${index+1}</strong><span>${escapeText(item)}</span></li>`).join('')}</ol><div class="grid grid-cols-2 gap-2 mt-4"><button data-ui-action="close-and-navigate" data-nav="emergency" class="py-3 rounded-xl bg-red-700 text-white font-bold">进入紧急支持</button><button data-ui-action="close-and-navigate" data-nav="community" class="py-3 rounded-xl border border-border font-medium">返回社区</button></div></div>`;
      document.body.appendChild(modal);
    }

    function showRegister() {
      document.getElementById('register-modal').classList.remove('hidden');
    }

    function hideRegister() {
      document.getElementById('register-modal').classList.add('hidden');
    }

    async function handleRegister() {
      const phone = document.getElementById('reg-phone').value;
      const name = document.getElementById('reg-name').value;
      const password = document.getElementById('reg-password').value;

      if (!phone || !name || !password) {
        showToast('请填写完整信息');
        return;
      }

      try {
        const result = await apiRequest('/auth/register', 'POST', { phone, password, nickname: name });

        if (result.success) {
          setToken(result.token || null);
          saveUser(result.user);
          const hydrated = await hydrateAuthenticatedSession();
          if (!hydrated.success) {
            setToken(null);
            currentUser = null;
            authenticatedSession = false;
            showToast(hydrated.error || '家庭数据加载失败，请重新登录');
            return;
          }
          hideRegister();
          document.getElementById('login-page').classList.add('hidden');
          document.getElementById('main-app').classList.remove('hidden');
          navigateTo('home');
          showToast('注册成功！');
        } else {
          showToast(result.error || '注册失败');
        }
      } catch (error) {
        console.error('注册错误:', error);
        showToast('网络错误，请稍后重试');
      }
    }

    // === 页面导航 ===
    function navigateTo(page) {
      currentPage = page;

      // 更新导航状态
      document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
      document.querySelectorAll('.side-nav-item').forEach(el => {
        const isCurrent = el.dataset.page === page;
        el.classList.toggle('active', isCurrent);
        if (isCurrent) el.setAttribute('aria-current', 'page'); else el.removeAttribute('aria-current');
      });
      const navId = `nav-${page === 'home' || page === 'emergency' || page === 'strategies' || page === 'records' || page === 'profile' || page === 'children' ? page : 'home'}`;
      const navEl = document.getElementById(navId);
      if (navEl) navEl.classList.add('active');

      // 渲染页面
      const content = document.getElementById('main-content');
      content.innerHTML = '';

      switch(page) {
        case 'home': renderHome(content); break;
        case 'records': renderRecords(content); break;
        case 'emergency': renderEmergency(content); break;
        case 'strategies': renderStrategies(content); break;
        case 'knowledge': renderKnowledge(content); break;
        case 'worksheets': renderWorksheets(content); break;
        case 'dialogues': renderDialogues(content); break;
        case 'profile': renderProfile(content); break;
        case 'children': renderChildren(content); break;
        case 'profile-detail': renderChildProfileDetail(content); break;
        case 'reports': renderReports(content); break;
        case 'family': renderFamily(content); break;
        case 'growth': renderGrowth(content); break;
        case 'safety': renderSafety(content); break;
        case 'stories': renderStories(content); break;
        case 'ai': renderAI(content); break;
        case 'community': renderCommunity(content); break;
        case 'notifications': renderNotifications(content); break;
        case 'career': renderCareer(content); break;
        case 'finance': renderFinance(content); break;
        case 'therapist': renderTherapist(content); break;
        case 'achievements': renderAchievements(content); break;
        case 'peer': renderPeer(content); break;
        case 'settings': renderSettings(content); break;
        default: renderHome(content);
      }
    }

    // === 页面渲染函数 ===

    function renderHome(container) {
      document.getElementById('page-title').textContent = '首页';
      document.getElementById('page-subtitle').textContent = '陪伴孩子每一天';

      const todayRecords = MOCK_DATA.behaviors.filter(b => b.time.includes('今天') || b.time.includes('刚刚')).length;

      // 时间问候
      const hour = new Date().getHours();
      let greeting = '早安';
      let greetingIcon = '🌅';
      if (hour >= 12 && hour < 14) { greeting = '午安'; greetingIcon = '☀️'; }
      else if (hour >= 14 && hour < 18) { greeting = '下午好'; greetingIcon = '🌤️'; }
      else if (hour >= 18 && hour < 22) { greeting = '晚上好'; greetingIcon = '🌙'; }
      else if (hour >= 22 || hour < 6) { greeting = '夜深了'; greetingIcon = '🌃'; }

      container.innerHTML = `
        <div class="p-4 space-y-6 animate-fade-in">
          <!-- 欢迎卡片 -->
          <div class="bg-gradient-to-br from-primary to-primary-dark rounded-2xl p-5 text-white card-shadow">
            <div class="inline-flex px-2 py-1 mb-3 rounded-lg text-xs font-bold ${sessionDataMode==='server'?'bg-white/20':'bg-amber-300 text-amber-950'}">${sessionDataMode==='server'?'已连接家庭数据':'演示体验 · 使用虚构数据'}</div>
            <h2 class="text-lg font-bold mb-1">${greeting}，${escapeText(currentUser?.name || '家长')} ${greetingIcon}</h2>
            <p class="text-white/80 text-sm">${hour >= 22 ? '先照顾好自己，记录可以明天再补' : hour >= 18 ? '辛苦一天了，今天不完成任务也没关系' : '按你的节奏来，我们只保留真正需要的事'}</p>
            <div class="flex gap-4 mt-4 gamification-only">
              <div>
                <div class="text-2xl font-bold">${todayRecords}</div>
                <div class="text-xs text-white/70">今日记录</div>
              </div>
              <div>
                <div class="text-2xl font-bold">${MOCK_DATA.children.length}</div>
                <div class="text-xs text-white/70">孩子档案</div>
              </div>
              <div>
                <div class="text-2xl font-bold">${MOCK_DATA.strategies.length}</div>
                <div class="text-xs text-white/70">可用策略</div>
              </div>
            </div>
          </div>

          <!-- 今日签到卡片 -->
          ${isCheckedInToday() ? `
          <div class="bg-white p-4 rounded-xl card-shadow flex items-center gap-3 gamification-only">
            <div class="w-10 h-10 bg-success/20 rounded-full flex items-center justify-center">
              <span class="text-lg">✅</span>
            </div>
            <div class="flex-1">
              <div class="text-sm font-medium text-text-primary">今日已签到</div>
              <div class="text-xs text-text-muted">连续签到 ${appState.checkInStreak} 天 · 已获 +3 成长积分</div>
            </div>
            <span class="text-xs text-success font-medium">已完成</span>
          </div>
          ` : `
          <div class="bg-white p-4 rounded-xl card-shadow flex items-center gap-3 gamification-only">
            <div class="w-10 h-10 bg-amber-100 rounded-full flex items-center justify-center">
              <span class="text-lg">📅</span>
            </div>
            <div class="flex-1">
              <div class="text-sm font-medium text-text-primary">今日还未签到</div>
              <div class="text-xs text-text-muted">连续签到 ${appState.checkInStreak} 天 · 签到可获 +3 成长积分</div>
            </div>
            <button data-ui-call="checkIn" class="px-4 py-1.5 bg-primary text-white text-sm rounded-lg font-medium hover:bg-primary-dark transition-colors">签到</button>
          </div>
          `}

          <!-- 快速入口 -->
          <section>
            <div class="flex items-end justify-between mb-3"><div><h3 class="font-bold text-text-primary">现在要做什么</h3><p class="text-xs text-text-muted mt-1">高频任务放在这里，其他工具在“我的”中</p></div></div>
            <div class="grid grid-cols-2 gap-3">
              <button data-nav="records" class="flex items-center gap-3 p-4 bg-white rounded-2xl border border-border card-shadow text-left hover:border-primary transition-colors"><span class="w-10 h-10 shrink-0 bg-primary-light/50 rounded-xl flex items-center justify-center text-xl">✍️</span><span><strong class="block text-sm text-text-primary">快速记录</strong><small class="text-xs text-text-muted">记下刚才发生的事</small></span></button>
              <button data-nav="children" class="flex items-center gap-3 p-4 bg-white rounded-2xl border border-border card-shadow text-left hover:border-primary transition-colors"><span class="w-10 h-10 shrink-0 bg-primary-light/50 rounded-xl flex items-center justify-center text-xl">🧒</span><span><strong class="block text-sm text-text-primary">孩子与记录</strong><small class="text-xs text-text-muted">按孩子查看变化</small></span></button>
              <button data-nav="strategies" class="flex items-center gap-3 p-4 bg-white rounded-2xl border border-border card-shadow text-left hover:border-primary transition-colors"><span class="w-10 h-10 shrink-0 bg-primary-light/50 rounded-xl flex items-center justify-center text-xl">🧭</span><span><strong class="block text-sm text-text-primary">按情况找策略</strong><small class="text-xs text-text-muted">现场步骤与停止条件</small></span></button>
              <button data-nav="therapist" class="flex items-center gap-3 p-4 bg-white rounded-2xl border border-border card-shadow text-left hover:border-primary transition-colors"><span class="w-10 h-10 shrink-0 bg-primary-light/50 rounded-xl flex items-center justify-center text-xl">🤝</span><span><strong class="block text-sm text-text-primary">专业协作</strong><small class="text-xs text-text-muted">整理问题与就诊准备</small></span></button>
            </div>
          </section>

          <!-- 消息提醒 -->
          ${MOCK_DATA.notifications.filter(n => !n.is_read).length > 0 ? `
          <div data-nav="notifications" class="bg-white p-4 rounded-xl card-shadow flex items-center gap-3 cursor-pointer hover:shadow-md transition-shadow">
            <div class="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center">
              <span class="text-lg">🔔</span>
            </div>
            <div class="flex-1">
              <div class="text-sm font-medium text-text-primary">您有 ${MOCK_DATA.notifications.filter(n => !n.is_read).length} 条未读消息</div>
              <div class="text-xs text-text-muted">点击查看详情</div>
            </div>
            <div class="w-5 h-5 bg-danger rounded-full flex items-center justify-center">
              <span class="text-xs text-white font-bold">${MOCK_DATA.notifications.filter(n => !n.is_read).length}</span>
            </div>
          </div>
          ` : ''}

          <!-- 最近记录 -->
          <div>
            <div class="flex items-center justify-between mb-3">
              <h3 class="font-bold text-text-primary">最近记录</h3>
              <button data-nav="records" class="text-xs text-primary">查看全部</button>
            </div>
            <div class="space-y-3">
              ${MOCK_DATA.behaviors.slice(0, 3).map(b => `
                <div class="bg-white p-4 rounded-xl card-shadow flex items-start gap-3">
                  <div class="emoji-avatar bg-primary-light/30">${getAvatar(b.childName)}</div>
                  <div class="flex-1">
                    <div class="flex items-center gap-2 mb-1">
                      <span class="text-sm font-medium text-text-primary">${escapeText(b.childName)}</span>
                      <span class="text-xs px-2 py-0.5 bg-primary-light/50 text-primary rounded-full">${escapeText(b.type)}</span>
                      <span class="text-xs px-2 py-0.5 bg-secondary/50 text-text-secondary rounded-full">${escapeText(b.category)}</span>
                    </div>
                    <p class="text-sm text-text-secondary line-clamp-1">${escapeText(b.description)}</p>
                    <div class="flex items-center gap-2 mt-1">
                      <span class="text-xs text-text-muted">${escapeText(b.time)}</span>
                      <span class="text-xs text-emergency">强度: ${b.intensity}</span>
                    </div>
                  </div>
                </div>
              `).join('')}
            </div>
          </div>

          <!-- 推荐策略 -->
          <div>
            <div class="flex items-center justify-between mb-3">
              <h3 class="font-bold text-text-primary">推荐策略</h3>
              <button data-nav="strategies" class="text-xs text-primary">更多</button>
            </div>
            <div class="grid grid-cols-2 gap-3">
              ${MOCK_DATA.strategies.slice(0, 2).map(s => `
                <div data-ui-call="showStrategyDetail" data-ui-args="[${Number(s.id)}]" class="bg-white p-4 rounded-xl card-shadow strategy-card cursor-pointer">
                  <div class="flex items-center justify-between mb-2">
                    <span class="font-medium text-text-primary text-sm">${escapeText(s.name)}</span>
                    <span class="text-xs px-2 py-0.5 ${getDifficultyColor(s.difficulty)} rounded-full">${escapeText(s.difficulty)}</span>
                  </div>
                  <p class="text-xs text-text-secondary line-clamp-2 mb-2">${escapeText(s.description)}</p>
                  <div class="flex items-center justify-between text-xs text-text-muted">
                    <span>效果数据待专业验证</span>
                    <span>${s.usageCount}次使用（演示）</span>
                  </div>
                </div>
              `).join('')}
            </div>
          </div>

        </div>
      `;
    }

    function getAvatar(name) {
      const child = MOCK_DATA.children.find(c => c.name === name);
      return child?.avatar || '👤';
    }

    function getDifficultyColor(diff) {
      switch(diff) {
        case '简单': return 'bg-success/20 text-success';
        case '中等': return 'bg-warning/20 text-warning';
        case '困难': return 'bg-danger/20 text-danger';
        default: return 'bg-gray-200 text-gray-600';
      }
    }

    function getStrategyProgress(id) {
      try { return JSON.parse(localStorage.getItem(`xingban_strategy_${id}`) || '[]'); }
      catch (_) { return []; }
    }

    function toggleStrategyStep(strategyId, stepIndex, checked) {
      const progress = new Set(getStrategyProgress(strategyId));
      if (checked) progress.add(stepIndex); else progress.delete(stepIndex);
      localStorage.setItem(`xingban_strategy_${strategyId}`, JSON.stringify([...progress]));
      const total = STRATEGY_GUIDES[strategyId].steps.length;
      document.getElementById(`strategy-progress-${strategyId}`).textContent = `${progress.size}/${total}`;
      document.getElementById(`strategy-progress-bar-${strategyId}`).style.width = `${Math.round(progress.size / total * 100)}%`;
      if (progress.size === total) showToast('本次练习步骤已全部完成');
    }

    function showStrategyDetail(id) {
      const strategy = MOCK_DATA.strategies.find(s => s.id === id);
      const guide = STRATEGY_GUIDES[id];
      const context = STRATEGY_CONTEXT[id] || {};
      const highRisk = ['自伤风险','跑开走失','异常兴奋','医疗事件'].includes(strategy?.category);
      if (!strategy || !guide) return;
      const progress = new Set(getStrategyProgress(id));
      const modal = document.createElement('div');
      modal.className = 'fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-3 sm:p-6';
      modal.innerHTML = `
        <div class="bg-white w-full max-w-2xl rounded-2xl animate-fade-in max-h-[92vh] overflow-hidden flex flex-col">
          <div class="flex justify-between items-start gap-4 p-5 sm:p-6 border-b border-border bg-white sticky top-0 z-10">
            <div><div class="flex items-center gap-2 mb-1"><span class="text-xs px-2 py-1 rounded-full bg-primary-light/40 text-primary font-medium">分步实操教程</span><span class="text-xs text-text-muted">约 ${Math.max(3, guide.steps.length * 2)} 分钟</span></div><h3 class="text-xl font-bold">${escapeText(strategy.name)}</h3><p class="text-sm text-text-secondary mt-1">${escapeText(strategy.description)}</p></div>
            <button data-ui-action="close-top-modal" aria-label="关闭教程" class="w-9 h-9 shrink-0 rounded-full bg-background text-text-muted hover:text-text-primary">✕</button>
          </div>
          <div class="overflow-y-auto p-5 sm:p-6 space-y-6">
            <button data-ui-call="speakStrategy" data-ui-args="[${Number(id)}]" class="w-full py-2.5 rounded-xl border border-primary/30 text-primary-dark font-medium">🔊 朗读步骤与示范话术</button>
            <section class="rounded-xl ${highRisk ? 'bg-red-50 border-red-200' : 'bg-primary-light/20 border-primary/10'} border p-4"><div class="text-xs font-semibold ${highRisk ? 'text-red-700' : 'text-primary'} mb-1">什么时候使用</div><p class="text-sm leading-6 text-text-primary">${guide.when}</p></section>
            ${highRisk ? `<button data-ui-action="close-and-navigate" data-nav="emergency" class="w-full py-3 rounded-xl bg-red-700 text-white font-bold">存在危险或拿不准：立即进入紧急支持</button>` : ''}
            <section class="grid sm:grid-cols-2 gap-3" aria-label="方案判断要点">
              <div class="rounded-xl bg-background p-4"><div class="text-xs font-bold text-text-muted">本方案要解决什么</div><p class="text-sm leading-6 mt-1">${context.goal || strategy.description}</p></div>
              <div class="rounded-xl bg-background p-4"><div class="text-xs font-bold text-text-muted">过程中观察什么</div><p class="text-sm leading-6 mt-1">${context.observe || '观察孩子是否更安全、更平静且愿意参与'}</p></div>
              <div class="rounded-xl bg-red-50 p-4"><div class="text-xs font-bold text-red-700">什么时候立即停止</div><p class="text-sm leading-6 mt-1 text-red-900">${context.stop || '反应明显加重或无法保证安全时立即停止'}</p></div>
              <div class="rounded-xl bg-primary-light/20 p-4"><div class="text-xs font-bold text-primary">平静后怎么继续</div><p class="text-sm leading-6 mt-1">${context.followUp || '记录场景和反应，与专业人员共同调整'}</p></div>
            </section>
            <details class="rounded-xl border border-border p-4"><summary class="font-bold text-text-primary cursor-pointer">根据孩子的沟通、感官和年龄调整</summary><div class="mt-3 grid gap-2 text-sm leading-6 text-text-secondary"><p><strong>语言少或不说话：</strong>一次一个动作，配合实物、图片、手势或孩子已有的AAC；等待至少5—10秒，不把沉默当拒绝。</p><p><strong>感官敏感：</strong>先问或观察孩子是否接受触碰、声音和光线；不要强抱、强迫眼神或突然加入新感官工具。</p><p><strong>年龄较大或进入青春期：</strong>尊重隐私和自主选择，避免幼儿化话术；将学校、人际、月经/青春期和网络压力纳入观察。</p><p><strong>与平时明显不同：</strong>优先考虑疼痛、疾病、睡眠、药物或心理健康变化，不要把所有变化都归因于孤独症。</p></div></details>
            <section><h4 class="font-bold text-text-primary mb-3">开始前准备</h4><div class="grid sm:grid-cols-3 gap-2">${guide.prepare.map((item, index) => `<div class="rounded-xl bg-background p-3 text-sm text-text-secondary"><span class="text-primary font-bold mr-1">${index + 1}.</span>${item}</div>`).join('')}</div></section>
            <section>
              <div class="flex items-center justify-between mb-3"><h4 class="font-bold text-text-primary">跟着做</h4><div class="flex items-center gap-2 text-xs text-text-muted"><span id="strategy-progress-${id}">${progress.size}/${guide.steps.length}</span><div class="w-20 h-1.5 rounded-full bg-gray-200 overflow-hidden"><div id="strategy-progress-bar-${id}" class="h-full bg-primary rounded-full transition-all" style="width:${Math.round(progress.size / guide.steps.length * 100)}%"></div></div></div></div>
              <div class="space-y-3">${guide.steps.map((step, index) => `<label class="flex gap-3 p-4 rounded-xl border border-border bg-white cursor-pointer hover:border-primary/40"><input type="checkbox" class="mt-1 w-4 h-4 accent-primary" ${progress.has(index) ? 'checked' : ''} data-ui-change="strategyStep" data-strategy="${Number(id)}" data-step="${Number(index)}"><span class="w-7 h-7 shrink-0 rounded-full bg-primary text-white text-sm font-bold flex items-center justify-center">${index + 1}</span><span><strong class="block text-sm text-text-primary mb-1">${step[0]}</strong><span class="block text-sm leading-6 text-text-secondary">${step[1]}</span></span></label>`).join('')}</div>
            </section>
            <section class="rounded-xl border border-primary/20 overflow-hidden"><div class="px-4 py-3 bg-primary-light/20 text-sm font-bold text-text-primary">可以直接照着说</div><blockquote class="p-4 text-sm leading-6 text-text-primary border-l-4 border-primary m-4 bg-background rounded-r-lg">${guide.script}</blockquote></section>
            <section class="rounded-xl bg-amber-50 border border-amber-200 p-4"><div class="text-sm font-bold text-amber-800 mb-1">注意避免</div><p class="text-sm leading-6 text-amber-900/80">${guide.avoid}</p></section>
            <section class="rounded-xl bg-danger/5 border border-danger/20 p-4"><div class="text-sm font-bold text-danger mb-1">不用于精神科紧急情况</div><p class="text-sm leading-6 text-text-secondary">若出现自伤/自杀想法或计划、意识异常、幻觉妄想、服药过量，或极少睡眠同时明显兴奋冲动，请停止本教程并进入“紧急支持”；不要让孩子独处，必要时拨打 120/110。</p></section>
            <section class="rounded-xl border border-border p-4" id="strategy-kb-${id}">
              <div class="text-sm font-bold text-text-primary mb-2">教材里的相关章节</div>
              <p class="text-sm text-text-muted">正在查知识库…</p>
            </section>
            <section class="flex flex-wrap items-center gap-4 py-2 text-sm"><div><span class="text-text-muted">证据状态</span> <strong>待专业复核，需个体化调整</strong></div><div><span class="text-text-muted">操作难度</span> <strong>${strategy.difficulty}</strong></div>${strategy.usageCount ? `<div><span class="text-text-muted">体验版使用</span> <strong>${strategy.usageCount} 次（演示）</strong></div>` : ''}</section>
            ${highRisk ? `<section class="border-t border-border pt-5"><div class="rounded-xl bg-red-50 border border-red-200 p-4"><strong class="text-red-800">这是一条安全分流路径，不评价“是否有效”</strong><p class="text-sm text-red-900 mt-1 leading-6">请记录发生时间、睡眠、用药、伤情和意识变化并交给专业人员判断；不要用完成教程代替求助。</p><button data-ui-action="close-and-navigate" data-nav="emergency" class="w-full mt-3 py-3 rounded-xl bg-red-700 text-white font-bold">进入紧急支持</button></div></section>` : `<section class="border-t border-border pt-5"><p class="text-sm text-text-secondary mb-3">实际尝试后，这个方法对孩子有效吗？</p><textarea id="strategy-feedback-note-${id}" rows="2" maxlength="200" placeholder="选填：使用场景、做到哪一步、孩子的反应" class="w-full mb-3 p-3 rounded-xl border border-border text-sm"></textarea><input id="strategy-feedback-request-${id}" type="hidden" value="${newClientRequestId()}"><p id="strategy-feedback-status-${id}" class="text-xs text-text-muted mb-2" role="status">尚未提交；失败时说明会保留。</p><div class="grid grid-cols-3 gap-2"><button data-ui-call="submitStrategyFeedback" data-ui-args="${uiArgsAttr(Number(strategy.id),'positive')}" class="strategy-feedback-button-${id} py-2.5 rounded-xl bg-success/10 text-success text-sm font-medium disabled:opacity-60">有效</button><button data-ui-call="submitStrategyFeedback" data-ui-args="${uiArgsAttr(Number(strategy.id),'neutral')}" class="strategy-feedback-button-${id} py-2.5 rounded-xl bg-blue-50 text-blue-700 text-sm font-medium disabled:opacity-60">一般</button><button data-ui-call="submitStrategyFeedback" data-ui-args="${uiArgsAttr(Number(strategy.id),'negative')}" class="strategy-feedback-button-${id} py-2.5 rounded-xl bg-danger/10 text-danger text-sm font-medium disabled:opacity-60">无效/不适</button></div></section>`}
          </div>
        </div>`;
      document.body.appendChild(modal);
      // 关联知识库：按方案对应的场景标签 + 具体行为词去教材里找相关章节。
      // 注意措辞——这些章节是「延伸阅读」，不是本方案的出处（方案本身是星伴整理的），
      // 否则就是把别人的书当成了自己内容的背书。安全类方案还要额外声明「不是处置步骤」。
      loadStrategyKb(id, highRisk);
    }

    // 薄场景清单从后端标签体系取（唯一来源是 _work/bridge_spec.json 的 thin_scenes），
    // 不在前端再抄一份——抄两份的修正表以前吃过亏。
    let kbBridgeScenes = null;
    async function getKbBridgeScenes() {
      if (kbBridgeScenes) return kbBridgeScenes;
      try {
        const t = await apiRequest('/knowledge/taxonomy', 'GET');
        kbBridgeScenes = Object.keys((t && t.taxonomy && t.taxonomy.bridge) || {});
      } catch (e) { kbBridgeScenes = []; }
      return kbBridgeScenes;
    }

    async function loadStrategyKb(id, highRisk) {
      const box = document.getElementById(`strategy-kb-${id}`);
      if (!box) return;
      const strategy = MOCK_DATA.strategies.find(s => s.id === id) || {};
      const ctx = STRATEGY_CONTEXT[id] || {};
      const scenes = STRATEGY_KB_SCENE[id] || [];
      const behaviors = (ctx.behaviors || []).slice(0, 3);
      // 行为词是「家长看得见的具体动作」（哭闹/尖叫/倒地），比方案名更接近书上用词；
      // 方案名是星伴自己的行话，加进去只会稀释检索，只在没有行为词时才用它兜底。
      const query = behaviors.join(' ') || strategy.name || '';
      const head = '<div class="text-sm font-bold text-text-primary mb-2">教材里的相关章节</div>';
      try {
        let pool = scenes.length ? await fetchKbForStrategy(query, scenes, 8) : [];
        if (pool.length < 2) pool = await fetchKbForStrategy(query, [], 8);
        // 分级：先看有没有真的讲到这个具体行为的章节，没有就退到「同一场景的通用章节」并如实说明。
        // 实测这批成人 CBT 教材里，撞头/捂耳/挑食这类儿童具体表现基本没有对应章节，
        // 所以「精准命中」多数时候是空的——那就必须让家长看出来是空的，而不是拿泛泛的章节充数。
        const direct = pool.filter(r => behaviors.some(b => String(r.text || '').includes(b))).slice(0, 3);
        const general = pool.filter(r => !direct.includes(r)).slice(0, 2);
        const show = direct.length ? direct : general;
        const bridgeAll = await getKbBridgeScenes();
        const bridgeScenes = scenes.filter(s => bridgeAll.includes(s));

        if (!show.length) {
          box.innerHTML = head
            + '<p class="text-sm text-text-muted">教材里暂时没有和这个方案对应的章节。</p>'
            + bridgeHintHtml(strategy, bridgeScenes)
            + `<button data-ui-call="askKnowledge" data-ui-args="${uiArgsAttr(strategy.name + '：' + (ctx.goal || ''))}" class="mt-2 w-full py-2.5 rounded-xl bg-primary text-white text-sm font-bold">用一句话问知识库</button>`;
          return;
        }

        const label = direct.length ? '教材里直接讲到的章节' : '同一类问题的通用章节';
        const caveat = direct.length
          ? '下面几章里出现了本方案针对的具体表现，点开可以核对原书正文。'
          : `教材里<strong>没有专门讲「${behaviors.slice(0, 2).join('、')}」这类具体表现的章节</strong>，下面是同一场景下最相关的几章，属于通用方法，不是针对这个行为的教程。`;

        box.innerHTML = head
          + `<p class="text-xs text-text-muted mb-2">${label}：${caveat}这些章节用于延伸阅读，<strong>不是本方案的出处</strong>（本方案由星伴整理）。</p>`
          + (highRisk ? '<p class="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-2 mb-2">这一条属于安全分流：下面的章节只是背景知识，<strong>不是应急处置步骤</strong>；现场安全与就医优先。</p>' : '')
          + `<div class="space-y-2">${show.map(r => `<button data-ui-call="openKnowledgeSource" data-ui-args='["${encodeURIComponent(r.id)}"]' class="w-full text-left p-3 rounded-xl bg-background border border-border hover:border-primary">
            <div class="text-sm font-medium text-text-primary flex items-center gap-2 flex-wrap">${escapeText(r.heading)}<span class="text-[10px] px-1.5 py-0.5 rounded bg-white border border-border text-text-muted">原书章节名</span>${r.scanQuality === 'weak' ? '<span class="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-800" title="该来源扫描质量欠佳，引用时请对照原书">扫描质量欠佳</span>' : ''}</div>
            <div class="text-xs text-text-muted mt-1">《${escapeText(r.source)}》</div>
            <div class="text-xs text-text-secondary mt-1 leading-5">${escapeText(String(r.text || '').slice(0, 80))}…</div>
          </button>`).join('')}</div>`
          + bridgeHintHtml(strategy, bridgeScenes);
      } catch (e) {
        box.innerHTML = head + '<p class="text-sm text-text-muted">知识库暂时取不到相关内容，稍后再试。</p>';
      }
    }

    // 题材缺口提示：这四类场景教材里没有专门章节，星伴做了「场景迁移卡」
    function bridgeHintHtml(strategy, bridgeScenes) {
      if (!bridgeScenes.length) return '';
      return `<p class="text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded-lg p-2 mt-2">「${escapeText(bridgeScenes.join('、'))}」这类题材，这批教材里没有专门章节。星伴把它通用的 CBT 方法迁移成了「场景迁移卡」（引文仍取自原书），可以到知识问答页问一次「${escapeText(strategy.name)}」看这张卡。</p>`;
    }

    function escapeAttr(s) {
      return String(s || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/</g, '&lt;').slice(0, 120);
    }

    async function fetchKbForStrategy(query, scenes, top) {
      const parts = [`q=${encodeURIComponent(query)}`, `top=${top}`];
      if (scenes && scenes.length) {
        parts.push(`scene=${encodeURIComponent(scenes.join(','))}`);
        parts.push('strictScene=1');   // 场景当硬条件：宁可少给几条，也不给偏的
      }
      const res = await apiRequest(`/knowledge/search?${parts.join('&')}`, 'GET');
      return (res && res.success && res.results) || [];
    }
    const strategyFeedbackInFlight = new Set();
    async function submitStrategyFeedback(strategyId, feedbackType) {
      if (strategyFeedbackInFlight.has(strategyId)) return;
      const note = document.getElementById(`strategy-feedback-note-${strategyId}`)?.value.trim() || '';
      const client_request_id = document.getElementById(`strategy-feedback-request-${strategyId}`)?.value;
      const status = document.getElementById(`strategy-feedback-status-${strategyId}`);
      const context = currentInterventionContext;
      if (navigator.onLine === false) { status.textContent='未提交：当前网络已断开；说明仍保留在本页，联网后可重试。';showToast('当前网络已断开，策略反馈尚未提交');return; }
      strategyFeedbackInFlight.add(strategyId);
      document.querySelectorAll(`.strategy-feedback-button-${strategyId}`).forEach(button=>button.disabled=true);
      status.textContent='正在保存反馈，请勿重复点击。';
      try {
        const result = await apiRequest('/strategy/feedback', 'POST', {
          client_request_id,
          child_id: context?.childId || 1,
          strategy_id: strategyId,
          behavior_record_id: context?.behaviorRecordId || null,
          effectiveness: feedbackType === 'positive' ? 'effective' : feedbackType === 'neutral' ? 'neutral' : 'ineffective',
          note,
          scene: context?.category || null
        });
        if (result.success) {
          strategyFeedbackHistory.unshift({ id: result.feedback?.id || Date.now(), strategyId, behaviorRecordId: context?.behaviorRecordId || null, childId: context?.childId || 1, effectiveness: feedbackType, note, createdAt: new Date().toISOString() });
          strategyFeedbackHistory = strategyFeedbackHistory.slice(0, 200);
          if (mayUsePrototypeStorage() && useMockMode) localStorage.setItem('xingban_strategy_feedback', JSON.stringify(strategyFeedbackHistory));
          addGrowthRecord('完成策略反馈', feedbackType === 'positive' ? 8 : 4, 'strategy');
          currentInterventionContext = null;
          showToast(result.replayed ? '这条反馈此前已经保存' : feedbackType === 'positive' ? '感谢反馈！已关联到本周周报' : '已记录反馈并关联原始记录');
          closeTopModal();
          navigateTo('reports');
        } else {
          showToast(result.error || '反馈提交失败');
        }
      } catch (error) {
        console.error('反馈提交失败:', error);
        status.textContent=`未确认保存：${error.message||'网络连接中断'}。说明仍在本页，可重试。`;
        showToast('策略反馈尚未确认保存');
      } finally {
        strategyFeedbackInFlight.delete(strategyId);
        document.querySelectorAll(`.strategy-feedback-button-${strategyId}`).forEach(button=>button.disabled=false);
      }
    }

    function speakStrategy(strategyId) {
      const guide = STRATEGY_GUIDES[strategyId];
      if (!guide || !('speechSynthesis' in window)) { showToast('当前设备不支持语音朗读'); return; }
      speechSynthesis.cancel();
      const text = guide.steps.map((s, i) => `第${i + 1}步，${s[0]}。${s[1]}`).join('。') + `。示范话术：${guide.script}`;
      const utterance = new SpeechSynthesisUtterance(text); utterance.lang = 'zh-CN'; utterance.rate = 0.8;
      speechSynthesis.speak(utterance); showToast('正在朗读，关闭教程可停止');
    }

    function reportStrategyConcern(strategyId) {
      localStorage.setItem(`xingban_strategy_concern_${strategyId}`, new Date().toISOString());
      showToast('已记录不适反应，请停止使用并咨询专业人员');
    }

    // 全局筛选状态
    let recordsFilter = { search: '', childId: null };
    let strategiesFilter = { search: '', category: '全部' };
    let strategiesDisplayLimit = 6;
    let communityFilter = { search: '', category: '全部' };
    let mockCommunityReports = [];
    let sessionDataMode = 'demo';
    let professionalActions = [];
    let reportShareRecords = [];
    let strategyFeedbackHistory = [];
    let currentInterventionContext = null;

    function renderRecords(container) {
      document.getElementById('page-title').textContent = '行为记录';
      document.getElementById('page-subtitle').textContent = '记录孩子的每一天';

      const filteredRecords = getFilteredRecords();

      container.innerHTML = `
        <div class="p-4 space-y-4 animate-fade-in">
          <!-- 搜索栏 -->
          <div class="flex gap-2">
            <div class="flex-1 relative">
              <svg class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="11" cy="11" r="8"/>
                <line x1="21" y1="21" x2="16.65" y2="16.65"/>
              </svg>
              <input type="text" id="records-search" placeholder="搜索记录..." value="${escapeText(recordsFilter.search)}"
                data-ui-input="records"
                class="w-full pl-10 pr-4 py-2.5 rounded-xl border border-border bg-white text-sm focus:outline-none focus:ring-2 focus:ring-primary">
            </div>
            <button data-ui-call="showNewRecord" class="px-4 py-2.5 bg-primary text-white rounded-xl font-medium flex items-center gap-2">
              <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="12" y1="5" x2="12" y2="19"/>
                <line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
              <span class="text-sm">新增</span>
            </button>
          </div>

          <!-- 儿童筛选 -->
          <div class="flex gap-2 overflow-x-auto scrollbar-hide">
            <button data-ui-call="filterRecordsByChild" data-ui-args='[null]' class="px-4 py-2 rounded-lg ${recordsFilter.childId === null ? 'bg-primary text-white' : 'bg-white border border-border text-text-secondary'} text-sm whitespace-nowrap">全部</button>
            ${MOCK_DATA.children.map(c => `
              <button data-ui-call="filterRecordsByChild" data-ui-args="[${Number(c.id)}]" class="px-4 py-2 rounded-lg ${recordsFilter.childId === c.id ? 'bg-primary text-white' : 'bg-white border border-border text-text-secondary'} text-sm whitespace-nowrap">${c.name}</button>
            `).join('')}
          </div>

          <!-- 记录列表 -->
          <div class="space-y-3">
            ${filteredRecords.length > 0 ? filteredRecords.map(b => `
              <div data-ui-call="showRecordDetail" data-ui-args="[${Number(b.id)}]" class="bg-white p-4 rounded-xl card-shadow flex items-start gap-3 cursor-pointer">
                <div class="emoji-avatar bg-primary-light/30">${getAvatar(b.childName)}</div>
                <div class="flex-1">
                  <div class="flex items-center justify-between mb-1">
                    <div class="flex items-center gap-2">
                      <span class="text-sm font-medium text-text-primary">${escapeText(b.childName)}</span>
                      <span class="text-xs px-2 py-0.5 bg-primary-light/50 text-primary rounded-full">${escapeText(b.type)}</span>
                    </div>
                    <span class="text-xs text-text-muted">${escapeText(b.time)}</span>
                  </div>
                  <p class="text-sm text-text-secondary line-clamp-2">${escapeText(b.description)}</p>
                  <div class="flex items-center gap-3 mt-2">
                    <span class="text-xs px-2 py-0.5 bg-secondary/50 text-text-secondary rounded-full">${escapeText(b.category)}</span>
                    <span class="text-xs px-2 py-0.5 ${getEmotionColor(b.emotion)} rounded-full">${escapeText(b.emotion)}</span>
                    <span class="text-xs text-text-muted">强度: ${b.intensity}/10</span>
                  </div>
                </div>
              </div>
            `).join('') : `
              <div class="text-center py-12">
                <div class="w-16 h-16 bg-secondary/30 rounded-full flex items-center justify-center mx-auto mb-3">
                  <svg class="w-8 h-8 text-text-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                  </svg>
                </div>
                <p class="text-text-muted">${recordsFilter.search || recordsFilter.childId ? '没有匹配的记录' : '还没有记录'}</p>
                ${!recordsFilter.search && !recordsFilter.childId ? '<button data-ui-call="showNewRecord" class="mt-3 text-primary text-sm">添加第一条记录</button>' : ''}
              </div>
            `}
          </div>
        </div>
      `;
    }

    function getFilteredRecords() {
      let records = [...MOCK_DATA.behaviors];
      if (recordsFilter.childId) {
        const child = MOCK_DATA.children.find(c => c.id === recordsFilter.childId);
        if (child) records = records.filter(b => b.childName === child.name);
      }
      if (recordsFilter.search) {
        const q = recordsFilter.search.toLowerCase();
        records = records.filter(b =>
          b.description.toLowerCase().includes(q) ||
          b.category.toLowerCase().includes(q) ||
          b.type.toLowerCase().includes(q) ||
          b.childName.toLowerCase().includes(q)
        );
      }
      return records;
    }

    function onRecordsSearch(value) {
      recordsFilter.search = value;
      renderRecords(document.getElementById('main-content'));
    }

    function filterRecordsByChild(childId) {
      recordsFilter.childId = childId;
      renderRecords(document.getElementById('main-content'));
    }

    function getEmotionColor(emotion) {
      switch(emotion) {
        case '积极': return 'bg-success/20 text-success';
        case '平静': return 'bg-primary/20 text-primary';
        case '消极': return 'bg-danger/20 text-danger';
        case '极度消极': return 'bg-danger/40 text-danger';
        default: return 'bg-gray-200 text-gray-600';
      }
    }

    function newClientRequestId(){if(globalThis.crypto?.randomUUID)return globalThis.crypto.randomUUID();const bytes=new Uint8Array(16);globalThis.crypto.getRandomValues(bytes);bytes[6]=(bytes[6]&15)|64;bytes[8]=(bytes[8]&63)|128;const hex=[...bytes].map(value=>value.toString(16).padStart(2,'0')).join('');return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`}
    function showNewRecord(childId = null) {
      const modal = document.createElement('div');
      modal.className = 'fixed inset-0 bg-black/50 flex items-end justify-center z-50';
      modal.innerHTML = `
        <div class="bg-white w-full max-w-md rounded-t-3xl p-6 modal-slide safe-area-bottom max-h-[92vh] overflow-y-auto">
          <div class="flex justify-between items-center mb-4">
            <h2 class="text-lg font-bold">记录行为</h2>
            <button data-ui-action="remove-overlay" class="text-text-muted">✕</button>
          </div>
          <div class="space-y-4">
            <div>
              <label class="block text-sm text-text-secondary mb-1">选择儿童</label>
              <select id="record-child" class="w-full px-4 py-2.5 rounded-xl border border-border bg-white">
                ${MOCK_DATA.children.map(c => `<option value="${c.id}">${c.name}</option>`).join('')}
              </select>
            </div>
            <div>
              <label class="block text-sm text-text-secondary mb-1">输入方式</label>
              <div class="flex gap-2" id="record-type-btn-group">
                <button data-ui-call="setRecordType" data-ui-args='["text"]' data-ui-pass-this="true" class="flex-1 py-2 rounded-lg bg-primary text-white text-sm">文字</button>
                <button data-ui-call="setRecordType" data-ui-args='["voice"]' data-ui-pass-this="true" class="flex-1 py-2 rounded-lg border border-border text-text-secondary text-sm">语音</button>
                <button data-ui-call="setRecordType" data-ui-args='["photo"]' data-ui-pass-this="true" class="flex-1 py-2 rounded-lg border border-border text-text-secondary text-sm">拍照</button>
              </div>
              <input type="hidden" id="record-type" value="text">
              <input type="hidden" id="record-request-id" value="${newClientRequestId()}">
            </div>
            <div>
              <label class="block text-sm text-text-secondary mb-1">行为描述</label>
              <div style="display:">
                <textarea id="record-content" placeholder="请写可观察事实：之前发生了什么、孩子做了什么、之后发生了什么" maxlength="1000" class="w-full px-4 py-3 rounded-xl border border-border bg-white text-sm focus:outline-none focus:ring-2 focus:ring-primary" rows="3"></textarea>
              </div>
              <div id="voice-input-area" style="display:none" class="bg-background rounded-xl p-6 text-center">
                <button id="voice-record-btn" data-ui-call="toggleVoiceRecording" class="w-16 h-16 rounded-full bg-primary text-white mx-auto flex items-center justify-center shadow-lg hover:bg-primary-dark transition-colors">
                  <svg class="w-8 h-8" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/>
                    <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/>
                  </svg>
                </button>
                <p id="voice-status" class="text-sm text-text-secondary mt-3">点击开始录音</p>
                <p id="voice-result" class="text-sm text-primary mt-2 hidden"></p>
              </div>
              <div id="photo-input-area" style="display:none" class="bg-background rounded-xl p-4 text-center">
                <label class="w-full py-8 border-2 border-dashed border-border rounded-xl flex flex-col items-center justify-center cursor-pointer hover:border-primary transition-colors">
                  <svg class="w-10 h-10 text-text-muted mb-2" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                    <circle cx="8.5" cy="8.5" r="1.5"/>
                    <polyline points="21 15 16 10 5 21"/>
                  </svg>
                  <span class="text-sm text-text-secondary">点击拍照或选择图片</span>
                  <input type="file" accept="image/*" capture="environment" data-ui-change="photo" class="hidden">
                </label>
                <div id="photo-preview" class="mt-3 hidden">
                  <img id="photo-preview-img" class="w-full rounded-xl max-h-40 object-cover" src="" alt="预览">
                  <p class="text-xs text-text-muted mt-1">图片只在本页预览，不会上传或自动分析；请在文字框补充可观察事实。</p>
                </div>
              </div>
            </div>
            <div class="flex gap-4">
              <div class="flex-1">
                <label class="block text-sm text-text-secondary mb-1">行为分类</label>
                <select id="record-category" data-ui-change="risk" class="w-full px-4 py-2.5 rounded-xl border border-border bg-white">
                  <option value="情绪爆发">情绪爆发</option>
                  <option value="刻板行为">刻板行为</option>
                  <option value="攻击行为">攻击行为</option>
                  <option value="自伤行为">自伤行为</option>
                  <option value="跑开/走失">跑开/走失</option>
                  <option value="感官寻求">感官寻求</option>
                  <option value="感官回避">感官回避</option>
                  <option value="沟通尝试">沟通尝试</option>
                  <option value="适应性技能">适应性技能</option>
                  <option value="社交发起">社交发起</option>
                  <option value="进食问题">进食问题</option>
                  <option value="睡眠问题">睡眠问题</option>
                  <option value="异常兴奋/活动骤增">异常兴奋/活动骤增</option>
                  <option value="绝望/谈论死亡">绝望/谈论死亡</option>
                  <option value="幻觉/妄想/意识异常">幻觉/妄想/意识异常</option>
                  <option value="其他">其他</option>
                </select>
              </div>
              <div class="flex-1">
                <label class="block text-sm text-text-secondary mb-1">情绪状态</label>
                <select id="record-emotion" class="w-full px-4 py-2.5 rounded-xl border border-border bg-white">
                  <option value="积极">积极</option>
                  <option value="平静">平静</option>
                  <option value="消极">消极</option>
                  <option value="焦虑">焦虑</option>
                  <option value="烦躁">烦躁</option>
                  <option value="异常兴奋">异常兴奋</option>
                  <option value="易激惹">易激惹</option>
                  <option value="绝望/麻木">绝望/麻木</option>
                </select>
              </div>
            </div>
            <details class="rounded-xl border border-border p-3 bg-background">
              <summary class="text-sm font-medium cursor-pointer">补充心理健康观察（可选）</summary>
              <div class="grid grid-cols-2 gap-3 mt-3">
                <label class="text-xs text-text-secondary">昨夜睡眠（小时）<input id="record-sleep" type="number" min="0" max="24" step="0.5" class="mt-1 w-full p-2 rounded-lg border"></label>
                <label class="text-xs text-text-secondary">精力/活动水平<select id="record-energy" class="mt-1 w-full p-2 rounded-lg border"><option value="">未记录</option><option>明显降低</option><option>与平时相近</option><option>明显升高</option><option>极高且难以停止</option></select></label>
                <label class="col-span-2 text-xs text-text-secondary">医疗事件<select id="record-medical-event" class="mt-1 w-full p-2 rounded-lg border"><option value="">无/未记录</option><option>按医嘱调整药物</option><option>漏服或拒绝服药</option><option>疑似药物不良反应</option><option>就诊或急诊</option></select></label>
              </div>
              <p class="text-xs text-text-muted mt-2">这里只记录观察，不提供诊断或药物增减建议。</p>
            </details>
            <div>
              <label class="block text-sm text-text-secondary mb-1">强度等级: <span id="intensity-value">中等</span></label>
              <input type="range" min="1" max="3" value="2" data-ui-input="intensity" class="w-full accent-primary">
              <input type="hidden" id="record-intensity" value="medium">
              <div class="grid grid-cols-3 gap-2 mt-2 text-xs text-text-muted"><span><strong>低：</strong>可继续日常活动</span><span><strong>中：</strong>明显中断，需成人支持</span><span><strong>高：</strong>无法保持安全或基本活动</span></div>
            </div>
            <p id="record-save-status" class="text-xs text-text-muted" role="status">尚未保存。网络失败时内容会保留在本页，可直接重试。</p>
            <button id="record-save-button" data-ui-call="saveRecord" class="w-full py-3 rounded-xl bg-primary text-white font-medium disabled:opacity-60">保存记录</button>
          </div>
        </div>
      `;
      document.body.appendChild(modal);
      if (childId) document.getElementById('record-child').value = String(childId);
    }

    function setRecordType(type, btn) {
      document.getElementById('record-type').value = type;
      document.querySelectorAll('#record-type-btn-group button').forEach(b => {
        b.className = 'flex-1 py-2 rounded-lg border border-border text-text-secondary text-sm';
      });
      btn.className = 'flex-1 py-2 rounded-lg bg-primary text-white text-sm';

      // 切换输入区域
      const textArea = document.getElementById('record-content');
      const voiceArea = document.getElementById('voice-input-area');
      const photoArea = document.getElementById('photo-input-area');

      if (textArea) textArea.parentElement.style.display = ''; // 所有输入方式都保留可核对的文字框
      if (voiceArea) voiceArea.style.display = type === 'voice' ? '' : 'none';
      if (photoArea) photoArea.style.display = type === 'photo' ? '' : 'none';
    }

    function updateIntensity(value) {
      const labels = { '1': '低', '2': '中等', '3': '高' };
      const levels = { '1': 'low', '2': 'medium', '3': 'high' };
      document.getElementById('intensity-value').textContent = labels[value];
      document.getElementById('record-intensity').value = levels[value];
      if (value === '3') showMentalHealthTriage();
    }

    function handleRiskCategory(category) {
      if (['攻击行为','自伤行为','跑开/走失','异常兴奋/活动骤增','绝望/谈论死亡','幻觉/妄想/意识异常'].includes(category)) showMentalHealthTriage();
    }

    // 语音录制
    let isRecording = false;
    let mediaRecorder = null;
    let audioChunks = [];

    function toggleVoiceRecording() {
      if (isRecording) {
        stopVoiceRecording();
      } else {
        startVoiceRecording();
      }
    }

    async function startVoiceRecording() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaRecorder = new MediaRecorder(stream);
        audioChunks = [];
        mediaRecorder.ondataavailable = (e) => audioChunks.push(e.data);
        mediaRecorder.onstop = () => {
          stream.getTracks().forEach(t => t.stop());
          processVoiceInput();
        };
        mediaRecorder.start();
        isRecording = true;

        const btn = document.getElementById('voice-record-btn');
        if (btn) {
          btn.classList.remove('bg-primary');
          btn.classList.add('bg-danger', 'animate-pulse');
        }
        const status = document.getElementById('voice-status');
        if (status) status.textContent = '录音中...点击停止';
      } catch (e) {
        isRecording = false;
        const status = document.getElementById('voice-status');
        if (status) status.textContent = '未获得麦克风权限，请改用文字输入';
        showToast('无法访问麦克风，请允许权限或改用文字记录');
      }
    }

    function stopVoiceRecording() {
      isRecording = false;
      if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        mediaRecorder.stop();
      } else {
        processVoiceInput();
      }
    }

    function processVoiceInput() {
      const btn = document.getElementById('voice-record-btn');
      if (btn) {
        btn.classList.remove('bg-danger', 'animate-pulse');
        btn.classList.add('bg-primary');
      }
      const status = document.getElementById('voice-status');
      if (status) status.textContent = '录音已结束；体验版不会上传或识别音频';

      const result = document.getElementById('voice-result');
      if (result) {
        result.classList.remove('hidden');
        result.textContent = '请在文字框中核对并补充内容；当前版本未接入语音识别服务。';
      }
      showToast('录音已结束；请改用文字记录，本版本不会伪造识别结果');
    }

    // 拍照选择
    function handlePhotoSelect(event) {
      const file = event.target.files[0];
      if (!file) return;
      if (!file.type.startsWith('image/')) { showToast('请选择图片文件'); event.target.value=''; return; }
      if (file.size > 5 * 1024 * 1024) { showToast('图片不能超过5MB'); event.target.value=''; return; }

      const reader = new FileReader();
      reader.onload = (e) => {
        const preview = document.getElementById('photo-preview');
        const img = document.getElementById('photo-preview-img');
        if (preview && img) {
          img.src = e.target.result;
          preview.classList.remove('hidden');
        }
        showToast('图片仅供本页核对，未上传或分析');
      };
      reader.readAsDataURL(file);
    }

    let recordSaveInFlight=false;
    async function saveRecord() {
      if(recordSaveInFlight)return;
      const child_id = parseInt(document.getElementById('record-child').value);
      const client_request_id = document.getElementById('record-request-id')?.value;
      const input_type = document.getElementById('record-type').value;
      const content = document.getElementById('record-content').value;
      const behavior_category = document.getElementById('record-category').value;
      const emotion_state = document.getElementById('record-emotion').value;
      const intensity_level = document.getElementById('record-intensity').value;
      const sleep_hours = document.getElementById('record-sleep')?.value || '';
      const energy_level = document.getElementById('record-energy')?.value || '';
      const medical_event = document.getElementById('record-medical-event')?.value || '';

      if (!content) {
        showToast('请填写行为描述');
        return;
      }
      if(!useMockMode&&navigator.onLine===false){showToast('当前网络已断开，记录尚未保存；内容仍在本页，联网后重试');const status=document.getElementById('record-save-status');if(status)status.textContent='未保存：当前网络已断开，联网后可直接重试。';return}

      const saveButton=document.getElementById('record-save-button');const saveStatus=document.getElementById('record-save-status');recordSaveInFlight=true;if(saveButton){saveButton.disabled=true;saveButton.textContent='正在保存…'}if(saveStatus)saveStatus.textContent='正在保存，请不要关闭页面或重复点击。';
      try {
        const result = await apiRequest('/behavior', 'POST', {
          child_id, client_request_id, input_type, content, behavior_category, emotion_state, intensity_level,
          sleep_hours, energy_level, medical_event
        });

        if (result.success) {
          showToast(result.replayed?'记录此前已保存，未重复创建':'记录已保存');
          // 添加到本地数据
          const child = MOCK_DATA.children.find(c => c.id === child_id);
          const newRecord = {
            id: result.record?.id || Date.now(),
            childId: child_id,
            childName: child ? child.name : '未知',
            type: behavior_category.includes('沟通') ? '沟通' : behavior_category.includes('社交') ? '行为' : behavior_category.includes('情绪') ? '情绪' : '行为',
            category: behavior_category,
            emotion: emotion_state,
            description: content,
            time: '刚刚',
            intensity: intensity_level === 'low' ? 3 : intensity_level === 'medium' ? 5 : 8,
            sleep_hours, energy_level, medical_event
          };
          if(!MOCK_DATA.behaviors.some(item=>Number(item.id)===Number(newRecord.id)))MOCK_DATA.behaviors.unshift(newRecord);
          if (mayUsePrototypeStorage()) persistBehaviors();

          // 数据联动：行为记录 ↔ 成长体系
          if(!result.replayed)addGrowthRecord('记录行为', 5, 'recording');

          // 数据联动：行为记录 ↔ 周报（更新当周周报的records数量）
          const currentWeek = MOCK_DATA.reports.find(r => r.childName === (child ? child.name : ''));
          if (currentWeek&&!result.replayed) {
            currentWeek.records = (currentWeek.records || 0) + 1;
          }

          closeTopModal();
          await openRecommendedStrategies(newRecord, child_id, behavior_category);
        } else {
          if(saveStatus)saveStatus.textContent='未保存：'+(result.error||'服务拒绝保存')+'。内容仍在本页，可重试。';showToast(result.error || '记录未保存，请重试');
        }
      } catch (error) {
        if(saveStatus)saveStatus.textContent='未保存：网络连接中断。内容仍在本页，联网后可重试。';showToast('网络连接中断，记录尚未保存');
      } finally {
        recordSaveInFlight=false;const button=document.getElementById('record-save-button');if(button){button.disabled=false;button.textContent='保存记录'}
      }
    }

    function getStrategiesForBehavior(category) {
      const map = {
        '情绪爆发':[11,2,8], '攻击行为':[12,11,9], '自伤行为':[13,11,8], '跑开/走失':[14,3,9],
        '感官寻求':[2,8,4], '感官回避':[2,8,3], '沟通尝试':[9,10,3], '适应性技能':[6,4,5],
        '社交发起':[7,10,4], '进食问题':[16,3,4], '睡眠问题':[17,8,3],
        '异常兴奋/活动骤增':[19,17,20], '绝望/谈论死亡':[18,13,20], '幻觉/妄想/意识异常':[20,19,13]
      };
      const ids = map[category] || [11,9,3];
      return ids.map(id => MOCK_DATA.strategies.find(item => item.id === id)).filter(Boolean);
    }

    async function openRecommendedStrategies(record, childId, category) {
      currentInterventionContext = { behaviorRecordId: record.id, childId, category, createdAt: new Date().toISOString() };
      let strategies = getStrategiesForBehavior(category).slice(0, 3);
      let consistencyCheck = null;
      try {
        const result = await apiRequest(`/strategy/recommend/${childId}?behavior_category=${encodeURIComponent(category || '')}`);
        if (result.success && Array.isArray(result.strategies) && result.strategies.length) {
          const remoteById = new Map(result.strategies.map(item => [Number(item.id), item]));
          strategies = strategies.map(local => {
            const item = remoteById.get(Number(local.id));
            return item ? { ...local, ...item, effectivenessRate: item.effectivenessRate ?? item.effectiveness_rate ?? 0, usageCount: item.usageCount ?? item.usage_count ?? 0, difficulty: item.difficulty || ({ easy: '简单', medium: '中等', advanced: '困难' }[item.difficulty_level] || local.difficulty) } : local;
          });
          consistencyCheck = result.consistency_check;
        }
      } catch (_) {}
      const modal = document.createElement('div');
      modal.className = 'fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4';
      modal.innerHTML = `<div class="bg-white w-full max-w-lg rounded-2xl p-5 animate-fade-in max-h-[90vh] overflow-y-auto"><div class="flex justify-between gap-3 mb-4"><div><div class="text-xs font-semibold text-primary">记录已保存 · 下一步</div><h3 class="text-lg font-bold mt-1">选择一个现在可尝试的策略</h3><p class="text-sm text-text-secondary mt-1">稍后反馈会自动关联刚才的记录，周报会汇总实际尝试结果。</p></div><button data-ui-action="close-and-navigate" data-nav="records" class="text-text-muted" aria-label="暂不选择">✕</button></div>${consistencyCheck ? '<div class="mb-3 rounded-xl bg-amber-50 border border-amber-200 p-3 text-sm text-amber-900">推荐与当前训练目标可能不完全一致，请结合专业人员制定的目标选择。</div>' : ''}<div class="space-y-3">${strategies.map(s => `<button data-ui-call="closeTopAndShowStrategyDetail" data-ui-args="${uiArgsAttr(Number(s.id))}" class="w-full text-left border border-border rounded-xl p-4 hover:border-primary"><div class="font-bold text-text-primary">${escapeText(s.name)}</div><div class="text-sm text-text-secondary mt-1">${escapeText(s.description || '查看分步教程与示范话术')}</div><div class="text-xs text-primary mt-2">查看步骤并尝试 →</div></button>`).join('')}</div><div id="record-kb-ref" class="mt-4"></div><button data-ui-action="close-and-navigate" data-nav="records" class="w-full mt-4 py-2.5 rounded-xl border border-border text-text-secondary">现在不适合，稍后再看</button></div>`;
      document.body.appendChild(modal);
      loadRecordKbRef(record, category);
    }

    /**
     * 按「记录分类」取知识库延伸阅读（单一实现，快速记录弹窗与成长周报共用）。
     * 两级检索：① 有关家原话就先试原话（更贴当事人）；② 不中退到分类关键词组。
     * 返回 how 说明用的是哪一级、grade 说明结果贴不贴具体表现——调用方必须如实展示这两个字段，
     * 不能把「同类通用章节」说成「关于你孩子这个行为的章节」。
     */
    async function kbRefsForCategory(category, opt = {}) {
      const scenes = RECORD_KB_SCENE[category] || [];
      const words = String(RECORD_KB_KEYWORDS[category] || '');
      const limit = opt.limit || 3;
      const kw = words.split(/\s+/).filter(Boolean);
      if (!scenes.length || !kw.length) return { list: [], how: 'none', grade: 'none', scenes, words };
      let list = [];
      let how = '';
      if (opt.text) {
        list = await fetchKbForStrategy(opt.text, scenes, limit);
        if (list.length) how = 'record';
      }
      if (!list.length) {
        list = await fetchKbForStrategy(words, scenes, limit);
        if (list.length) how = 'keywords';
      }
      if (!list.length) how = 'none';
      const direct = list.filter(r => kw.some(k => String(r.text || '').includes(k)));
      return { list, how, grade: direct.length ? 'direct' : (list.length ? 'general' : 'none'), scenes, words };
    }

    /** 知识库章节列表的统一样式（出处、原书章节名、扫描质量都在这里处理一次） */
    function kbRefListHtml(list) {
      return `<div class="space-y-2">${list.map(r => `<button data-ui-call="openKnowledgeSource" data-ui-args='["${encodeURIComponent(r.id)}"]' class="w-full text-left p-3 rounded-xl bg-background border border-border hover:border-primary">
        <div class="text-sm font-medium text-text-primary flex items-center gap-2 flex-wrap">${escapeText(r.heading)}<span class="text-[10px] px-1.5 py-0.5 rounded bg-white border border-border text-text-muted">原书章节名</span>${r.scanQuality === 'weak' ? '<span class="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-800" title="该来源扫描质量欠佳，引用时请对照原书">扫描质量欠佳</span>' : ''}</div>
        <div class="text-xs text-text-muted mt-1">《${escapeText(r.source)}》</div>
        <div class="text-xs text-text-secondary mt-1 leading-5">${escapeText(String(r.text || '').slice(0, 80))}…</div>
      </button>`).join('')}</div>`;
    }

    /** 安全类内容的固定提示（快速记录、成长周报共用同一段文案） */
    function kbSafetyNoticeHtml() {
      return '<div class="mb-2 p-3 rounded-xl bg-red-50 border border-red-200 text-[12px] leading-6 text-red-900"><strong>先看这里：</strong>这一类情况不能靠读书解决。请先确保孩子当下安全，并尽快联系专业人员；若有自伤/自杀风险、意识异常或药物问题，可拨 <strong>12356</strong>（全国统一心理援助热线）、<strong>12355</strong>（青少年服务台），或直接就医。</div>';
    }

    /**
     * 记录保存后，用**家长自己写的那句话**去知识库找相关章节。
     * 用原文而不是分类名，理由和干预策略页一样：分类名是星伴的行话，书上不这么写。
     * 但实测原话常常整句命中不了（噪声太大），所以退到分类关键词组，并写明是哪一级。
     * 两级都没有就如实说没有，**不做无场景兜底**（那会把「自伤」配成「人际关系」）。
     */
    async function loadRecordKbRef(record, category) {
      const box = document.getElementById('record-kb-ref');
      if (!box) return;
      const scenes = RECORD_KB_SCENE[category] || [];
      const highRisk = RECORD_HIGH_RISK.includes(category);
      const head = '<div class="text-sm font-bold text-text-primary mb-2">教材里的相关章节</div>';
      const safety = highRisk ? kbSafetyNoticeHtml() : '';
      const raw = String(record.description || '').slice(0, 40);
      if (!raw && !RECORD_KB_KEYWORDS[category]) { box.innerHTML = ''; return; }

      box.innerHTML = head + safety + '<p class="text-xs text-text-muted">正在按你的记录找相关章节…</p>';
      let res = { list: [], how: 'none', grade: 'none' };
      try { res = await kbRefsForCategory(category, { text: raw, limit: 3 }); } catch (e) { res = { list: [], how: 'none', grade: 'none' }; }
      const bridgeScenes = await getKbBridgeScenes().catch(() => []);
      const thinHint = scenes.some(s => bridgeScenes.includes(s))
        ? '<p class="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-2 mt-2">这一类在教材里内容很少（星伴已单独做过「场景迁移卡」，可在知识问答页提到这个情况时看到）。</p>'
        : '';

      if (!res.list.length) {
        box.innerHTML = head + safety + thinHint
          + '<p class="text-xs text-text-muted">教材里暂时没有和这条记录贴近的章节。可以到「知识问答」页把情况写详细些，我按原文再查一次。</p>';
        return;
      }
      const howText = res.how === 'record'
        ? '按你刚才写的这句话检索得到'
        : '这句话整句在书上找不到对应，按<b>这类情况的关键词</b>检索得到（不是按你写的那句话）';
      const gradeText = res.grade === 'direct'
        ? '该类问题里讲到这些具体表现的章节'
        : '同一类问题的通用章节（教材里没有专门讲这些具体表现的章节）';
      box.innerHTML = head + safety + thinHint
        + `<p class="text-xs text-text-muted mb-2">${howText}。它们<strong>不是这条记录的出处，也不是你该照着做的步骤</strong>，只作延伸阅读，点开可核对原书。</p>`
        + `<p class="text-[11px] text-text-muted mb-2">下面这些属于：${gradeText}。</p>`
        + kbRefListHtml(res.list);
    }
    function showRecordDetail(id) {
      const record = MOCK_DATA.behaviors.find(b => b.id === id);
      if (!record) return;

      const modal = document.createElement('div');
      modal.id = 'record-detail-modal';
      modal.className = 'fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4';
      modal.innerHTML = `
        <div class="bg-white w-full max-w-sm rounded-2xl p-6 animate-fade-in">
          <div class="flex justify-between items-start mb-4">
            <h3 class="text-lg font-bold">记录详情</h3>
            <button data-ui-action="remove-overlay" class="text-text-muted">✕</button>
          </div>
          <div class="space-y-4">
            <div class="flex items-center gap-3">
              <div class="emoji-avatar bg-primary-light/30">${getAvatar(record.childName)}</div>
              <div>
                <div class="font-medium">${escapeText(record.childName)}</div>
                <div class="text-xs text-text-muted">${escapeText(record.time)}</div>
              </div>
            </div>
            <div>
              <div class="text-sm text-text-muted mb-1">行为描述</div>
              <p class="text-text-primary">${escapeText(record.description)}</p>
            </div>
            <div class="flex gap-3">
              <span class="px-3 py-1 bg-primary-light/50 text-primary rounded-full text-sm">${escapeText(record.type)}</span>
              <span class="px-3 py-1 bg-secondary/50 text-text-secondary rounded-full text-sm">${escapeText(record.category)}</span>
              <span class="px-3 py-1 ${getEmotionColor(record.emotion)} rounded-full text-sm">${escapeText(record.emotion)}</span>
            </div>
            <div>
              <div class="text-sm text-text-muted mb-2">强度等级</div>
              <div class="progress-bar">
                <div class="progress-fill" style="width: ${record.intensity * 10}%"></div>
              </div>
            </div>
            <div class="flex gap-2">
              <button data-ui-call="editRecord" data-ui-args="[${Number(record.id)}]" class="flex-1 py-2.5 rounded-xl bg-primary/10 text-primary font-medium">编辑</button>
              <button data-ui-call="deleteRecord" data-ui-args="[${Number(record.id)}]" class="flex-1 py-2.5 rounded-xl bg-danger/10 text-danger font-medium">删除</button>
            </div>
          </div>
        </div>
      `;
      document.body.appendChild(modal);
    }

    function editRecord(id) {
      const record = MOCK_DATA.behaviors.find(b => b.id === id);
      if (!record) return;

      // 关闭详情弹窗
      document.getElementById('record-detail-modal')?.remove();

      const modal = document.createElement('div');
      modal.className = 'fixed inset-0 bg-black/50 flex items-end justify-center z-50';
      modal.innerHTML = `
        <div class="bg-white w-full max-w-md rounded-t-3xl p-6 modal-slide safe-area-bottom">
          <div class="flex justify-between items-center mb-4">
            <h2 class="text-lg font-bold">编辑记录</h2>
            <button data-ui-action="remove-overlay" class="text-text-muted">✕</button>
          </div>
          <div class="space-y-4">
            <div>
              <label class="block text-sm text-text-secondary mb-1">行为描述</label>
              <textarea id="edit-record-content" class="w-full px-4 py-3 rounded-xl border border-border bg-white text-sm focus:outline-none focus:ring-2 focus:ring-primary" rows="3">${escapeText(record.description)}</textarea>
            </div>
            <div class="flex gap-4">
              <div class="flex-1">
                <label class="block text-sm text-text-secondary mb-1">行为分类</label>
                <select id="edit-record-category" class="w-full px-4 py-2.5 rounded-xl border border-border bg-white">
                  ${['情绪爆发','刻板行为','攻击行为','自伤行为','跑开/走失','感官寻求','感官回避','沟通尝试','适应性技能','社交发起','进食问题','睡眠问题','其他'].map(c =>
                    `<option value="${c}" ${c === record.category ? 'selected' : ''}>${c}</option>`
                  ).join('')}
                </select>
              </div>
              <div class="flex-1">
                <label class="block text-sm text-text-secondary mb-1">情绪状态</label>
                <select id="edit-record-emotion" class="w-full px-4 py-2.5 rounded-xl border border-border bg-white">
                  ${['积极','平静','消极','焦虑','烦躁'].map(e =>
                    `<option value="${e}" ${e === record.emotion ? 'selected' : ''}>${e}</option>`
                  ).join('')}
                </select>
              </div>
            </div>
            <div>
              <label class="block text-sm text-text-secondary mb-1">强度等级: <span id="edit-intensity-value">${record.intensity <= 3 ? '低' : record.intensity <= 6 ? '中等' : '高'}</span></label>
              <input type="range" min="1" max="10" value="${record.intensity}" data-ui-input="editIntensity" class="w-full accent-primary">
            </div>
            <button data-ui-call="saveEditRecord" data-ui-args="[${Number(id)}]" class="w-full py-3 rounded-xl bg-primary text-white font-medium">保存修改</button>
          </div>
        </div>
      `;
      document.body.appendChild(modal);
    }

    async function saveEditRecord(id) {
      const content = document.getElementById('edit-record-content').value;
      const category = document.getElementById('edit-record-category').value;
      const emotion = document.getElementById('edit-record-emotion').value;

      if (!content) {
        showToast('请填写行为描述');
        return;
      }

      // 更新本地数据
      const record = MOCK_DATA.behaviors.find(b => b.id === id);
      if (record) {
        record.description = content;
        record.category = category;
        record.emotion = emotion;
      }
      persistBehaviors();

      try {
        await apiRequest(`/behavior/${id}`, 'PUT', { content, category, emotion });
        showToast('记录已更新');
        closeTopModal();
        navigateTo('records');
      } catch (error) {
        showToast('网络错误');
      }
    }

    function deleteRecord(id) {
      const modal = document.createElement('div');
      modal.className = 'fixed inset-0 bg-black/60 flex items-center justify-center z-[60] p-4';
      modal.innerHTML = `
        <div class="bg-white w-full max-w-xs rounded-2xl p-6 animate-fade-in text-center">
          <div class="w-12 h-12 bg-danger/10 rounded-full flex items-center justify-center mx-auto mb-3">
            <svg class="w-6 h-6 text-danger" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
              <line x1="12" y1="9" x2="12" y2="13"/>
              <line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
          </div>
          <h3 class="text-lg font-bold text-text-primary mb-2">确认删除</h3>
          <p class="text-sm text-text-secondary mb-4">删除后无法恢复，确定要删除这条记录吗？</p>
          <div class="flex gap-3">
            <button data-ui-action="remove-overlay" class="flex-1 py-2.5 rounded-xl border border-border text-text-secondary">取消</button>
            <button data-ui-call="confirmDeleteRecord" data-ui-args="[${Number(id)}]" class="flex-1 py-2.5 rounded-xl bg-danger text-white">删除</button>
          </div>
        </div>
      `;
      document.body.appendChild(modal);
    }

    async function confirmDeleteRecord(id) {
      // 从本地数据中移除
      const index = MOCK_DATA.behaviors.findIndex(b => b.id === id);
      if (index > -1) MOCK_DATA.behaviors.splice(index, 1);
      persistBehaviors();

      try {
        await apiRequest(`/behavior/${id}`, 'DELETE');
        showToast('记录已删除');
        // 关闭所有弹窗
        document.querySelectorAll('.fixed[role="dialog"], .fixed[data-modal="true"]').forEach(el => el.remove());
        navigateTo('records');
      } catch (error) {
        showToast('网络错误');
      }
    }

    function showMentalHealthTriage() {
      const modal = document.createElement('div');
      modal.className = 'fixed inset-0 bg-black/70 flex items-center justify-center z-[70] p-3';
      modal.innerHTML = `<div class="bg-white w-full max-w-lg rounded-2xl p-5 max-h-[92vh] overflow-y-auto">
        <div class="flex justify-between gap-3"><div><span class="text-xs font-bold text-danger">先判断是否需要立即求助</span><h2 class="text-xl font-bold mt-1">孩子现在有以下情况吗？</h2></div><button aria-label="关闭" data-ui-action="close-top-modal">✕</button></div>
        <p class="text-sm text-text-secondary mt-2">本工具不做诊断。如果拿不准，请按“有或不确定”处理。</p>
        <div class="mt-4 space-y-2 text-sm">${['正在自伤、伤害他人，或说不想活了','提到具体自杀计划、工具或地点','服药过量、严重不良反应或意识异常','出现幻觉、妄想、严重混乱或无法沟通','连续极少睡眠且异常兴奋、冲动或冒险','离家失联或正处于道路、高处、水边等危险地点'].map(t=>`<label class="flex gap-3 p-3 rounded-xl border border-border"><input type="checkbox" class="crisis-risk mt-1 accent-danger"><span>${t}</span></label>`).join('')}</div>
        <div class="mt-5 grid gap-2"><button data-ui-call="showImmediateDangerHelp" class="w-full py-3 rounded-xl bg-danger text-white font-bold">有或不确定：立即求助</button><button data-ui-call="closeTopAndStartEmergency" data-ui-args='["red"]' class="w-full py-3 rounded-xl border border-border text-text-primary">确认没有即时危险，继续安抚支持</button></div>
      </div>`;
      document.body.appendChild(modal);
    }

    function showImmediateDangerHelp() {
      closeTopModal();
      const modal = document.createElement('div');
      modal.className = 'fixed inset-0 bg-red-950/90 flex items-center justify-center z-[80] p-3';
      modal.innerHTML = `<div class="bg-white w-full max-w-lg rounded-2xl p-6">
        <div class="text-danger text-xs font-bold">即时安全优先</div><h2 class="text-2xl font-bold mt-1">现在请立即联系专业急救</h2>
        <ol class="mt-4 space-y-3 text-sm leading-6 list-decimal pl-5"><li>不要让孩子独处，保持安全距离和冷静语气。</li><li>在不引发冲突的前提下，移开可安全移除的药物、刀具、绳索等危险物。</li><li>拨打 120；存在暴力、失联或公共危险时同时拨打 110。</li><li>联系既往就诊医院或主治精神科医生，并准确说明自伤/伤人、用药、睡眠和异常行为。</li></ol>
        <p class="mt-4 p-3 rounded-xl bg-amber-50 text-amber-900 text-sm">不要仅依赖本应用、社区回复或呼吸练习处理即时危险。</p>
        <div class="grid grid-cols-2 gap-2 mt-5"><button data-ui-call="callEmergencyContact" data-ui-args='["120","急救"]' class="py-3 rounded-xl bg-danger text-white font-bold">拨打 120</button><button data-ui-call="callEmergencyContact" data-ui-args='["110","报警"]' class="py-3 rounded-xl bg-red-800 text-white font-bold">拨打 110</button></div>
        <button data-ui-action="close-top-modal" class="w-full mt-2 py-3 rounded-xl border border-border">关闭</button>
      </div>`;
      document.body.appendChild(modal);
    }

    async function showSafetyPlan() {
      const saved = (await loadSensitiveRecord('safety_plan','xingban_safety_plan',{})).data;
      const modal = document.createElement('div'); modal.className='fixed inset-0 bg-black/60 flex items-end sm:items-center justify-center z-[70]';
      modal.innerHTML=`<div class="bg-white w-full max-w-lg rounded-t-3xl sm:rounded-2xl p-5 max-h-[92vh] overflow-y-auto"><div class="flex justify-between"><div><h2 class="text-xl font-bold">家庭安全计划</h2><p class="text-xs text-text-muted mt-1">建议与儿童精神科专业人员共同确认</p></div><button data-ui-action="close-top-modal">✕</button></div>
      <div class="space-y-3 mt-4">${[['warning','孩子的预警信号','如：连续两晚睡眠少于4小时、谈论死亡'],['calming','确认有效的支持方式','孩子接受的陪伴方式；明确禁用方式'],['hospital','首选医院/科室','医院名称、儿童精神科急诊位置'],['clinician','主治专业人员','姓名、机构、联系电话'],['medication','当前药物与重要提醒','仅记录医嘱；不要在此自行调整剂量'],['school','共同监护人/学校联系人','姓名、关系、电话'],['escalation','何时必须升级求助','自伤、自杀计划、伤人、失联、意识异常等']].map(([id,label,ph])=>`<label class="block text-sm font-medium">${escapeText(label)}<textarea id="safety-${id}" rows="2" placeholder="${escapeText(ph)}" class="mt-1 w-full p-3 rounded-xl border border-border text-sm">${escapeText(saved[id]||'')}</textarea></label>`).join('')}</div>
      <p class="text-xs text-danger mt-3">体验版保存在当前设备浏览器中，请勿录入身份证号、完整病历或其他不必要的敏感信息。</p><button data-ui-call="saveSafetyPlan" class="w-full mt-4 py-3 rounded-xl bg-primary text-white font-bold">保存安全计划</button></div>`; document.body.appendChild(modal);
    }

    async function saveSafetyPlan(){const ids=['warning','calming','hospital','clinician','medication','school','escalation'];const data={};ids.forEach(id=>data[id]=document.getElementById('safety-'+id).value.trim());try{const saved=await persistSensitiveRecord('safety_plan',data,'xingban_safety_plan');showToast(saved.server?'安全计划已加密保存':'服务不可用，体验数据暂存当前设备');closeTopModal();}catch(_){showToast('安全存储不可用，未保存敏感数据');}}

    function renderEmergency(container) {
      document.getElementById('page-title').textContent = '紧急模式';
      document.getElementById('page-subtitle').textContent = '安全判断与即时求助';

      const emergencyContacts = MOCK_DATA.emergencyContacts || [];

      container.innerHTML = `
        <div class="min-h-screen bg-gradient-to-b from-[#fff8f6] via-[#fffdfb] to-[#f4f7f6] p-5 sm:p-6 flex flex-col animate-fade-in">
          <div class="flex-1 flex flex-col justify-center max-w-md mx-auto w-full">
            <div class="w-16 h-16 rounded-2xl bg-red-50 border border-red-100 flex items-center justify-center mx-auto mb-5 shadow-sm"><svg class="w-9 h-9 text-emergency" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
              <line x1="12" y1="9" x2="12" y2="13"/>
              <line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg></div>
            <h1 class="text-2xl font-bold text-[#17212b] text-center mb-2">当前情况属于？</h1>
            <p class="text-[#52606d] text-center mb-5 font-medium">先判断即时危险，再获取针对性帮助</p>
            <button data-ui-call="showSafetyPlan" class="mb-4 w-full py-3.5 rounded-xl bg-white border-2 border-primary/30 text-primary-dark text-sm font-bold shadow-sm hover:bg-primary-light/20">查看 / 编辑家庭安全计划</button>

            <div class="space-y-4">
              <button data-ui-call="startEmergency" data-ui-args='["green"]' class="w-full bg-white border-2 border-green-500 rounded-2xl p-5 text-left text-[#17212b] shadow-sm hover:bg-green-50 transition-colors active:scale-[0.98]">
                <div class="flex items-center gap-4">
                  <div class="w-10 h-10 rounded-full bg-green-500 flex items-center justify-center">
                    <svg class="w-6 h-6 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                      <polyline points="22 4 12 14.01 9 11.01"/>
                    </svg>
                  </div>
                  <div>
                    <div class="font-medium">一般行为问题</div>
                    <div class="text-sm text-[#52606d] mt-1">哭闹、拒绝配合、发脾气</div>
                  </div>
                </div>
              </button>

              <button data-ui-call="startEmergency" data-ui-args='["yellow"]' class="w-full bg-white border-2 border-amber-500 rounded-2xl p-5 text-left text-[#17212b] shadow-sm hover:bg-amber-50 transition-colors active:scale-[0.98]">
                <div class="flex items-center gap-4">
                  <div class="w-10 h-10 rounded-full bg-yellow-500 flex items-center justify-center">
                    <svg class="w-6 h-6 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
                    </svg>
                  </div>
                  <div>
                    <div class="font-medium">中度情绪爆发</div>
                    <div class="text-sm text-[#52606d] mt-1">尖叫、扔东西、推人</div>
                  </div>
                </div>
              </button>

              <button data-ui-call="showMentalHealthTriage" class="w-full bg-white border-2 border-red-500 rounded-2xl p-5 text-left text-[#17212b] shadow-sm hover:bg-red-50 transition-colors active:scale-[0.98]">
                <div class="flex items-center gap-4">
                  <div class="w-10 h-10 rounded-full bg-red-500 flex items-center justify-center">
                    <svg class="w-6 h-6 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="M18.36 6.64a9 9 0 1 1-12.73 0"/>
                      <line x1="12" y1="2" x2="12" y2="12"/>
                    </svg>
                  </div>
                  <div>
                    <div class="font-medium">存在伤害或精神科危机风险</div>
                    <div class="text-sm text-[#52606d] mt-1 leading-5">自伤、自杀言语、伤人、异常兴奋或意识异常</div>
                  </div>
                </div>
              </button>
            </div>

            <!-- 紧急联系人 -->
            <div class="mt-6 pt-6 border-t border-[#dfe5e2]">
              <div class="flex items-center justify-between mb-3">
                <h3 class="text-[#25313c] text-sm font-bold">紧急联系人</h3>
                <button data-ui-call="showEmergencyContactManager" class="text-primary-dark text-sm font-medium hover:underline">管理 →</button>
              </div>
              <div class="grid grid-cols-2 gap-3">
                ${emergencyContacts.map(c => `
                  <button data-ui-call="callEmergencyContact" data-ui-args="${uiArgsAttr(c.fullPhone,c.name)}" class="flex-1 bg-white border border-[#dfe5e2] rounded-xl p-3 text-center shadow-sm hover:border-primary/50 transition-colors active:scale-[0.96]">
                    <div class="text-lg mb-1">📞</div>
                    <div class="text-[#25313c] text-xs font-bold">${escapeText(c.name)}</div>
                    <div class="text-[#66727d] text-xs mt-0.5">${escapeText(c.phone)}</div>
                  </button>
                `).join('')}
                <button data-ui-call="callEmergencyContact" data-ui-args='["110","报警"]' class="flex-1 bg-red-50 border-2 border-red-300 rounded-xl p-3 text-center hover:bg-red-100 transition-colors active:scale-[0.96]">
                  <div class="text-lg mb-1">🚨</div>
                  <div class="text-red-800 text-sm font-bold">110</div>
                  <div class="text-red-700 text-xs">报警</div>
                </button>
                <button data-ui-call="callEmergencyContact" data-ui-args='["120","急救"]' class="flex-1 bg-red-50 border-2 border-red-300 rounded-xl p-3 text-center hover:bg-red-100 transition-colors active:scale-[0.96]">
                  <div class="text-lg mb-1">🚑</div>
                  <div class="text-red-800 text-sm font-bold">120</div>
                  <div class="text-red-700 text-xs">急救</div>
                </button>
              </div>
            </div>

            <p class="text-[#52606d] text-center text-sm font-medium mt-6">存在即时危险，请直接拨打 <strong class="text-red-700">110 或 120</strong></p>
          </div>
        </div>
      `;
    }

    function normalizedPhone(value) { const phone=String(value||'').replace(/[\s()-]/g,''); return /^\+?\d{3,20}$/.test(phone)?phone:''; }
    function callEmergencyContact(phone, name) {
      const safePhone=normalizedPhone(phone);
      if(!safePhone){showToast('电话号码无效，请在联系人管理中核对');return}
      const anchor=document.createElement('a');anchor.href=`tel:${safePhone}`;anchor.setAttribute('aria-label',`拨打${String(name||'电话')}`);anchor.style.display='none';document.body.appendChild(anchor);anchor.click();anchor.remove();
    }

    async function showEmergencyContactManager() {
      const loaded=await loadSensitiveRecord('emergency_contacts','xingban_emergency_contacts',{contacts:[]});
      const contacts=Array.isArray(loaded.data?.contacts)?loaded.data.contacts.filter(item=>item&&normalizedPhone(item.fullPhone)&&String(item.name||'').trim()).slice(0,10):[];
      MOCK_DATA.emergencyContacts=contacts.map((item,index)=>({id:Number(item.id)||index+1,name:String(item.name).slice(0,30),fullPhone:normalizedPhone(item.fullPhone),phone:normalizedPhone(item.fullPhone).replace(/^(\+?\d{3})\d+(\d{4})$/,'$1****$2')}));

      const modal = document.createElement('div');
      modal.className = 'fixed inset-0 bg-black/50 flex items-end justify-center z-50';
      modal.innerHTML = `
        <div class="bg-white w-full max-w-md rounded-t-3xl p-6 modal-slide safe-area-bottom max-h-[80vh] overflow-y-auto">
          <div class="flex justify-between items-center mb-4">
            <h2 class="text-lg font-bold">紧急联系人管理</h2>
            <button data-ui-action="remove-overlay" class="text-text-muted">✕</button>
          </div>
          <div id="emergency-contacts-list" class="space-y-3">
            ${MOCK_DATA.emergencyContacts.map(c => `
              <div class="flex items-center gap-3 p-3 bg-secondary/30 rounded-xl">
                <div class="flex-1">
                  <div class="font-medium text-text-primary">${escapeText(c.name)}</div>
                  <div class="text-sm text-text-muted">${escapeText(c.phone)}</div>
                </div>
                <button data-ui-call="callEmergencyContact" data-ui-args="${uiArgsAttr(c.fullPhone,c.name)}" class="px-3 py-1.5 bg-success/10 text-success rounded-lg text-sm">拨打</button>
                <button data-ui-call="removeEmergencyContact" data-ui-args="[${Number(c.id)}]" class="px-3 py-1.5 bg-danger/10 text-danger rounded-lg text-sm">删除</button>
              </div>
            `).join('')}
            ${MOCK_DATA.emergencyContacts.length?'':'<div class="p-4 text-center text-sm text-text-muted bg-background rounded-xl">尚未添加家庭联系人。110和120始终可在紧急支持首页使用。</div>'}
          </div>
          <div class="mt-4 pt-4 border-t border-border">
            <h4 class="text-sm font-medium text-text-primary mb-3">添加联系人</h4>
            <div class="flex gap-2">
              <input id="new-contact-name" type="text" placeholder="称呼" class="flex-1 px-3 py-2 rounded-xl border border-border text-sm">
              <input id="new-contact-phone" type="tel" placeholder="电话号码" class="flex-1 px-3 py-2 rounded-xl border border-border text-sm">
            </div>
            <button data-ui-call="addEmergencyContact" class="w-full mt-3 py-2.5 rounded-xl bg-primary text-white font-medium text-sm">添加联系人</button>
          </div>
        </div>
      `;
      document.body.appendChild(modal);
    }

    async function addEmergencyContact() {
      const name = document.getElementById('new-contact-name').value.trim().slice(0,30);
      const phone = normalizedPhone(document.getElementById('new-contact-phone').value);
      if (!name || !phone) { showToast('请填写称呼和有效电话号码'); return; }
      if ((MOCK_DATA.emergencyContacts||[]).length>=10){showToast('最多保留10个紧急联系人');return}
      if (!MOCK_DATA.emergencyContacts) MOCK_DATA.emergencyContacts=[];
      const newId = Math.max(...MOCK_DATA.emergencyContacts.map(c => c.id), 0) + 1;
      const maskedPhone = phone.length >= 4 ? phone.slice(0, 3) + '****' + phone.slice(-4) : phone;
      MOCK_DATA.emergencyContacts.push({ id: newId, name, phone: maskedPhone, fullPhone: phone });
      try{const saved=await persistSensitiveRecord('emergency_contacts',{contacts:MOCK_DATA.emergencyContacts.map(({id,name,fullPhone})=>({id,name,fullPhone}))},'xingban_emergency_contacts');showToast(saved.server?'联系人已加密保存':'体验联系人仅保留在当前标签页')}catch(error){MOCK_DATA.emergencyContacts=MOCK_DATA.emergencyContacts.filter(c=>c.id!==newId);showToast(error.message||'联系人未保存');return}
      closeTopModal();
      navigateTo('emergency');
    }

    async function removeEmergencyContact(id) {
      if (!MOCK_DATA.emergencyContacts) return;
      const previous=[...MOCK_DATA.emergencyContacts];
      MOCK_DATA.emergencyContacts = MOCK_DATA.emergencyContacts.filter(c => c.id !== id);
      try{const saved=await persistSensitiveRecord('emergency_contacts',{contacts:MOCK_DATA.emergencyContacts.map(({id,name,fullPhone})=>({id,name,fullPhone}))},'xingban_emergency_contacts');showToast(saved.server?'联系人已从加密记录删除':'体验联系人已从当前标签页删除')}catch(error){MOCK_DATA.emergencyContacts=previous;showToast(error.message||'删除未保存');return}
      closeTopModal();
      navigateTo('emergency');
    }

    async function startEmergency(level) {
      if (emergencyStartInFlight) return;
      const childId = Number(selectedChild?.id || MOCK_DATA.children?.[0]?.id);
      if (!childId) { showToast('请先建立或选择儿童档案'); return; }
      const requestId = newClientRequestId();
      activeEmergencySession = { id: null, childId, level, requestId, recorded: false };
      emergencyStartInFlight = true;
      let sessionRequest = null;
      try {
        if (navigator.onLine === false) throw new Error('当前网络已断开');
        sessionRequest = apiRequest('/emergency/start', 'POST', { child_id: childId, level, client_request_id: requestId });
      } catch (error) {
        console.error('紧急模式会话记录失败，安全引导继续可用:', error);
      }

      const container = document.getElementById('main-content');
      container.innerHTML = `
        <div class="min-h-screen bg-gradient-to-b from-[#fff8f6] via-white to-[#f4f7f6] p-6 flex flex-col animate-fade-in">
          <div class="flex-1 flex flex-col items-center justify-center max-w-md mx-auto w-full">
            <div class="px-3 py-1 rounded-full bg-primary-light/40 text-primary-dark text-sm font-bold mb-4">已确认没有即时危险</div>
            <p id="emergency-session-status" class="mb-4 text-xs text-center ${activeEmergencySession.recorded?'text-primary-dark':'text-amber-800'}" role="status">${activeEmergencySession.recorded?'本次支持已建立安全记录。':'引导可继续使用，但本次会话尚未保存；危险时不要等待网络。'}</p>
            <h2 class="text-2xl font-bold text-[#17212b] text-center mb-2">一起慢下来</h2>
            <p class="text-sm text-[#52606d] text-center mb-8">如果孩子不愿跟随，请停止练习，安静陪伴即可</p>

            <div class="relative w-48 h-48 mb-8">
              <div class="absolute inset-0 rounded-full bg-orange-100 border border-orange-200 animate-breathe"></div>
              <div class="absolute inset-4 rounded-full bg-orange-200 animate-breathe" style="animation-delay: 0.5s"></div>
              <div class="absolute inset-8 rounded-full bg-orange-400 animate-breathe" style="animation-delay: 1s"></div>
              <div class="absolute inset-0 flex items-center justify-center">
                <svg class="w-16 h-16 text-[#17212b]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                  <path d="M12 4v4m0 8v4M8 12H4m16 0h-4"/>
                </svg>
              </div>
            </div>

            <div class="text-center">
              <p id="breath-text" class="text-[#17212b] text-2xl font-bold mb-2">吸气...</p>
              <p class="text-[#52606d] text-sm font-medium">家长可以先示范，不要强迫孩子</p>
            </div>

            <button data-ui-call="showEmergencyStrategies" data-ui-args='["${level}"]' class="mt-12 w-full py-3.5 rounded-xl bg-primary text-white font-bold shadow-sm hover:bg-primary-dark transition-colors active:scale-[0.98]">
              获取应对策略
            </button>

            <div class="mt-6 flex gap-3">
              <button data-ui-call="callEmergencyContact" data-ui-args='["110","报警"]' class="flex-1 py-2.5 rounded-xl bg-red-50 border-2 border-red-300 text-red-800 text-sm font-bold hover:bg-red-100 transition-colors active:scale-[0.98]">🚨 报警 110</button>
              <button data-ui-call="callEmergencyContact" data-ui-args='["120","急救"]' class="flex-1 py-2.5 rounded-xl bg-red-50 border-2 border-red-300 text-red-800 text-sm font-bold hover:bg-red-100 transition-colors active:scale-[0.98]">🚑 急救 120</button>
            </div>

            <button data-nav="emergency" class="mt-4 text-primary-dark text-sm font-bold hover:underline">← 返回选择</button>
            <button data-ui-call="finishEmergencySession" data-ui-args='["${level}"]' class="mt-3 text-[#52606d] text-sm underline">结束本次支持并记录感受</button>
          </div>
        </div>
      `;

      const texts = ['吸气...', '保持...', '呼气...', '放松...'];
      let i = 0;
      const breathText = document.getElementById('breath-text');
      if (breathText) breathText.textContent = texts[0];

      const interval = setInterval(() => {
        i++;
        if (breathText) breathText.textContent = texts[i % 4];
        // 同步高亮当前呼吸阶段
        const circles = document.querySelectorAll('.animate-breathe');
        circles.forEach((c, idx) => {
          c.style.animationDuration = (i % 2 === 0 ? '4' : '6') + 's';
        });
        // 检查是否离开了紧急模式页面
        if (!document.getElementById('breath-text')) {
          clearInterval(interval);
        }
      }, 4000);
      if (sessionRequest) {
        try {
          const result = await sessionRequest;
          if (!result.success || !result.session?.id) throw new Error(result.error || '会话未确认保存');
          activeEmergencySession = { ...activeEmergencySession, id: Number(result.session.id), recorded: true };
          const status = document.getElementById('emergency-session-status');
          if (status) { status.className='mb-4 text-xs text-center text-primary-dark'; status.textContent=result.replayed?'本次支持会话此前已建立。':'本次支持已建立安全记录。'; }
        } catch (error) {
          console.error('紧急模式会话记录失败，安全引导继续可用:', error);
        }
      }
      emergencyStartInFlight = false;
    }

    async function showEmergencyStrategies(level) {
      const container = document.getElementById('main-content');
      container.innerHTML = `
        <div class="min-h-screen bg-gradient-to-b from-[#fff8f6] via-white to-[#f4f7f6] p-6 flex flex-col animate-fade-in">
          <div class="flex-1 max-w-md mx-auto w-full">
            <h2 class="text-2xl font-bold text-[#17212b] text-center mb-2">当前可尝试的支持</h2>
            <p class="text-sm text-[#52606d] text-center mb-6">一次只尝试一项；孩子不适或情况升级时立即停止</p>
            <div id="emergency-strategies-list" class="space-y-4">
              <div class="text-center text-[#52606d] py-8">正在准备建议...</div>
            </div>
            <button data-nav="home" class="mt-8 w-full py-3 rounded-xl bg-primary text-white font-bold hover:bg-primary-dark transition-colors active:scale-[0.98]">
              返回首页
            </button>
            <button data-nav="emergency" class="mt-3 w-full py-3 rounded-xl bg-white text-primary-dark font-bold border-2 border-primary/30 hover:bg-primary-light/20 transition-colors active:scale-[0.98]">
              返回紧急模式
            </button>
            <button data-ui-call="finishEmergencySession" data-ui-args='["${level}"]' class="mt-3 w-full py-3 text-[#52606d] font-medium">结束并记录结果</button>
          </div>
        </div>
      `;

      const fallbackStrategies = {
        green: [{name:'先降低要求',description:'暂停当前任务，用短句告诉孩子：“没关系，我们先休息一下。”'}, {name:'提供两个简单选择',description:'例如“想坐这里，还是去安静角落？”避免连续追问。'}, {name:'观察并记录触发点',description:'平静后再记录刚才的环境、要求和孩子反应。'}],
        yellow: [{name:'先保护空间',description:'移开易碎物，减少围观和声音，成人保持一臂以上距离。'}, {name:'少说话，给等待时间',description:'使用一句清楚的话，等待至少十秒，不争辩、不训斥。'}, {name:'情况升级就重新分诊',description:'若出现伤害风险、意识异常或无法判断，返回并选择红色安全核查。'}],
        red: [{name:'持续观察安全',description:'确认无即时危险后仍需成人陪伴，避免孩子独处。'}, {name:'减少刺激',description:'降低光线与声音，不强迫呼吸、不触碰不愿被触碰的孩子。'}, {name:'联系既往专业人员',description:'异常表现持续、复发或家长担心时，尽快联系既往就诊机构。'}]
      };
      const renderEmergencyStrategyList = strategies => {
        const strategiesList = document.getElementById('emergency-strategies-list');
        if (!strategiesList) return;
        strategiesList.innerHTML = strategies.map(s => `
          <div class="bg-white border border-[#dfe5e2] rounded-xl p-4 shadow-sm">
            <div class="flex items-center gap-3 mb-2"><span class="text-xl">${getStrategyIcon(s.name)}</span><h3 class="text-[#17212b] font-bold">${escapeText(s.name)}</h3></div>
            <p class="text-[#52606d] leading-6 text-sm">${escapeText(s.description)}</p>
          </div>`).join('');
      };
      renderEmergencyStrategyList(fallbackStrategies[level] || fallbackStrategies.green);

      try {
        const result = await apiRequest(`/emergency/strategies/${level || 'green'}`, 'GET');

        if (result.success && result.strategies) {
          renderEmergencyStrategyList(result.strategies);
        }
      } catch (error) {
        console.error('获取策略失败:', error);
      }
    }

    function getStrategyIcon(name) {
      if (name.includes('停')) return '🛑';
      if (name.includes('呼吸')) return '🌬️';
      if (name.includes('空间') || name.includes('陪伴')) return '🤗';
      if (name.includes('选择') || name.includes('沟通')) return '🃏';
      if (name.includes('感官')) return '👀';
      if (name.includes('行为') || name.includes('引导')) return '🎯';
      return '💡';
    }

    function finishEmergencySession(level) {
      const modal=document.createElement('div');modal.className='fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4';modal.dataset.modal='true';
      modal.innerHTML=`<div class="bg-white w-full max-w-md rounded-2xl p-5"><h2 class="text-xl font-bold">刚才很艰难，你已经做得够好了</h2><p class="text-sm text-text-secondary mt-2">只需选择现在的状态，不要求复盘。</p><div class="grid grid-cols-3 gap-2 mt-4">${[['calm','😌','已平静'],['low','😔','仍低落'],['angry','😤','仍激动']].map(([v,e,l])=>`<button data-emergency-outcome-button data-ui-call="saveEmergencyOutcome" data-ui-args="${uiArgsAttr(level,v)}" class="p-3 rounded-xl border border-border disabled:opacity-60"><span class="text-2xl block">${e}</span><span class="text-xs">${l}</span></button>`).join('')}</div><p id="emergency-outcome-status" class="mt-3 text-xs text-text-muted" role="status">${activeEmergencySession?.recorded?'选择后会结束当前服务端会话。':'本次会话尚未保存；选择后不会伪称已上传。'}</p><button data-ui-action="close-and-navigate" data-nav="home" class="w-full mt-4 py-3 text-text-secondary">暂不记录</button></div>`;document.body.appendChild(modal);
    }

    async function saveEmergencyOutcome(level, outcome) {
      if (emergencyEndInFlight) return;
      const status=document.getElementById('emergency-outcome-status');
      if (useMockMode) { const records=JSON.parse(sessionStorage.getItem('xingban_emergency_sessions')||'[]');records.unshift({level,outcome,endedAt:new Date().toISOString(),demo:true});sessionStorage.setItem('xingban_emergency_sessions',JSON.stringify(records.slice(0,50)));closeTopModal();showToast('体验记录仅保留在当前标签页');navigateTo(outcome==='calm'?'home':'family');return; }
      if (!activeEmergencySession?.id) { if(status)status.textContent='未保存：本次会话没有服务端编号。安全引导仍然有效，但请不要把结果视为已上传。';showToast('本次结果尚未保存');return; }
      if (navigator.onLine === false) { if(status)status.textContent='未保存：当前网络已断开，联网后可重试。';showToast('本次结果尚未保存');return; }
      emergencyEndInFlight=true;document.querySelectorAll('[data-emergency-outcome-button]').forEach(button=>button.disabled=true);if(status)status.textContent='正在结束会话并保存状态…';
      try{const result=await apiRequest(`/emergency/end/${activeEmergencySession.id}`,'POST',{outcome,energy_station:true});if(!result.success)throw new Error(result.error||'保存失败');activeEmergencySession=null;closeTopModal();showToast(result.replayed?'本次结果此前已保存':'已保存本次状态');navigateTo(outcome==='calm'?'home':'family')}catch(error){if(status)status.textContent=`未确认保存：${error.message||'网络连接中断'}。可安全重试。`;showToast('本次结果尚未确认保存')}finally{emergencyEndInFlight=false;document.querySelectorAll('[data-emergency-outcome-button]').forEach(button=>button.disabled=false)}
    }

    function showStrategyNavigator() {
      const options = STRATEGY_BEHAVIOR_GROUPS.filter(item => item.id !== '全部');
      const modal = document.createElement('div');
      modal.className = 'fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-3';
      modal.innerHTML = `<div class="bg-white w-full max-w-xl rounded-2xl max-h-[92vh] overflow-y-auto p-5 sm:p-6">
        <div class="flex justify-between gap-3"><div><h2 class="text-xl font-bold">帮我判断先看哪个方案</h2><p class="text-sm text-text-secondary mt-1">约1分钟。只描述观察到的事实，不替孩子诊断。</p></div><button data-ui-action="close-top-modal" aria-label="关闭判断向导" class="w-10 h-10 rounded-full bg-background">✕</button></div>
        <section class="mt-5 rounded-xl bg-red-50 border border-red-200 p-4"><label class="flex gap-3 items-start"><input id="navigator-danger" type="checkbox" class="mt-1 w-5 h-5 accent-red-700"><span><strong class="block text-red-800">现在无法保证安全，或我不确定</strong><span class="text-sm text-red-900">包括自伤/伤人、具体自杀计划、意识异常、药物过量、真实走失、道路/水边/高处风险。</span></span></label></section>
        <label class="block mt-5 text-sm font-bold">孩子现在最明显的表现<select id="navigator-behavior" class="mt-2 w-full p-3 rounded-xl border border-border bg-white">${options.map(item=>`<option value="${item.id}">${item.label}</option>`).join('')}</select></label>
        <fieldset class="mt-5"><legend class="text-sm font-bold">开始前，哪些因素可能刚发生？（可多选）</legend><div class="grid sm:grid-cols-2 gap-2 mt-2">${['疼痛、发热、便秘或身体不适','噪声、灯光、人群或触觉刺激','活动转换、要求突然增加','听不懂或无法表达需要','饥饿、疲劳或睡眠变化','药物漏服、调整或不良反应','学校、家庭、人际或青春期变化','目前不清楚'].map((item,index)=>`<label class="flex gap-2 items-start p-3 rounded-xl bg-background text-sm"><input type="checkbox" name="navigator-trigger" value="${item}" class="mt-0.5 w-4 h-4 accent-primary">${item}</label>`).join('')}</div></fieldset>
        <label class="block mt-5 text-sm font-bold">请用一句话写“之前—行为—之后”<textarea id="navigator-abc" rows="3" maxlength="240" class="mt-2 w-full p-3 rounded-xl border border-border text-sm" placeholder="例如：关掉平板后，孩子尖叫并扔遥控器；我把平板还给了他。"></textarea></label>
        <p class="text-xs text-text-muted mt-2">这段描述仅用于本页判断，不会作为诊断。疼痛、疾病、睡眠和药物变化应优先交医生评估。</p>
        <button data-ui-call="finishStrategyNavigator" class="w-full mt-5 py-3 rounded-xl bg-primary text-white font-bold">查看建议路径</button>
      </div>`;
      document.body.appendChild(modal);
    }

    function finishStrategyNavigator() {
      if (document.getElementById('navigator-danger')?.checked) { closeTopModal(); navigateTo('emergency'); return; }
      const category = document.getElementById('navigator-behavior')?.value || '全部';
      const triggers = [...document.querySelectorAll('input[name="navigator-trigger"]:checked')].map(item => item.value);
      const abc = document.getElementById('navigator-abc')?.value.trim() || '';
      if (!abc) { showToast('请先用一句话描述之前、行为和之后发生了什么'); return; }
      sessionStorage.setItem('xingban_strategy_assessment', JSON.stringify({ category, triggers, abc, createdAt:new Date().toISOString() }));
      closeTopModal();
      strategiesFilter.category = category;
      strategiesFilter.search = '';
      renderStrategies(document.getElementById('main-content'));
      showToast(triggers.some(item => /疼痛|药物|睡眠/.test(item)) ? '请先排查身体、睡眠或用药因素，再选择家庭策略' : '已按孩子当前表现筛选方案');
    }

    function renderStrategies(container) {
      document.getElementById('page-title').textContent = '按情况找策略';
      document.getElementById('page-subtitle').textContent = '先安全，再理解，再行动';
      const filteredStrategies = getFilteredStrategies();
      const visibleStrategies = filteredStrategies.slice(0, strategiesDisplayLimit);
      const urgent = ['自伤风险','跑开走失','异常兴奋','医疗事件'].includes(strategiesFilter.category);
      container.innerHTML = `
        <div class="p-4 sm:p-6 space-y-5 animate-fade-in max-w-5xl mx-auto">
          <section class="rounded-2xl bg-primary-dark text-white p-5 sm:p-6 overflow-hidden relative">
            <div class="relative z-10 max-w-2xl">
              <p class="text-sm text-white/80">孩子现在正在发生什么？</p>
              <h2 class="text-2xl font-bold mt-1 leading-tight">先选行为，不需要先知道策略名称</h2>
              <p class="text-sm leading-6 text-white/85 mt-3">每个方案都包含现场处理、可直接说的话、停止条件和后续训练。拿不准或存在伤害风险时，先进入紧急支持。</p>
              <div class="mt-4 flex flex-wrap gap-2"><button data-ui-call="showStrategyNavigator" class="px-4 py-2.5 rounded-xl bg-white text-primary-dark font-bold text-sm">帮我判断先看哪个方案</button><button data-nav="emergency" class="px-4 py-2.5 rounded-xl border border-white/60 text-white font-bold text-sm">有危险：先判断安全</button></div>
            </div>
            <div class="absolute -right-8 -bottom-12 w-40 h-40 rounded-full border-[24px] border-white/10" aria-hidden="true"></div>
          </section>

          <section aria-labelledby="strategy-situation-title">
            <div class="flex items-end justify-between gap-3 mb-3"><div><h3 id="strategy-situation-title" class="font-bold text-text-primary">按孩子的表现查找</h3><p class="text-xs text-text-muted mt-1">同一行为可能有不同原因，先选最接近的一项</p></div></div>
            <div class="flex gap-2 overflow-x-auto pb-2 -mx-4 px-4 sm:mx-0 sm:px-0" role="group" aria-label="按行为筛选策略">
              ${STRATEGY_BEHAVIOR_GROUPS.map(group => `<button data-ui-call="filterStrategiesByCategory" data-ui-args='["${group.id}"]' aria-pressed="${strategiesFilter.category === group.id}" class="min-h-11 shrink-0 px-3 py-2 rounded-xl border text-sm font-medium ${strategiesFilter.category === group.id ? 'bg-primary text-white border-primary' : 'bg-white border-border text-text-secondary'}"><span aria-hidden="true" class="mr-1">${group.icon}</span>${group.label}</button>`).join('')}
            </div>
          </section>

          <div class="relative">
            <svg class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input type="search" id="strategies-search" aria-label="搜索孩子的行为或场景" placeholder="例如：撞头、捂耳、不开口、突然不睡觉" value="${strategiesFilter.search}" data-ui-input="strategies" class="w-full pl-10 pr-4 py-3 rounded-xl border border-border bg-white text-sm focus:outline-none focus:ring-2 focus:ring-primary">
          </div>

          ${urgent ? `<section class="rounded-xl bg-red-50 border border-red-200 p-4 text-sm text-red-900"><strong class="block mb-1">当前分类可能需要紧急或医疗支持</strong>如不能保证安全、孩子意识异常、服药过量、有自杀计划或处于道路/水边/高处，请不要继续浏览教程，立即拨打 120/110 并联系既往就诊机构。</section>` : ''}

          <section>
            <div class="flex items-center justify-between mb-3"><h3 class="font-bold text-text-primary">${strategiesFilter.category === '全部' ? '常见情况与解决路径' : (STRATEGY_BEHAVIOR_GROUPS.find(g=>g.id===strategiesFilter.category)?.label || strategiesFilter.category)}</h3><span class="text-xs text-text-muted">${filteredStrategies.length} 个方案</span></div>
            <div class="grid sm:grid-cols-2 gap-3">
              ${filteredStrategies.length ? visibleStrategies.map(s => {
                const context = STRATEGY_CONTEXT[s.id] || {};
                const highRisk = ['自伤风险','跑开走失','异常兴奋','医疗事件'].includes(s.category);
                return `<button data-ui-call="showStrategyDetail" data-ui-args="[${Number(s.id)}]" class="text-left bg-white p-4 rounded-2xl border ${highRisk ? 'border-red-200' : 'border-border'} card-shadow hover:border-primary focus:outline-none focus:ring-2 focus:ring-primary">
                  <div class="flex items-start justify-between gap-3"><div><span class="text-xs font-medium ${highRisk ? 'text-red-700 bg-red-50' : 'text-primary bg-primary-light/30'} px-2 py-1 rounded-lg">${escapeText(s.category)}</span><h4 class="font-bold text-text-primary mt-2">${escapeText(s.name)}</h4></div><span class="text-text-muted" aria-hidden="true">›</span></div>
                  <p class="text-sm text-text-secondary leading-6 mt-2">${escapeText(s.description)}</p>
                  <div class="flex flex-wrap gap-1.5 mt-3">${(context.behaviors || []).slice(0,4).map(item=>`<span class="text-xs px-2 py-1 rounded-lg bg-background text-text-secondary">${item}</span>`).join('')}</div>
                  <div class="pt-3 border-t border-border text-xs text-text-muted"><strong class="text-text-secondary">本方案目标：</strong>${context.goal || '提供可执行的家庭支持步骤'}</div>
                </button>`;
              }).join('') : `<div class="sm:col-span-2 rounded-2xl border border-dashed border-border bg-white p-8 text-center"><div class="font-medium text-text-primary">暂时没有完全匹配的方案</div><p class="text-sm text-text-muted mt-2">换一个孩子正在做的动作搜索；如果情况无法判断或正在升级，请先进入紧急支持。</p><button data-nav="emergency" class="mt-4 px-4 py-2.5 rounded-xl bg-primary text-white">去判断安全</button></div>`}
            </div>
            ${filteredStrategies.length > visibleStrategies.length ? `<button data-ui-call="showMoreStrategies" class="w-full mt-4 py-3 rounded-xl bg-white border border-primary/30 text-primary-dark font-bold">显示更多（还有 ${filteredStrategies.length - visibleStrategies.length} 个）</button>` : ''}
          </section>

          <section class="rounded-2xl bg-white border border-border p-4">
            <h3 class="font-bold text-text-primary">不知道该归到哪一类？</h3>
            <ol class="mt-3 space-y-2 text-sm leading-6 text-text-secondary"><li><strong>1. 写动作：</strong>孩子具体做了什么，不先写“故意”或“不听话”。</li><li><strong>2. 看前因：</strong>之前是否有疼痛、噪声、要求、转换、饥饿、睡眠或用药变化。</li><li><strong>3. 看风险：</strong>能否保证孩子和周围人的安全；不能保证就进入紧急支持。</li><li><strong>4. 只试一个方案：</strong>记录孩子反应，无效或更糟立即停止并寻求专业帮助。</li></ol>
          </section>
        </div>`;
    }

    function getFilteredStrategies() {
      let strategies = [...MOCK_DATA.strategies];
      if (strategiesFilter.category !== '全部') strategies = strategies.filter(s => s.category === strategiesFilter.category || (strategiesFilter.category === '情绪爆发' && s.category === '行为引导'));
      if (strategiesFilter.search) {
        const q = strategiesFilter.search.trim().toLowerCase();
        strategies = strategies.filter(s => {
          const context = STRATEGY_CONTEXT[s.id] || {};
          return [s.name,s.description,s.category,context.goal,context.observe,context.stop,context.followUp,...(context.behaviors||[])].filter(Boolean).join(' ').toLowerCase().includes(q);
        });
      }
      return strategies;
    }

    function showMoreStrategies() {
      strategiesDisplayLimit += 6;
      renderStrategies(document.getElementById('main-content'));
    }

    function onStrategiesSearch(value) {
      strategiesDisplayLimit = 6;
      strategiesFilter.search = value;
      renderStrategies(document.getElementById('main-content'));
    }

    function filterStrategiesByCategory(category) {
      strategiesDisplayLimit = 6;
      strategiesFilter.category = category;
      strategiesFilter.search = '';
      renderStrategies(document.getElementById('main-content'));
    }

    // === 知识问答（优先使用 CBT 知识库） ===
    const KNOWLEDGE_CHIPS = [
      '孩子一考试就紧张，晚上睡不着',
      '孩子发脾气摔东西，说什么都不听',
      '孩子总说自己不行，什么都不愿意试',
      '孩子不想去上学，早上各种拖延',
      '孩子被同学孤立，越来越不爱说话',
      '孩子沉迷手机游戏，不给就闹',
      '孩子反复检查、洗手，停不下来',
      '孩子最近很消沉，什么都不感兴趣'
    ];

    let knowledgeState = { query: '', loading: false, result: null, error: '', recent: [] };

    function renderKnowledge(container) {
      document.getElementById('page-title').textContent = '知识问答';
      document.getElementById('page-subtitle').textContent = '先查知识库，再给建议';
      const st = knowledgeState;
      container.innerHTML = `
        <div class="p-4 sm:p-6 space-y-5 animate-fade-in max-w-4xl mx-auto">
          <section class="rounded-2xl bg-primary-dark text-white p-5 sm:p-6 relative overflow-hidden">
            <div class="relative z-10 max-w-2xl">
              <p class="text-sm text-white/80">把困扰说清楚，先查知识库</p>
              <h2 class="text-2xl font-bold mt-1 leading-tight">答案优先来自 CBT 专业知识库</h2>
              <p class="text-sm leading-6 text-white/85 mt-3">已收录 9 本认知行为疗法专著与 14 讲培训课件的整理稿，共 942 个知识单元。每条建议都会标出出处，方便你回看原文。知识库没有的内容会直接说明，不编造。</p>
            </div>
            <div class="absolute -right-10 -bottom-14 w-44 h-44 rounded-full border-[26px] border-white/10" aria-hidden="true"></div>
          </section>

          <section class="rounded-2xl bg-white border border-border p-4 sm:p-5">
            <label for="knowledge-question" class="block text-sm font-bold text-text-primary">描述一下孩子现在的情况</label>
            <p class="text-xs text-text-muted mt-1">写「发生了什么」比写「他故意不听话」更有用。可以包含年龄、持续时间、什么情况下发生。</p>
            <textarea id="knowledge-question" rows="3" maxlength="1000" class="mt-3 w-full p-3 rounded-xl border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary" placeholder="例如：7岁男孩，最近两周每天晚上都要我陪到睡着，一说关灯就哭，第二天早上叫不醒。">${escapeText(st.query)}</textarea>
            <div class="flex flex-wrap gap-2 mt-3">
              <button data-ui-call="askKnowledge" ${st.loading ? 'disabled' : ''} class="px-5 py-2.5 rounded-xl bg-primary text-white font-bold text-sm disabled:opacity-60">${st.loading ? '正在查知识库…' : '查知识库'}</button>
              <button data-ui-call="clearKnowledge" class="px-5 py-2.5 rounded-xl border border-border text-text-secondary text-sm">清空</button>
            </div>
            <div class="mt-4">
              <div class="text-xs font-bold text-text-muted mb-2">常见困扰，点一下就问</div>
              <div class="flex flex-wrap gap-2">
                ${KNOWLEDGE_CHIPS.map(q => `<button data-ui-call="askKnowledge" data-ui-args="${uiArgsAttr(q)}" class="text-xs px-3 py-2 rounded-xl bg-background border border-border text-text-secondary hover:border-primary hover:text-primary">${escapeText(q)}</button>`).join('')}
              </div>
            </div>
          </section>

          <div id="knowledge-result">${st.error ? `<section class="rounded-xl bg-amber-50 border border-amber-200 p-4 text-sm text-amber-900">${escapeText(st.error)}</section>` : (st.result ? knowledgeResultHtml(st.result) : '')}</div>

          ${st.recent.length ? `<section class="rounded-2xl bg-white border border-border p-4">
            <h3 class="font-bold text-text-primary text-sm">最近问过</h3>
            <div class="mt-3 space-y-2">${st.recent.map((r, i) => `<button data-ui-call="askKnowledge" data-ui-args="${uiArgsAttr(r)}" class="w-full text-left text-sm p-3 rounded-xl bg-background border border-border hover:border-primary">${escapeText(r)}</button>`).join('')}</div>
          </section>` : ''}

          <section class="rounded-2xl bg-background border border-border p-4">
            <h3 class="font-bold text-text-primary text-sm">知识库的边界</h3>
            <ul class="mt-3 space-y-2 text-sm leading-6 text-text-secondary">
              <li>· 知识库内容是通用的 CBT 方法与教材原文，不是对你孩子的诊断。</li>
              <li>· 涉及自伤、自杀、伤人、意识异常、药物过量时，本页会直接切换到安全响应，不提供自助建议。</li>
              <li>· 烫伤、误吞异物、动物咬伤、大出血这类意外伤害/急症不是本页能回答的：会直接切换为就医指引（120/急诊），不引用知识库、不提供医疗建议。</li>
              <li>· 情况持续两周以上、明显影响上学或睡觉，请到医院精神科或心理科做正式评估。</li>
              <li>· 知识库优先，但不等于唯一：回答会标注出处，你随时可以核对原文。</li>
              <li>· 出处里的章节名按原书扫描件原样保留（已标「原书章节名」），个别错字属扫描识别问题，不是星伴写的；引用的正文已做过错字校正。</li>
              <li>· 有些题材（比如屏幕依赖、注意力与多动）现有教材里没有专门章节，这类问题会给出「场景迁移卡」：引文仍取自原书，做法部分由星伴整理并已标注。</li>
            </ul>
          </section>
        </div>`;
    }

    function knowledgeResultHtml(res) {
      if (!res) return '';
      const isCrisis = res.mode === 'crisis';
      // 第三十二轮：急症（意外伤害/误吞等）与危机同为「紧急响应」样式，但徽标文字不同——
      // 危机 = 安全响应（心理热线），急症 = 就医指引（120/急诊）。
      const isMedical = res.mode === 'medical';
      const isUrgent = isCrisis || isMedical;
      const urgentBadge = isCrisis ? '安全响应' : '就医指引';
      const srcs = res.sources || [];
      // 走迁移卡时只显示卡片对应场景：标签投票带出来的边缘场景（社交与人际/物质滥用…）
      // 对家长没有意义，只会让人怀疑答偏了。
      const tags = res.bridge ? [res.bridge] : ((res.intent && res.intent.scenes) || []);
      return `
        <section class="rounded-2xl ${isUrgent ? 'bg-red-50 border border-red-300' : 'bg-white border border-border'} p-4 sm:p-5">
          <div class="flex flex-wrap items-center gap-2">
            <span class="text-xs font-bold px-2 py-1 rounded-lg ${isUrgent ? 'bg-red-600 text-white' : 'bg-primary-light/40 text-primary-dark'}">${isUrgent ? urgentBadge : (res.mode === 'extractive' ? '知识库原文' : (res.mode === 'llm' ? '知识库增强回答' : '知识库'))}</span>
            ${res.bridge ? `<span class="text-xs font-bold px-2 py-1 rounded-lg bg-amber-100 text-amber-800" title="这批教材里没有该题材的专门章节，本条是把通用方法迁移过来的">场景迁移卡 · ${escapeText(res.bridge)}</span>` : ''}
            ${tags.map(t => `<span class="text-xs px-2 py-1 rounded-lg bg-background text-text-secondary">${escapeText(t)}</span>`).join('')}
          </div>
          <div class="mt-4 text-sm leading-7 text-text-primary kb-answer">${kbRenderMarkdown(res.answer || '')}</div>
          ${res.bridge ? `<p class="text-xs text-text-muted mt-3">这一类问题在这批教材里<strong>没有专门的章节</strong>，所以上面的卡是把通用的 CBT 方法迁移过来的：带「出处」的引文都来自原书、可以点开核对；标了「星伴整理」的做法是我们在这些方法基础上写给家长的，不属于原书原文。</p>` : ''}
          ${res.notice ? `<p class="text-xs text-text-muted mt-3">${escapeText(res.notice)}</p>` : ''}
          ${srcs.length ? `<div class="mt-5 pt-4 border-t border-border">
            <h4 class="text-xs font-bold text-text-muted">出处（点开可看原文）</h4>
            <div class="mt-2 space-y-2">${srcs.map(s => `<button data-ui-call="openKnowledgeSource" data-ui-args='["${encodeURIComponent(s.id)}"]' class="w-full text-left p-3 rounded-xl bg-background border border-border hover:border-primary">
              <div class="text-sm font-medium text-text-primary flex items-center gap-2 flex-wrap">${escapeText(s.title)}<span class="text-[10px] px-1.5 py-0.5 rounded bg-white border border-border text-text-muted shrink-0" title="章节名按原书扫描件原样保留，未做改动，便于与原文对照">原书章节名</span>${s.scanQuality === 'weak' ? `<span class="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 shrink-0" title="这一版扫描件识别质量欠佳，正文已尽力校正，仍有少量错字；引用时建议对照原书">扫描质量欠佳</span>` : ''}</div>
              <div class="text-xs text-text-muted mt-1">《${escapeText(s.source)}》</div>
              ${(s.scenes || []).length ? `<div class="flex flex-wrap gap-1 mt-2">${s.scenes.map(x => `<span class="text-xs px-1.5 py-0.5 rounded bg-white text-text-secondary border border-border">${escapeText(x)}</span>`).join('')}</div>` : ''}
            </button>`).join('')}</div>
          </div>` : ''}
          ${(res.suggestions || []).length ? `<div class="mt-4">
            <h4 class="text-xs font-bold text-text-muted">接着可以问</h4>
            <div class="flex flex-wrap gap-2 mt-2">${res.suggestions.map(s => `<button data-ui-call="askKnowledge" data-ui-args="${uiArgsAttr(s)}" class="text-xs px-3 py-2 rounded-xl border border-border text-text-secondary hover:border-primary hover:text-primary">${escapeText(s)}</button>`).join('')}</div>
          </div>` : ''}
          <div class="mt-4 pt-4 border-t border-border">
            <div id="kb-feedback" class="flex flex-wrap items-center gap-2">
              <span class="text-xs text-text-muted">这条回答对你有帮助吗？</span>
              <button data-ui-call="sendKbFeedback" data-ui-args='["helpful"]' data-ui-pass-this="true" class="text-xs px-3 py-1.5 rounded-lg border border-border text-text-secondary hover:border-primary hover:text-primary">有帮助</button>
              <button data-ui-call="sendKbFeedback" data-ui-args='["unhelpful"]' data-ui-pass-this="true" class="text-xs px-3 py-1.5 rounded-lg border border-border text-text-secondary hover:border-primary hover:text-primary">没帮助</button>
              <span id="kb-feedback-note" class="text-xs text-text-muted"></span>
            </div>
            <p class="text-[11px] text-text-muted mt-2">反馈只记「你问了什么 + 捞到几条 + 有没有帮助」，用来定位知识库哪里不够用；不会上传任何内容。</p>
          </div>
        </section>`;
    }

    /**
     * 回答反馈。存的是问题本身与命中条数——这是「哪些问题问得多却捞不到东西」的唯一数据来源，
     * 所以「没帮助」也要能记下来。失败就如实说没记上，不假装成功。
     */
    async function sendKbFeedback(verdict, btn) {
      const res = knowledgeState.result;
      if (!res) return;
      const question = knowledgeState.query || '';
      if (!question) { showToast('找不到对应的问题，请重新提问'); return; }
      const note = document.getElementById('kb-feedback-note');
      try {
        const r = await apiRequest('/knowledge/feedback', 'POST', {
          question,
          verdict,
          usedSources: (res.sources || []).map(s => s.id).slice(0, 8),
        });
        if (!r || !r.success) throw new Error((r && r.error) || 'failed');
        if (note) note.textContent = verdict === 'helpful' ? '已记下，谢谢。' : '已记下。你可以把问题写得更具体（时间、具体表现、情境），我再按原文查一次。';
        const box = document.getElementById('kb-feedback');
        if (box) [...box.querySelectorAll('button')].forEach(b => { b.disabled = true; b.classList.add('opacity-50'); });
      } catch (e) {
        if (note) note.textContent = '反馈没记上，稍后再试。';
      }
    }

    function kbRenderMarkdown(text) {
      const lines = String(text || '').split('\n');
      let html = '';
      let inList = false;
      const closeList = () => { if (inList) { html += '</ul>'; inList = false; } };
      for (const raw of lines) {
        const line = raw.replace(/\r/g, '');
        if (/^###\s+/.test(line)) { closeList(); html += `<h3 class="font-bold text-text-primary mt-4 mb-2">${kbInline(line.replace(/^###\s+/, ''))}</h3>`; continue; }
        if (/^##\s+/.test(line)) { closeList(); html += `<h4 class="font-bold text-text-primary mt-4 mb-2">${kbInline(line.replace(/^##\s+/, ''))}</h4>`; continue; }
        if (/^\s*---\s*$/.test(line)) { closeList(); html += '<hr class="my-4 border-border">'; continue; }
        if (/^&gt;\s?|^>\s?/.test(line)) { closeList(); html += `<p class="text-xs text-text-muted mt-3 border-l-2 border-border pl-3">${kbInline(line.replace(/^&gt;\s?|^>\s?/, ''))}</p>`; continue; }
        if (/^\s*[-*]\s+/.test(line)) { if (!inList) { html += '<ul class="list-disc pl-5 space-y-1.5 my-2">'; inList = true; } html += `<li>${kbInline(line.replace(/^\s*[-*]\s+/, ''))}</li>`; continue; }
        if (/^\s*\d+\.\s+/.test(line)) { if (!inList) { html += '<ul class="list-decimal pl-5 space-y-1.5 my-2">'; inList = true; } html += `<li>${kbInline(line.replace(/^\s*\d+\.\s+/, ''))}</li>`; continue; }
        if (!line.trim()) { closeList(); continue; }
        closeList();
        html += `<p class="my-2">${kbInline(line)}</p>`;
      }
      closeList();
      return html;
    }

    function kbInline(text) {
      return escapeText(text)
        .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
        .replace(/「([^」]+)」/g, '<span class="text-primary-dark">「$1」</span>');
    }

    async function askKnowledge(preset) {
      if (knowledgeState.loading) return;
      const input = document.getElementById('knowledge-question');
      const question = typeof preset === 'string' && preset ? preset : (input ? input.value.trim() : knowledgeState.query);
      if (!question || question.length < 2) { showToast('请先描述一下你遇到的问题'); return; }
      knowledgeState.query = question;
      knowledgeState.loading = true;
      knowledgeState.error = '';
      knowledgeState.result = null;
      const box = document.getElementById('knowledge-result');
      if (box) box.innerHTML = '<section class="rounded-2xl bg-white border border-border p-6 text-center text-sm text-text-muted">正在检索知识库…</section>';
      const chips = [...document.querySelectorAll('#knowledge-result ~ * button')];
      void chips;
      try {
        const res = await apiRequest('/knowledge/ask-public', 'POST', { question, ctx: { childOnly: false, top: 8 } });
        if (res && res.success) {
          knowledgeState.result = res;
          knowledgeState.recent = [question, ...knowledgeState.recent.filter(x => x !== question)].slice(0, 5);
        } else if (res && res.error) {
          knowledgeState.error = res.error;
        } else {
          knowledgeState.error = '知识库暂时无法访问，请稍后再试。';
        }
      } catch (e) {
        knowledgeState.error = '知识库暂时无法访问，请稍后再试。';
      }
      knowledgeState.loading = false;
      renderKnowledge(document.getElementById('main-content'));
    }

    function clearKnowledge() {
      knowledgeState = { query: '', loading: false, result: null, error: '', recent: knowledgeState.recent };
      renderKnowledge(document.getElementById('main-content'));
    }

    async function openKnowledgeSource(id) {
      try {
        const res = await apiRequest(`/knowledge/doc/${id}`, 'GET');
        if (!res || !res.success || !res.doc) { showToast('无法读取该章节'); return; }
        const doc = res.doc;
        const modal = document.createElement('div');
        modal.className = 'fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-3';
        modal.innerHTML = `<div class="bg-white w-full max-w-2xl rounded-2xl max-h-[90vh] overflow-y-auto p-5">
          <div class="flex justify-between gap-3"><div><h3 class="font-bold text-text-primary">${escapeText(doc.heading || '')} <span class="text-[10px] font-normal px-1.5 py-0.5 rounded bg-background border border-border text-text-muted align-middle" title="章节名按原书扫描件原样保留，未做改动，便于与原文对照">原书章节名</span></h3><p class="text-xs text-text-muted mt-1">《${escapeText(doc.source)}》${doc.child ? ' · 儿童相关' : ''}</p><p class="text-[11px] text-text-muted mt-1">章节名来自原书扫描件，个别错字（如「概急化」应为「概念化」）属扫描识别问题；正文已做过错字校正。${doc.scanQuality === 'weak' ? '<br><span class="text-amber-800">这一版扫描件识别质量欠佳，正文已尽力校正，仍可能有少量错字，引用时请对照原书。</span>' : ''}</p></div><button data-ui-action="remove-overlay" class="w-9 h-9 rounded-full bg-background shrink-0" aria-label="关闭">✕</button></div>
          <div class="flex flex-wrap gap-1.5 mt-3">${(doc.scenes || []).map(t => `<span class="text-xs px-2 py-1 rounded-lg bg-primary-light/30 text-primary-dark">${escapeText(t)}</span>`).join('')}${(doc.techs || []).map(t => `<span class="text-xs px-2 py-1 rounded-lg bg-background text-text-secondary">${escapeText(t)}</span>`).join('')}${(doc.types || []).map(t => `<span class="text-xs px-2 py-1 rounded-lg bg-background text-text-secondary">${escapeText(t)}</span>`).join('')}</div>
          <div class="mt-4 text-sm leading-7 text-text-secondary whitespace-pre-wrap">${escapeText(doc.text || '')}</div>
        </div>`;
        document.body.appendChild(modal);
      } catch (e) {
        showToast('无法读取该章节');
      }
    }

    // === 可打印表格（原书里的工具表单与工作表） ===
    // 取舍说明：原书扫描件里的表格被 OCR 压平成了「一行一串短语」，列与列的关系已经丢了。
    // 星伴不重画表格——那样看着整齐，实际是把结构当内容编出来。所以这里只做「筛选 + 原样呈现」：
    // 挑出确实像清单的章节，正文逐字给出，标清出处与扫描质量，家长自己打印。
    let worksheetState = { loading: false, error: '', data: null, openId: '' };

    // === 示范对话（原书里的对话示例与逐字稿） ===
    // 素材绝大多数是「咨询师 ↔ 成人患者」的治疗室逐字稿。这里的处理原则：
    //   ① 只换称谓词的「家长语境改写版」默认展示（改写规则与回答管线共用一份）；
    //   ② 原文随时可对照，标明「已改写」；
    //   ③ 全页定位写清楚——这些是专业人员在治疗室里的说法，**不是家庭话术模板**，
    //      照搬会变成审问孩子。宁可家长觉得「不是给我用的」，也不包装成照着说。
    let dialogueState = { loading: false, error: '', data: null, group: 'all' };
    let dialogueOpenData = null;   // 当前打开的示范对话（改写版 + 原文），供切换标签用

    function renderWorksheets(container) {
      document.getElementById('page-title').textContent = '可打印表格';
      document.getElementById('page-subtitle').textContent = '原书里的清单与工作表';
      const st = worksheetState;
      const d = st.data;
      const groups = {};
      if (d && d.items) d.items.forEach(it => { (groups[it.source] = groups[it.source] || []).push(it); });
      container.innerHTML = `
        <div class="p-4 space-y-5 animate-fade-in">
          <section class="rounded-2xl bg-white border border-border p-4 sm:p-5">
            <h3 class="font-bold text-text-primary text-sm">这些表格是从哪来的</h3>
            <p class="text-sm leading-6 text-text-secondary mt-2">全部取自知识库里 9 本 CBT 专著与 14 讲课件中的「工具表单与工作表」章节，共 ${d ? d.total : '…'} 条，按下面的口径筛出 ${d ? d.count : '…'} 条可用清单。正文<strong>逐字保留原书扫描文字</strong>，星伴没有重画表格结构（重画会把推测当内容），所以打印出来是原书原样的清单，个别错字来自扫描识别。</p>
            ${d ? `<p class="text-xs text-text-muted mt-2">入选口径：${escapeText(d.criteria)}（体量过小或过大的、以及整段散文都不收）。</p>` : ''}
            <div class="flex flex-wrap gap-2 mt-3">
              <button data-ui-call="loadWorksheets" data-ui-args="[true]" class="px-4 py-2 rounded-xl bg-primary text-white text-sm font-bold">${st.loading ? '正在加载…' : '刷新清单'}</button>
              <span class="text-xs text-text-muted self-center">点任意一条可看全文并打印</span>
            </div>
          </section>
          ${st.error ? `<section class="rounded-xl bg-amber-50 border border-amber-200 p-4 text-sm text-amber-900">${escapeText(st.error)}</section>` : ''}
          ${!d && st.loading ? '<section class="rounded-2xl bg-white border border-border p-6 text-center text-sm text-text-muted">正在读取清单…</section>' : ''}
          ${Object.entries(groups).map(([src, list]) => `<section class="rounded-2xl bg-white border border-border p-4">
            <h4 class="font-bold text-text-primary text-sm flex items-center gap-2 flex-wrap">《${escapeText(src)}》<span class="text-xs font-normal text-text-muted">${list.length} 条</span>${list.some(x => x.scanQuality === 'weak') ? '<span class="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-800" title="这一版扫描件识别质量欠佳，正文已尽力校正，仍可能有少量错字">扫描质量欠佳</span>' : ''}</h4>
            <div class="mt-3 space-y-2">${list.map(it => `<button data-ui-call="openWorksheet" data-ui-args='["${encodeURIComponent(it.id)}"]' class="w-full text-left p-3 rounded-xl bg-background border border-border hover:border-primary">
              <div class="text-sm font-medium text-text-primary">${escapeText(it.title)}</div>
              <div class="text-xs text-text-muted mt-1">${escapeText(it.preview)}${it.preview.length >= 60 ? '…' : ''}</div>
              <div class="text-[11px] text-text-muted mt-1">${it.chars} 字 · ${it.lines} 行</div>
            </button>`).join('')}</div>
          </section>`).join('')}
        </div>`;
      if (!d && !st.loading && !st.error) loadWorksheets();
    }

    async function loadWorksheets(force) {
      if (worksheetState.loading) return;
      if (worksheetState.data && !force) return;
      worksheetState.loading = true;
      worksheetState.error = '';
      try {
        const res = await apiRequest('/knowledge/worksheets', 'GET');
        if (res && res.success) worksheetState.data = res;
        else worksheetState.error = (res && res.error) || '表格清单暂时取不到，请稍后再试。';
      } catch (e) {
        worksheetState.error = '表格清单暂时取不到，请稍后再试。';
      }
      worksheetState.loading = false;
      const main = document.getElementById('main-content');
      if (main) renderWorksheets(main);
    }

    async function openWorksheet(id) {
      try {
        const res = await apiRequest(`/knowledge/doc/${id}`, 'GET');
        if (!res || !res.success || !res.doc) { showToast('无法读取该章节'); return; }
        const doc = res.doc;
        const modal = document.createElement('div');
        modal.className = 'fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-3';
        modal.innerHTML = `<div class="bg-white w-full max-w-2xl rounded-2xl max-h-[90vh] overflow-y-auto p-5 print-sheet">
          <div class="flex justify-between gap-3 no-print"><div><h3 class="font-bold text-text-primary">${escapeText(doc.heading || '')}</h3><p class="text-xs text-text-muted mt-1">《${escapeText(doc.source)}》</p></div><div class="flex gap-2 shrink-0"><button data-ui-action="print" class="px-3 py-2 rounded-xl bg-primary text-white text-xs font-bold">打印这一页</button><button data-ui-action="remove-overlay" class="w-9 h-9 rounded-full bg-background" aria-label="关闭">✕</button></div></div>
          <div class="mt-3 p-3 rounded-xl bg-amber-50 border border-amber-200 text-[11px] text-amber-900 no-print">下面是原书扫描原文，逐字保留。原书扫描件里的表格在识别时被压平了，列与列的关系已经丢失——星伴没有重排成表格（重排只能靠猜，猜出来的结构就成了编造）。所以打印出来是原书原样的清单，空行与留白按原书排版保留，<strong>留白就是留给你自己填写的</strong>。个别错字来自扫描识别，可对照原书核对。若这条清单里有让你不安的内容，请以专业人员的解释为准。</div>
          <pre class="mt-4 text-sm leading-7 text-text-primary whitespace-pre-wrap font-sans">${escapeText(doc.text || '')}</pre>
          <p class="mt-4 pt-3 border-t border-border text-[11px] text-text-muted">出处：《${escapeText(doc.source)}》 · ${escapeText(doc.heading || '')}${doc.scanQuality === 'weak' ? '（该来源扫描质量欠佳，请对照原书）' : ''}</p>
        </div>`;
        document.body.appendChild(modal);
      } catch (e) {
        showToast('无法读取该章节');
      }
    }

    function renderDialogues(container) {
      document.getElementById('page-title').textContent = '示范对话';
      document.getElementById('page-subtitle').textContent = '教材里的问与答';
      const st = dialogueState;
      const d = st.data;
      const all = (d && d.items) || [];
      const list = st.group === 'all' ? all : all.filter(x => (x.scene || x.tech || '通用对话技巧') === st.group);
      container.innerHTML = `
        <div class="p-4 space-y-5 animate-fade-in">
          <section class="rounded-2xl bg-white border border-border p-4 sm:p-5">
            <h3 class="font-bold text-text-primary text-sm">这些对话是什么，不是什么</h3>
            <p class="text-sm leading-6 text-text-secondary mt-2">从知识库 9 本专著与 14 讲课件里筛出的对话示例，共 ${d ? d.total : '…'} 条，按下面的口径选出 ${d ? d.count : '…'} 条。${d ? `其中 ${d.needsRewrite} 条原文是「心理老师／患者」的治疗室记录，星伴只把称谓换成了家长语境（<strong>不新增任何内容</strong>），原文随时可以对照。` : ''}</p>
            <div class="mt-2 p-3 rounded-xl bg-amber-50 border border-amber-200 text-[12px] leading-6 text-amber-900">
              <strong>请当作参考，不要当作话术模板。</strong>这些话大多是心理咨询师在治疗室里对<strong>成人来访者</strong>说的，
              问题很直接、追问很密集——那是专业关系里才成立的说法。你对孩子照搬，容易变成审问。
              真正能拿走的，是其中「怎么把话问开」的思路；涉及孩子的具体情况，仍要找专业人员。
            </div>
            ${d ? `<p class="text-xs text-text-muted mt-2">入选口径：${escapeText(d.criteria)}。</p>` : ''}
            <div class="flex flex-wrap gap-2 mt-3">
              <button data-ui-call="loadDialogues" data-ui-args="[true]" class="px-4 py-2 rounded-xl bg-primary text-white text-sm font-bold">${st.loading ? '正在加载…' : '刷新'}</button>
              <span class="text-xs text-text-muted self-center">点任意一条可看完整对话与原文对照</span>
            </div>
          </section>
          ${st.error ? `<section class="rounded-xl bg-amber-50 border border-amber-200 p-4 text-sm text-amber-900">${escapeText(st.error)}</section>` : ''}
          ${d && d.groups ? `<section class="rounded-2xl bg-white border border-border p-4">
            <h4 class="font-bold text-text-primary text-sm">按主题看</h4>
            <div class="flex flex-wrap gap-2 mt-3">
              <button data-ui-call="filterDialogues" data-ui-args='["all"]' class="px-3 py-1.5 rounded-lg text-xs ${st.group === 'all' ? 'bg-primary text-white' : 'bg-background border border-border text-text-secondary'}">全部 ${all.length}</button>
              ${d.groups.map(g => `<button data-ui-call="filterDialogues" data-ui-args="${uiArgsAttr(g.key)}" class="px-3 py-1.5 rounded-lg text-xs ${st.group === g.key ? 'bg-primary text-white' : 'bg-background border border-border text-text-secondary'}">${g.kind === 'tech' ? '技术 · ' : (g.kind === 'scene' ? '场景 · ' : '')}${escapeText(g.key)} ${g.count}</button>`).join('')}
            </div>
          </section>` : ''}
          ${!d && st.loading ? '<section class="rounded-2xl bg-white border border-border p-6 text-center text-sm text-text-muted">正在读取…</section>' : ''}
          ${list.length ? `<section class="rounded-2xl bg-white border border-border p-4">
            <h4 class="font-bold text-text-primary text-sm">${st.group === 'all' ? '全部对话' : escapeText(st.group)}<span class="text-xs font-normal text-text-muted ml-2">${list.length} 条</span></h4>
            <div class="mt-3 space-y-2">${list.map(it => `<button data-ui-call="openDialogue" data-ui-args='["${encodeURIComponent(it.id)}"]' class="w-full text-left p-3 rounded-xl bg-background border border-border hover:border-primary">
              <div class="text-sm font-medium text-text-primary flex items-center gap-2 flex-wrap">${escapeText(it.title)}${it.needsRewrite ? '<span class="text-[10px] px-1.5 py-0.5 rounded bg-white border border-border text-text-muted" title="原文是成人治疗室语境，展示版本已把称谓换成家长语境，未新增内容">已改写</span>' : ''}${it.scanQuality === 'weak' ? '<span class="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-800" title="该来源扫描质量欠佳，引用时请对照原书">扫描质量欠佳</span>' : ''}</div>
              <div class="text-xs text-text-muted mt-1">《${escapeText(it.source)}》 · ${it.turns} 轮对话${it.scene ? ' · ' + escapeText(it.scene) : (it.tech ? ' · ' + escapeText(it.tech) : '')}</div>
              <div class="text-xs text-text-secondary mt-1 leading-5">${escapeText(it.preview)}…</div>
            </button>`).join('')}</div>
          </section>` : ''}
        </div>`;
      if (!d && !st.loading && !st.error) loadDialogues();
    }

    async function loadDialogues(force) {
      if (dialogueState.loading) return;
      if (dialogueState.data && !force) return;
      dialogueState.loading = true;
      dialogueState.error = '';
      try {
        const res = await apiRequest('/knowledge/dialogues', 'GET');
        if (res && res.success) dialogueState.data = res;
        else dialogueState.error = (res && res.error) || '对话示例暂时取不到，请稍后再试。';
      } catch (e) {
        dialogueState.error = '对话示例暂时取不到，请稍后再试。';
      }
      dialogueState.loading = false;
      const main = document.getElementById('main-content');
      if (main) renderDialogues(main);
    }

    function filterDialogues(group) {
      dialogueState.group = group;
      const main = document.getElementById('main-content');
      if (main) renderDialogues(main);
    }

    async function openDialogue(id) {
      try {
        const res = await apiRequest(`/knowledge/dialogue/${id}`, 'GET');
        if (!res || !res.success || !res.doc) { showToast('无法读取该对话'); return; }
        const doc = res.doc;
        const modal = document.createElement('div');
        modal.className = 'fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-3';
        modal.innerHTML = `<div class="bg-white w-full max-w-2xl rounded-2xl max-h-[90vh] overflow-y-auto p-5">
          <div class="flex justify-between gap-3"><div><h3 class="font-bold text-text-primary">${escapeText(doc.title || '')}</h3><p class="text-xs text-text-muted mt-1">《${escapeText(doc.source)}》 · ${doc.turns} 轮${doc.scenes && doc.scenes.length ? ' · ' + escapeText(doc.scenes[0]) : ''}</p></div><button data-ui-action="remove-overlay" class="w-9 h-9 rounded-full bg-background shrink-0" aria-label="关闭">✕</button></div>
          <div class="mt-3 p-3 rounded-xl bg-amber-50 border border-amber-200 text-[11px] leading-6 text-amber-900">这是教材里的专业示范对话，<strong>不是家庭话术模板</strong>；${doc.needsRewrite ? '下面正文的称谓已按家长语境改写（只换称谓词、未新增内容），' : ''}可切到原文逐字核对。</div>
          <div class="flex gap-2 mt-3">
            <button id="dlg-tab-soft" data-ui-call="switchDialogueTab" data-ui-args='["soft"]' class="px-3 py-1.5 rounded-lg text-xs font-bold bg-primary text-white">家长语境版</button>
            <button id="dlg-tab-raw" data-ui-call="switchDialogueTab" data-ui-args='["raw"]' class="px-3 py-1.5 rounded-lg text-xs font-bold bg-background border border-border text-text-secondary">原书原文</button>
          </div>
          <pre id="dlg-body" class="mt-3 text-sm leading-7 text-text-primary whitespace-pre-wrap font-sans">${escapeText(doc.needsRewrite ? doc.softened : doc.original)}</pre>
          <p class="mt-4 pt-3 border-t border-border text-[11px] text-text-muted">出处：《${escapeText(doc.source)}》 · ${escapeText(doc.title || '')}${doc.scanQuality === 'weak' ? '（该来源扫描质量欠佳，请对照原书）' : ''}</p>
        </div>`;
        dialogueOpenData = { soft: doc.softened, raw: doc.original };
        document.body.appendChild(modal);
      } catch (e) {
        showToast('无法读取该对话');
      }
    }

    // 切换「家长语境版 / 原书原文」。
    // 两种文本**不塞进 DOM 的 data 属性**：escapeText 会把引号转成实体，
    // 读回来 JSON.parse 必失败（本项目踩过类似坑），所以直接挂在模块级变量上。
    function switchDialogueTab(which) {
      const data = dialogueOpenData;
      if (!data) return;
      const body = document.getElementById('dlg-body');
      if (body) body.textContent = which === 'raw' ? data.raw : data.soft;
      const soft = document.getElementById('dlg-tab-soft');
      const raw = document.getElementById('dlg-tab-raw');
      const on = 'px-3 py-1.5 rounded-lg text-xs font-bold bg-primary text-white';
      const off = 'px-3 py-1.5 rounded-lg text-xs font-bold bg-background border border-border text-text-secondary';
      if (soft) soft.className = which === 'raw' ? off : on;
      if (raw) raw.className = which === 'raw' ? on : off;
    }

    function renderProfile(container) {
      document.getElementById('page-title').textContent = '我的';
      document.getElementById('page-subtitle').textContent = '个人中心';

      container.innerHTML = `
        <div class="p-4 space-y-6 animate-fade-in">
          <!-- 用户信息 -->
          <div class="bg-gradient-to-br from-primary to-primary-dark rounded-2xl p-5 text-white card-shadow">
            <div class="flex items-center gap-4">
              <div class="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center">
                <svg class="w-8 h-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                  <circle cx="12" cy="7" r="4"/>
                </svg>
              </div>
              <div>
                <h2 class="text-xl font-bold">${escapeText(currentUser?.name || '家长')}</h2>
                <p class="text-white/80 text-sm">${escapeText(currentUser?.phone || '')}</p>
              </div>
            </div>
            <div class="flex gap-6 mt-4 pt-4 border-t border-white/20">
              <div>
                <div class="text-xl font-bold">${MOCK_DATA.children.length}</div>
                <div class="text-xs text-white/70">孩子</div>
              </div>
              <div>
                <div class="text-xl font-bold">${MOCK_DATA.behaviors.length}</div>
                <div class="text-xs text-white/70">记录</div>
              </div>
              <div>
                <div class="text-xl font-bold">${MOCK_DATA.reports.length}</div>
                <div class="text-xs text-white/70">周报</div>
              </div>
            </div>
          </div>

          <!-- 功能入口 -->
          <div>
            <h3 class="font-bold text-text-primary mb-3">儿童管理</h3>
            <div class="bg-white rounded-xl card-shadow overflow-hidden">
              <button data-nav="children" class="w-full p-4 flex items-center gap-4 hover:bg-gray-50 transition-colors">
                <div class="w-10 h-10 bg-primary-light/50 rounded-xl flex items-center justify-center">
                  <svg class="w-5 h-5 text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="12" cy="8" r="5"/>
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                  </svg>
                </div>
                <div class="flex-1 text-left">
                  <div class="font-medium text-text-primary">孩子与记录</div>
                  <div class="text-xs text-text-muted">查看档案与观察记录</div>
                </div>
                <svg class="w-5 h-5 text-text-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M9 18l6-6-6-6"/>
                </svg>
              </button>
              <button data-nav="safety" class="w-full p-4 flex items-center gap-4 hover:bg-gray-50 transition-colors border-t border-border">
                <div class="w-10 h-10 bg-red-100 rounded-xl flex items-center justify-center">
                  <svg class="w-5 h-5 text-red-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
                  </svg>
                </div>
                <div class="flex-1 text-left">
                  <div class="font-medium text-text-primary">安全中心</div>
                  <div class="text-xs text-text-muted">防走失与技能训练</div>
                </div>
                <svg class="w-5 h-5 text-text-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M9 18l6-6-6-6"/>
                </svg>
              </button>
            </div>
          </div>

          <div>
            <h3 class="font-bold text-text-primary mb-3">成长支持</h3>
            <div class="bg-white rounded-xl card-shadow overflow-hidden">
              <button data-nav="growth" class="w-full p-4 flex items-center gap-4 hover:bg-gray-50 transition-colors">
                <div class="w-10 h-10 bg-primary-light/50 rounded-xl flex items-center justify-center">
                  <svg class="w-5 h-5 text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M22 12h-4l-3 9L9 3l-3 9H2"/>
                  </svg>
                </div>
                <div class="flex-1 text-left">
                  <div class="font-medium text-text-primary">家长成长</div>
                  <div class="text-xs text-text-muted">等级 L${MOCK_DATA.growth.level.replace('L','')}</div>
                </div>
                <svg class="w-5 h-5 text-text-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M9 18l6-6-6-6"/>
                </svg>
              </button>
              <button data-nav="reports" class="w-full p-4 flex items-center gap-4 hover:bg-gray-50 transition-colors border-t border-border">
                <div class="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center">
                  <svg class="w-5 h-5 text-blue-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                    <line x1="16" y1="13" x2="8" y2="13"/>
                    <line x1="16" y1="17" x2="8" y2="17"/>
                  </svg>
                </div>
                <div class="flex-1 text-left">
                  <div class="font-medium text-text-primary">成长周报</div>
                  <div class="text-xs text-text-muted">查看每周报告</div>
                </div>
                <svg class="w-5 h-5 text-text-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M9 18l6-6-6-6"/>
                </svg>
              </button>
              <button data-nav="stories" class="w-full p-4 flex items-center gap-4 hover:bg-gray-50 transition-colors border-t border-border">
                <div class="w-10 h-10 bg-purple-100 rounded-xl flex items-center justify-center">
                  <svg class="w-5 h-5 text-purple-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                    <polyline points="14 2 14 8 20 8"/>
                    <line x1="16" y1="13" x2="8" y2="13"/>
                    <line x1="16" y1="17" x2="8" y2="17"/>
                  </svg>
                </div>
                <div class="flex-1 text-left">
                  <div class="font-medium text-text-primary">故事分享</div>
                  <div class="text-xs text-text-muted">家长互助社区</div>
                </div>
                <svg class="w-5 h-5 text-text-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M9 18l6-6-6-6"/>
                </svg>
              </button>
              <button data-nav="family" class="w-full p-4 flex items-center gap-4 hover:bg-gray-50 transition-colors border-t border-border">
                <div class="w-10 h-10 bg-pink-100 rounded-xl flex items-center justify-center">
                  <svg class="w-5 h-5 text-pink-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
                  </svg>
                </div>
                <div class="flex-1 text-left">
                  <div class="font-medium text-text-primary">家庭系统</div>
                  <div class="text-xs text-text-muted">情绪签到与感谢卡</div>
                </div>
                <svg class="w-5 h-5 text-text-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M9 18l6-6-6-6"/>
                </svg>
              </button>
              <button data-nav="ai" class="w-full p-4 flex items-center gap-4 hover:bg-gray-50 transition-colors border-t border-border">
                <div class="w-10 h-10 bg-cyan-100 rounded-xl flex items-center justify-center">
                  <svg class="w-5 h-5 text-cyan-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="12" cy="12" r="10"/>
                    <line x1="12" y1="8" x2="12" y2="12"/>
                    <line x1="12" y1="16" x2="12.01" y2="16"/>
                  </svg>
                </div>
                <div class="flex-1 text-left">
                  <div class="font-medium text-text-primary">AI分析</div>
                  <div class="text-xs text-text-muted">行为数据分析</div>
                </div>
                <svg class="w-5 h-5 text-text-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M9 18l6-6-6-6"/>
                </svg>
              </button>
              <button data-nav="career" class="w-full p-4 flex items-center gap-4 hover:bg-gray-50 transition-colors border-t border-border">
                <div class="w-10 h-10 bg-purple-100 rounded-xl flex items-center justify-center">
                  <svg class="w-5 h-5 text-purple-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M12 8v4l3 3"/>
                    <circle cx="12" cy="12" r="10"/>
                  </svg>
                </div>
                <div class="flex-1 text-left">
                  <div class="font-medium text-text-primary">生涯规划</div>
                  <div class="text-xs text-text-muted">分阶段支持与选择准备</div>
                </div>
                <svg class="w-5 h-5 text-text-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M9 18l6-6-6-6"/>
                </svg>
              </button>
              <button data-nav="finance" class="w-full p-4 flex items-center gap-4 hover:bg-gray-50 transition-colors border-t border-border">
                <div class="w-10 h-10 bg-green-100 rounded-xl flex items-center justify-center">
                  <svg class="w-5 h-5 text-green-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <line x1="12" y1="1" x2="12" y2="23"/>
                    <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
                  </svg>
                </div>
                <div class="flex-1 text-left">
                  <div class="font-medium text-text-primary">财务规划</div>
                  <div class="text-xs text-text-muted">记账与防骗指南</div>
                </div>
                <svg class="w-5 h-5 text-text-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M9 18l6-6-6-6"/>
                </svg>
              </button>
              <button data-nav="therapist" class="w-full p-4 flex items-center gap-4 hover:bg-gray-50 transition-colors border-t border-border">
                <div class="w-10 h-10 bg-teal-100 rounded-xl flex items-center justify-center">
                  <svg class="w-5 h-5 text-teal-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                    <circle cx="9" cy="7" r="4"/>
                    <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
                    <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                  </svg>
                </div>
                <div class="flex-1 text-left">
                  <div class="font-medium text-text-primary">专业协作</div>
                  <div class="text-xs text-text-muted">周报分享与反馈</div>
                </div>
                <svg class="w-5 h-5 text-text-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M9 18l6-6-6-6"/>
                </svg>
              </button>
              <button data-nav="achievements" class="w-full p-4 flex items-center gap-4 hover:bg-gray-50 transition-colors border-t border-border">
                <div class="w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center">
                  <svg class="w-5 h-5 text-amber-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="12" cy="8" r="7"/>
                    <polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88"/>
                  </svg>
                </div>
                <div class="flex-1 text-left">
                  <div class="font-medium text-text-primary">成就徽章</div>
                  <div class="text-xs text-text-muted">${MOCK_DATA.achievements.filter(a => a.unlocked).length}/${MOCK_DATA.achievements.length} 已解锁</div>
                </div>
                <svg class="w-5 h-5 text-text-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M9 18l6-6-6-6"/>
                </svg>
              </button>
              <button data-nav="peer" class="w-full p-4 flex items-center gap-4 hover:bg-gray-50 transition-colors border-t border-border">
                <div class="w-10 h-10 bg-indigo-100 rounded-xl flex items-center justify-center">
                  <span class="text-lg">🤝</span>
                </div>
                <div class="flex-1 text-left">
                  <div class="font-medium text-text-primary">同伴联结</div>
                  <div class="text-xs text-text-muted">演示群组与家长支持入口</div>
                </div>
                <svg class="w-5 h-5 text-text-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M9 18l6-6-6-6"/>
                </svg>
              </button>
            </div>
          </div>

          <div>
            <h3 class="font-bold text-text-primary mb-3">系统</h3>
            <div class="bg-white rounded-xl card-shadow overflow-hidden">
              <button data-nav="settings" class="w-full p-4 flex items-center gap-4 hover:bg-gray-50 transition-colors">
                <div class="w-10 h-10 bg-gray-100 rounded-xl flex items-center justify-center">
                  <svg class="w-5 h-5 text-gray-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="12" cy="12" r="3"/>
                    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
                  </svg>
                </div>
                <div class="flex-1 text-left">
                  <div class="font-medium text-text-primary">设置</div>
                  <div class="text-xs text-text-muted">账号与通知</div>
                </div>
                <svg class="w-5 h-5 text-text-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M9 18l6-6-6-6"/>
                </svg>
              </button>
              <button data-ui-call="handleLogout" class="w-full p-4 flex items-center gap-4 hover:bg-gray-50 transition-colors border-t border-border">
                <div class="w-10 h-10 bg-red-100 rounded-xl flex items-center justify-center">
                  <svg class="w-5 h-5 text-red-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
                    <polyline points="16 17 21 12 16 7"/>
                    <line x1="21" y1="12" x2="9" y2="12"/>
                  </svg>
                </div>
                <div class="flex-1 text-left">
                  <div class="font-medium text-text-primary">退出登录</div>
                </div>
              </button>
            </div>
          </div>
        </div>
      `;
    }

    async function handleLogout() {
      if (!useMockMode && authenticatedSession) {
        const result = await apiRequest('/auth/logout', 'POST');
        if (!result.success) { showToast(result.error || '退出失败，请稍后重试'); return; }
      }
      localStorage.removeItem('xingban_user');
      localStorage.removeItem('xingban_token');
      token = null;
      currentUser = null;
      authenticatedSession = false;
      sessionDataMode = 'demo';
      professionalActions = [];
      reportShareRecords = [];
      strategyFeedbackHistory = [];
      document.getElementById('main-app').classList.add('hidden');
      document.getElementById('login-page').classList.remove('hidden');
      showToast('已退出登录');
    }

    function renderChildren(container) {
      document.getElementById('page-title').textContent = '孩子与记录';
      document.getElementById('page-subtitle').textContent = '每个孩子一条连续照护时间线';

      container.innerHTML = `
        <div class="p-4 space-y-4 animate-fade-in">
          <section class="rounded-2xl bg-primary text-white p-5 shadow-lg shadow-primary/15">
            <div class="flex items-start justify-between gap-4">
              <div><p class="text-xs text-white/75">儿童档案是长期归属</p><h2 class="text-xl font-bold mt-1">资料、观察与下一步放在一起</h2><p class="text-sm text-white/80 leading-6 mt-2">底部“快记”用于当下快速留痕；完整记录历史按孩子收进这里。</p></div>
              <button data-ui-call="showNewChild" class="shrink-0 px-3 py-2 rounded-xl bg-white text-primary text-sm font-bold">添加孩子</button>
            </div>
          </section>

          <div class="space-y-4">
            ${MOCK_DATA.children.map(c => {
              const records = MOCK_DATA.behaviors.filter(b => b.childName === c.name);
              const latest = records[0];
              const highAttention = records.filter(b => /自伤|自杀|死亡|幻觉|妄想|意识|走失|异常兴奋/.test(`${b.category || ''}${b.description || ''}`)).length;
              return `
              <article class="bg-white rounded-2xl border border-border overflow-hidden shadow-sm">
                <div class="p-4 flex items-start gap-3">
                  <div class="emoji-avatar bg-primary-light/30" style="font-size:24px;width:48px;height:48px">${escapeText(c.avatar)}</div>
                  <div class="min-w-0 flex-1">
                    <div class="flex items-center gap-2 flex-wrap"><h3 class="font-bold text-lg text-text-primary">${escapeText(c.name)}</h3><span class="text-xs px-2 py-0.5 bg-secondary/50 text-text-secondary rounded-full">${Number(c.age) || 0}岁</span></div>
                    <p class="text-xs text-text-muted mt-1">家庭记录情况：${escapeText(c.diagnosis || '未填写/评估中')}</p>
                  </div>
                  <button data-ui-call="showChildDetail" data-ui-args="[${Number(Number(c.id))}]" class="text-sm text-primary font-medium">照护主页</button>
                </div>
                <div class="grid grid-cols-3 border-y border-border bg-background/70">
                  <div class="p-3 text-center"><div class="font-bold text-text-primary">${records.length}</div><div class="text-[11px] text-text-muted">记录</div></div>
                  <div class="p-3 text-center border-x border-border"><div class="font-bold ${highAttention ? 'text-danger' : 'text-text-primary'}">${highAttention}</div><div class="text-[11px] text-text-muted">需核对</div></div>
                  <div class="p-3 text-center"><div class="font-bold text-text-primary">${latest ? escapeText(latest.time) : '—'}</div><div class="text-[11px] text-text-muted">最近</div></div>
                </div>
                <div class="p-3 grid grid-cols-2 gap-2">
                  <button data-ui-call="showNewRecord" data-ui-args="[${Number(Number(c.id))}]" class="py-2.5 rounded-xl bg-primary text-white text-sm font-bold">为TA快速记录</button>
                  <button data-ui-call="openChildRecords" data-ui-args="[${Number(Number(c.id))}]" class="py-2.5 rounded-xl border border-primary text-primary text-sm font-bold">查看全部记录</button>
                </div>
              </article>`;
            }).join('')}
          </div>
        </div>`;
    }

    function openChildRecords(childId) {
      recordsFilter = { search: '', childId: Number(childId) };
      navigateTo('records');
    }
    function showNewChild() {
      const modal = document.createElement('div');
      modal.className = 'fixed inset-0 bg-black/50 flex items-end justify-center z-50';
      modal.innerHTML = `
        <div class="bg-white w-full max-w-md rounded-t-3xl p-6 modal-slide safe-area-bottom">
          <div class="flex justify-between items-center mb-4">
            <h2 class="text-lg font-bold">添加孩子</h2>
            <button data-ui-action="remove-overlay" class="text-text-muted">✕</button>
          </div>
          <div class="space-y-4">
            <div>
              <label class="block text-sm text-text-secondary mb-1">昵称</label>
              <input type="text" id="child-nickname" maxlength="40" autocomplete="off" placeholder="建议使用昵称，不填写真实姓名" class="w-full px-4 py-2.5 rounded-xl border border-border">
            </div>
            <div>
              <label class="block text-sm text-text-secondary mb-1">出生日期</label>
              <input type="date" id="child-birthdate" class="w-full px-4 py-2.5 rounded-xl border border-border">
            </div>
            <div>
              <label class="block text-sm text-text-secondary mb-1">诊断类型</label>
              <select id="child-diagnosis" data-ui-change="diagnosis" class="w-full px-4 py-2.5 rounded-xl border border-border">
                <option value="UNCONFIRMED">未确诊 / 评估中</option>
                <option value="ADHD">注意力缺陷多动障碍 (ADHD)</option>
                <option value="DD">发育迟缓 (DD)</option>
                <option value="OTHER">其他</option>
              </select>
              <input id="child-other-diagnosis" class="hidden mt-2 w-full px-4 py-2.5 rounded-xl border border-border" placeholder="请填写其他情况；不确定可写“评估中”">
            </div>
            <details open class="rounded-xl border border-border p-3"><summary class="font-medium text-sm">第2步 · 当前支持需要观察（非标准量表）</summary><div class="grid grid-cols-2 gap-3 mt-3">${[['communication','沟通'],['social','社交'],['selfcare','自理'],['cognition','认知']].map(([id,label])=>`<label class="text-xs text-text-secondary">${label}水平<select id="child-${id}" class="mt-1 w-full p-2 rounded-lg border"><option value="1">1 需要全面支持</option><option value="2">2 较多支持</option><option value="3" selected>3 部分支持</option><option value="4">4 少量支持</option><option value="5">5 基本独立</option></select></label>`).join('')}</div><p class="text-xs text-text-muted mt-2">只记录家长对当前支持需要的观察，不给孩子的能力定级，也不能代替专业评估。</p></details>
            <details class="rounded-xl border border-border p-3"><summary class="font-medium text-sm">第3步 · 感官与偏好</summary><div class="space-y-3 mt-3"><label class="block text-xs">主要感官特点<select id="child-sensory" class="mt-1 w-full p-2 rounded-lg border"><option value="unknown">尚不明确</option><option value="hearing_sensitive">声音敏感</option><option value="visual_sensitive">视觉敏感</option><option value="tactile_sensitive">触觉敏感</option><option value="vestibular_seeking">寻求运动/前庭刺激</option><option value="multiple">多种特点（请在下方补充）</option></select></label><label class="block text-xs">喜欢的物品、活动或感官补充<textarea id="child-reinforcers" rows="2" class="mt-1 w-full p-2 rounded-lg border" placeholder="如：泡泡、绘本、散步；不要用剥夺基本需求作为奖励"></textarea></label></div></details>
            <label class="flex items-start gap-2 text-xs text-text-secondary"><input id="child-consent" type="checkbox" class="mt-1"><span>我确认自己具备监护或合法授权关系，并会以适龄方式告知孩子记录用途。</span></label>
            <input id="child-request-id" type="hidden" value="${newClientRequestId()}">
            <p id="child-save-status" class="text-xs text-text-muted" role="status">档案尚未保存；网络失败时内容会保留在本页。</p>
            <button id="child-save-button" data-ui-call="saveChild" class="w-full py-3 rounded-xl bg-primary text-white font-medium disabled:opacity-60">保存</button>
          </div>
        </div>
      `;
      document.body.appendChild(modal);
    }

    let childSaveInFlight = false;
    async function saveChild() {
      if (childSaveInFlight) return;
      const nickname = document.getElementById('child-nickname').value.trim();
      const birth_date = document.getElementById('child-birthdate').value;
      const diagnosis_type = document.getElementById('child-diagnosis').value;
      const otherDiagnosis = document.getElementById('child-other-diagnosis').value.trim();
      const consent = document.getElementById('child-consent').checked;
      const client_request_id = document.getElementById('child-request-id').value;
      const status = document.getElementById('child-save-status');
      const button = document.getElementById('child-save-button');

      if (!nickname || !birth_date) {
        showToast('请填写昵称和出生日期');
        return;
      }
      if (diagnosis_type === 'OTHER' && !otherDiagnosis) { showToast('请填写其他情况或“评估中”'); return; }
      if (nickname.length > 40) { showToast('昵称不能超过40字'); return; }
      const birthDateValue = new Date(`${birth_date}T00:00:00`);
      if (Number.isNaN(birthDateValue.getTime()) || birthDateValue > new Date()) { showToast('出生日期无效或晚于今天'); return; }
      if (!consent) { showToast('请先确认监护或合法授权关系'); return; }
      const profileExtras = { communication:Number(document.getElementById('child-communication').value), social:Number(document.getElementById('child-social').value), selfcare:Number(document.getElementById('child-selfcare').value), cognition:Number(document.getElementById('child-cognition').value), sensory:document.getElementById('child-sensory').value, reinforcers:document.getElementById('child-reinforcers').value.trim() };

      if (navigator.onLine === false) {
        status.textContent = '未保存：当前网络已断开；儿童资料仍保留在本页，联网后可重试。';
        showToast('当前网络已断开，儿童档案尚未保存');
        return;
      }

      childSaveInFlight = true;
      button.disabled = true;
      button.textContent = '正在保存…';
      status.textContent = '正在安全保存，请勿重复点击。';
      try {
        const sensoryPayload={sensory_hearing:profileExtras.sensory==='hearing_sensitive'?'sensitive':'unknown',sensory_visual:profileExtras.sensory==='visual_sensitive'?'sensitive':'unknown',sensory_tactile:profileExtras.sensory==='tactile_sensitive'?'sensitive':'unknown',sensory_vestibular:profileExtras.sensory==='vestibular_seeking'?'seeking':'unknown'};
        const result = await apiRequest('/child', 'POST', { client_request_id, nickname, birth_date, diagnosis_type, diagnosis_other: otherDiagnosis, communication_level: profileExtras.communication, social_level: profileExtras.social, self_care_level: profileExtras.selfcare, cognitive_level: profileExtras.cognition, ...sensoryPayload, reinforcers: profileExtras.reinforcers ? [profileExtras.reinforcers] : [] });

        if (result.success) {
          const age=Math.max(0,new Date().getFullYear()-new Date(birth_date).getFullYear()); MOCK_DATA.children.push({id:result.child?.id||Date.now(),name:nickname,age,gender:'未填写',diagnosis:diagnosis_type==='OTHER'?otherDiagnosis:diagnosis_type,avatar:'🧒',profile:profileExtras});
          showToast(result.replayed ? '该儿童档案此前已经保存' : '添加成功');
          closeTopModal();
          navigateTo('children');
        } else {
          showToast(result.error || '添加失败');
        }
      } catch (error) {
        status.textContent = `未确认保存：${error.message || '网络连接中断'}。资料仍在本页，可用相同内容重试。`;
        showToast('儿童敏感资料尚未确认保存，请保留当前页面');
      } finally {
        childSaveInFlight = false;
        const currentButton = document.getElementById('child-save-button');
        if (currentButton) { currentButton.disabled = false; currentButton.textContent = '保存'; }
      }
    }

    function showChildDetail(id) {
      const child = MOCK_DATA.children.find(c => c.id === id);
      if (!child) return;
      const supportLabel = value => ({ 1: '需要全面支持', 2: '需要较多支持', 3: '需要部分支持', 4: '需要少量支持', 5: '本次观察较独立' }[Number(value)] || '尚未记录');
      const childRecords = MOCK_DATA.behaviors.filter(item => item.childName === child.name);
      const recentRecords = childRecords.slice(0, 3);

      const modal = document.createElement('div');
      modal.className = 'fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4';
      modal.innerHTML = `
        <div class="bg-white w-full max-w-md rounded-2xl p-5 animate-fade-in max-h-[90vh] overflow-y-auto">
          <div class="flex justify-between items-start mb-4">
            <h3 class="text-lg font-bold">孩子详情</h3>
            <button data-ui-action="remove-overlay" class="text-text-muted">✕</button>
          </div>
          <div class="flex items-center gap-4 mb-6">
            <div class="emoji-avatar bg-primary-light/30" style="font-size:32px;width:64px;height:64px">${escapeText(child.avatar)}</div>
            <div>
              <div class="text-xl font-bold">${escapeText(child.name)}</div>
              <div class="text-text-muted">${escapeText(child.gender || "未填写")} · ${Number(child.age) || 0}岁</div>
            </div>
          </div>
          <div class="grid grid-cols-2 gap-2 mb-5">
            <button data-ui-call="removeOverlayThenShowNewRecord" data-ui-args="${uiArgsAttr(Number(child.id))}" data-ui-pass-this="true" class="py-3 rounded-xl bg-primary text-white font-bold">快速记录</button>
            <button data-ui-call="removeOverlayThenOpenChildRecords" data-ui-args="${uiArgsAttr(Number(child.id))}" data-ui-pass-this="true" class="py-3 rounded-xl border border-primary text-primary font-bold">全部记录</button>
          </div>
          <section class="mb-5">
            <div class="flex items-center justify-between mb-2"><h4 class="font-bold text-text-primary">近期观察</h4><span class="text-xs text-text-muted">${childRecords.length} 条</span></div>
            <div class="space-y-2">${recentRecords.length ? recentRecords.map(item => `<button data-ui-call="showRecordDetail" data-ui-args="[${Number(Number(item.id))}]" class="w-full text-left p-3 rounded-xl bg-background border border-border"><div class="flex justify-between gap-2"><span class="text-sm font-medium text-text-primary">${escapeText(item.category)}</span><span class="text-xs text-text-muted">${escapeText(item.time)}</span></div><p class="text-xs text-text-secondary mt-1 line-clamp-2">${escapeText(item.description)}</p></button>`).join('') : '<div class="p-4 rounded-xl bg-background text-sm text-text-muted">还没有记录。先写一条可观察事实，之后再一起回看。</div>'}</div>
          </section>
          <details class="rounded-xl border border-border p-3">
            <summary class="font-bold text-text-primary cursor-pointer">基础档案与支持需要</summary>
          <div class="space-y-4 mt-4">
            <div>
              <div class="text-sm text-text-muted mb-1">家庭记录情况（不代表平台诊断）</div>
              <div class="px-3 py-2 bg-secondary/30 rounded-lg text-text-primary">${escapeText(child.diagnosis || "未填写/评估中")}</div>
            </div>
            <div>
              <div class="text-sm text-text-muted mb-1">当前支持需要观察</div>
              <div class="space-y-2">
                <div class="flex justify-between text-sm">
                  <span class="text-text-secondary">沟通支持</span>
                  <span class="text-text-primary">${supportLabel(child.profile?.communication)}</span>
                </div>
                <div class="flex justify-between text-sm">
                  <span class="text-text-secondary">社交支持</span>
                  <span class="text-text-primary">${supportLabel(child.profile?.social)}</span>
                </div>
                <div class="flex justify-between text-sm">
                  <span class="text-text-secondary">日常生活支持</span>
                  <span class="text-text-primary">${supportLabel(child.profile?.selfcare)}</span>
                </div>
              </div>
            </div>
          </div>
          </details>
          <button data-ui-action="remove-overlay" class="w-full mt-4 py-3 rounded-xl bg-background text-text-secondary font-medium">关闭</button>
        </div>
      `;
      document.body.appendChild(modal);
    }

    function renderReports(container) {
      document.getElementById('page-title').textContent = '成长周报';
      document.getElementById('page-subtitle').textContent = '家庭记录周汇总';

      container.innerHTML = `
        <div class="p-4 space-y-4 animate-fade-in">
          <div class="flex justify-between items-center">
            <div><h3 class="font-bold text-text-primary">周报列表</h3><p class="text-xs text-text-muted mt-1">只汇总家庭记录，不判断进步、退步或疗效</p></div>
            <button data-ui-call="showNewReport" class="px-4 py-2 bg-primary text-white rounded-xl text-sm font-medium">
              + 生成
            </button>
          </div>

          <div class="space-y-3">
            ${MOCK_DATA.reports.map(r => `
              <div data-ui-call="showReportDetail" data-ui-args="[${Number(r.id)}]" class="bg-white p-4 rounded-xl card-shadow cursor-pointer">
                <div class="flex items-center justify-between mb-2">
                  <div class="flex items-center gap-2">
                    <span class="font-bold text-text-primary">${escapeText(r.week)}</span>
                    <span class="text-xs px-2 py-0.5 bg-secondary/50 text-text-secondary rounded-full">${escapeText(r.childName)}</span>
                  </div>
                  <span class="text-xs text-text-muted">${r.records}条记录</span>
                </div>
                <div class="flex items-center gap-2 mb-2">
                  <span class="week-dot ${r.emotion === 'positive' ? 'bg-success' : r.emotion === 'negative' ? 'bg-danger' : 'bg-primary'}"></span>
                  <span class="text-xs text-text-secondary">${r.emotion === 'positive' ? '记录含积极标签' : r.emotion === 'negative' ? '记录含高强度标签' : '未见高强度标签'}</span>
                </div>
                <p class="text-sm text-text-secondary line-clamp-2">${escapeText(r.aiComment)}</p>
              </div>
            `).join('')}
          </div>
        </div>
      `;
    }

    function showNewReport() {
      const modal = document.createElement('div');
      modal.className = 'fixed inset-0 bg-black/50 flex items-end justify-center z-50';
      modal.innerHTML = `
        <div class="bg-white w-full max-w-md rounded-t-3xl p-6 modal-slide safe-area-bottom">
          <div class="flex justify-between items-center mb-4">
            <h2 class="text-lg font-bold">生成周报</h2>
            <button data-ui-action="remove-overlay" class="text-text-muted">✕</button>
          </div>
          <div class="space-y-4">
            <div>
              <label class="block text-sm text-text-secondary mb-1">选择儿童</label>
              <select id="report-child" class="w-full px-4 py-2.5 rounded-xl border border-border">
                ${MOCK_DATA.children.map(c => `<option value="${c.id}">${c.name}</option>`).join('')}
              </select>
            </div>
            <div>
              <label class="block text-sm text-text-secondary mb-1">周范围</label>
              <div class="flex gap-2" id="report-week-group">
                <button data-ui-call="setReportWeek" data-ui-args='["this_week"]' data-ui-pass-this="true" class="flex-1 py-2 rounded-lg bg-primary text-white text-sm">本周</button>
                <button data-ui-call="setReportWeek" data-ui-args='["last_week"]' data-ui-pass-this="true" class="flex-1 py-2 rounded-lg border border-border text-text-secondary text-sm">上周</button>
              </div>
              <input type="hidden" id="report-week" value="this_week">
            </div>
            <button data-ui-call="generateReport" class="w-full py-3 rounded-xl bg-primary text-white font-medium">生成周报</button>
          </div>
        </div>
      `;
      document.body.appendChild(modal);
    }

    function setReportWeek(week, btn) {
      document.getElementById('report-week').value = week;
      document.querySelectorAll('#report-week-group button').forEach(b => {
        b.className = 'flex-1 py-2 rounded-lg border border-border text-text-secondary text-sm';
      });
      btn.className = 'flex-1 py-2 rounded-lg bg-primary text-white text-sm';
    }

    async function generateReport() {
      const child_id = parseInt(document.getElementById('report-child').value);
      const week_range = document.getElementById('report-week').value;

      try {
        const result = await apiRequest(`/report/generate/${child_id}`, 'POST', { week_range });

        if (result.success) {
          const child = MOCK_DATA.children.find(item => item.id === child_id);
          const childName = child?.name || '孩子';
          const records = MOCK_DATA.behaviors.filter(item => item.childName === childName);
          const serverContent = result.report?.content || {};
          const totalRecords = Number(serverContent.summary?.total_records ?? records.length);
          const feedbackCount = Array.isArray(serverContent.strategy_effectiveness)
            ? serverContent.strategy_effectiveness.reduce((sum, item) => sum + Number(item.count || 0), 0)
            : 0;
          const generated = {
            id: result.report?.id || Date.now(),
            week: week_range === 'last_week' ? '上周' : '本周',
            childName,
            records: totalRecords,
            emotion: Number(serverContent.summary?.high_intensity_count || 0) > 0 ? 'negative' : 'neutral',
            aiComment: totalRecords ? `共汇总 ${totalRecords} 条家庭记录和 ${feedbackCount} 次策略反馈，请核对后再分享。` : '本周暂无记录，报告仅展示基础信息。',
            serverContent
          };
          MOCK_DATA.reports = [generated, ...MOCK_DATA.reports.filter(item => item.id !== generated.id)];
          showToast('周报生成成功！');
          closeTopModal();
          navigateTo('reports');
          setTimeout(() => showReportDetail(generated.id), 0);
        } else {
          showToast(result.error || '生成失败');
        }
      } catch (error) {
        console.error('生成周报失败:', error);
        showToast('网络错误');
      }
    }

    function getReportFeedbackCount(report) {
      if (Array.isArray(report.serverContent?.strategy_effectiveness)) return report.serverContent.strategy_effectiveness.reduce((sum, item) => sum + Number(item.count || 0), 0);
      const child = MOCK_DATA.children.find(item => item.name === report.childName);
      return strategyFeedbackHistory.filter(item => Number(item.childId) === Number(child?.id)).length;
    }
    function showReportDetail(id) {
      const report = MOCK_DATA.reports.find(r => r.id === id);
      if (!report) return;
      const childRecords = MOCK_DATA.behaviors.filter(item => !item.childName || item.childName === report.childName);
      const highRisk = childRecords.filter(item => /自伤|自杀|死亡|幻觉|妄想|意识|服药过量|异常兴奋/.test(`${item.category || ''}${item.content || ''}`));
      const healthChanges = childRecords.filter(item => item.sleep_hours || item.energy_level || item.medical_event);

      const modal = document.createElement('div');
      modal.className = 'print-report fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4';
      modal.innerHTML = `
        <div class="print-sheet bg-white w-full max-w-sm rounded-2xl p-6 animate-fade-in max-h-[80vh] overflow-y-auto">
          <div class="print-only mb-4">
            <div class="text-base font-bold">星伴 · 成长周报</div>
            <div class="text-xs mt-1">${escapeText(report.childName)} · ${escapeText(report.week)} · 本周共 ${report.records} 条家庭记录</div>
            <div class="text-[11px] mt-1 leading-5">本页由星伴按家长自己的记录整理，<strong>不构成诊断或用药建议</strong>；下方教材章节为延伸阅读，不是本页结论的依据。</div>
          </div>
          <div class="flex justify-between items-start mb-4 no-print">
            <h3 class="text-lg font-bold">${escapeText(report.week)}周报</h3>
            <div class="flex gap-2 shrink-0">
              <button data-ui-action="print" class="px-3 py-2 rounded-xl bg-primary text-white text-xs font-bold">打印这一页</button>
              <button data-ui-action="remove-overlay" class="text-text-muted" aria-label="关闭">✕</button>
            </div>
          </div>
          <div class="space-y-4">
            <div>
              <div class="text-sm text-text-muted mb-1">孩子</div>
              <div class="font-medium">${escapeText(report.childName)}</div>
            </div>
            <div>
              <div class="text-sm text-text-muted mb-2">记录统计</div>
              <div class="flex gap-4">
                <div class="flex-1 bg-primary-light/30 rounded-xl p-3 text-center">
                  <div class="text-xl font-bold text-primary">${report.records}</div>
                  <div class="text-xs text-text-muted">本周记录</div>
                </div>
                <div class="flex-1 bg-secondary/30 rounded-xl p-3 text-center">
                  <div class="text-xl font-bold text-text-primary">${getReportFeedbackCount(report)}</div>
                  <div class="text-xs text-text-muted">策略反馈</div>
                </div>
              </div>
            </div>
            <div class="rounded-xl bg-background p-3">
              <div class="text-sm font-medium text-text-primary">趋势说明</div>
              <p class="text-xs text-text-muted mt-1">当前版本不使用静态图形推断情绪趋势；请以记录明细和专业评估为准。</p>
            </div>
            <div>
              <div class="text-sm text-text-muted mb-1">家庭观察自动摘要</div>
              <p class="text-text-primary">${escapeText(report.aiComment)}</p>
              <p class="text-xs text-text-muted mt-2">数据来源：家庭记录 · ${escapeText(report.week)} · 自动整理且未经专业复核，不构成诊断或用药建议。</p>
            </div>
            <div class="rounded-xl bg-amber-50 border border-amber-200 p-3">
              <div class="text-sm font-bold text-amber-900 mb-2">就医沟通重点（请家长核对）</div>
              <p class="text-sm text-amber-900/80">高风险相关记录：${highRisk.length} 条；含睡眠、精力或就医/用药事件：${healthChanges.length} 条。</p>
              <p class="text-xs text-amber-800 mt-2">若当前存在即时危险，请先进入紧急支持并联系 120/110，不要等待周报。</p>
            </div>
            <div>
              <div class="text-sm text-text-muted mb-1">下次沟通建议</div>
              <p class="text-text-secondary text-sm">从原始记录中选一个最希望专业人员回答的问题，并确认下一步的目标、执行人、停止条件和复查日期。</p>
            </div>
            <div id="report-kb-ref" class="rounded-xl bg-white border border-border p-3"></div>
            <div class="flex gap-2 no-print">
              <button data-ui-call="removeOverlayThenShareReport" data-ui-args="${uiArgsAttr(Number(report.id))}" data-ui-pass-this="true" class="flex-1 py-2 rounded-lg bg-primary text-white text-sm font-medium">分享给专业人员</button>
            </div>
            <div class="print-only text-[11px] mt-4 pt-3 border-t border-border leading-5">
              星伴 · 家庭记录汇总 · ${escapeText(report.childName)} · ${escapeText(report.week)}。若当前存在即时危险，请先联系 120/110，不要等待周报。
            </div>
          </div>
        </div>
      `;
      document.body.appendChild(modal);
      loadReportKbRef(report, childRecords);
    }

    /**
     * 周报里的「本周记录相关的教材章节」。
     * 依据是**本周记录里出现最多的分类**（不是周报正文、也不是模型猜的主题），
     * 每条都写清是「讲到该行为的具体章节」还是「同一类问题的通用章节」。
     * 周报本身只汇总记录、不判断进步退步，所以这里的章节同样只是延伸阅读，不是结论依据。
     */
    async function loadReportKbRef(report, records) {
      const box = document.getElementById('report-kb-ref');
      if (!box) return;
      const freq = {};
      (records || []).forEach(r => {
        const c = r.category;
        if (c && RECORD_KB_SCENE[c] && RECORD_KB_KEYWORDS[c]) freq[c] = (freq[c] || 0) + 1;
      });
      const cats = Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([c]) => c);
      if (!cats.length) { box.innerHTML = ''; return; }
      let html = '<div class="text-sm font-bold text-text-primary mb-2">本周记录相关的教材章节</div>';
      if (cats.some(c => RECORD_HIGH_RISK.includes(c))) html += kbSafetyNoticeHtml();
      html += '<p class="text-xs text-text-muted mb-2">按本周记录里出现最多的分类去找的<strong>延伸阅读</strong>，不是周报结论的依据；周报只汇总家庭记录、不做判断。</p>';
      box.innerHTML = html + '<p class="text-xs text-text-muted">正在找…</p>';
      try {
        for (const cat of cats) {
          const res = await kbRefsForCategory(cat, { limit: 2 });
          html += `<div class="text-xs font-bold text-text-primary mt-3">${escapeText(cat)}<span class="font-normal text-text-muted"> · 本周 ${freq[cat]} 条</span></div>`;
          if (!res.list.length) {
            html += '<p class="text-xs text-text-muted">教材里暂时没有贴近的章节。</p>';
            continue;
          }
          html += `<p class="text-[11px] text-text-muted">${res.grade === 'direct' ? '教材里讲到这些具体表现的章节' : '同一类问题的通用章节（教材里没有专门讲这些具体表现的章节）'}</p>` + kbRefListHtml(res.list);
        }
        box.innerHTML = html;
      } catch (e) {
        box.innerHTML = html + '<p class="text-xs text-text-muted">知识库暂时取不到相关内容，稍后再试。</p>';
      }
    }

    async function shareReport(reportId) {
      // 打开分享给专业人员的弹窗
      showShareToTherapistModal(reportId);
    }

    function showShareToTherapistModal(reportId) {
      const report = MOCK_DATA.reports.find(r => r.id === reportId);
      const therapists = MOCK_DATA.therapists;

      const modal = document.createElement('div');
      modal.className = 'fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4';
      modal.innerHTML = `
        <div class="bg-white w-full max-w-sm rounded-2xl p-6 animate-fade-in max-h-[80vh] overflow-y-auto">
          <div class="flex justify-between items-start mb-4">
            <h3 class="text-lg font-bold">分享给专业人员</h3>
            <button data-ui-action="remove-overlay" class="text-text-muted">✕</button>
          </div>
          <div class="space-y-4">
            <div>
              <div class="text-sm text-text-muted mb-2">选择已核验的专业人员</div>
              <div class="space-y-2">
                ${therapists.map(t => `
                  <label class="flex items-center gap-3 p-3 rounded-xl border border-border hover:bg-gray-50 cursor-pointer">
                    <input type="radio" name="share-therapist" value="${t.id}" class="text-primary" ${t.id === 1 ? 'checked' : ''}>
                    <span class="text-2xl">${t.avatar}</span>
                    <div class="flex-1">
                      <div class="font-medium text-text-primary">${escapeText(t.name)}</div>
                      <div class="text-xs text-text-muted">${escapeText(t.title)} · ${escapeText(t.specialty)}</div>
                    </div>
                  </label>
                `).join('')}
              </div>
            </div>
            <div>
              <div class="text-sm text-text-muted mb-2">备注</div>
              <textarea id="share-note" rows="3" class="w-full p-3 rounded-xl border border-border text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/50" placeholder="添加备注，如需要重点关注的方向..."></textarea>
            </div>
            <div class="rounded-xl bg-background p-3 space-y-2">
              <div class="text-sm font-medium">选择分享范围</div>
              <label class="flex gap-2 text-sm"><input type="checkbox" name="share-scope" value="summary" checked> 周报摘要与趋势</label>
              <label class="flex gap-2 text-sm"><input type="checkbox" name="share-scope" value="risk"> 高风险与危机相关记录</label>
              <label class="flex gap-2 text-sm"><input type="checkbox" name="share-scope" value="medical"> 睡眠、用药和就医事件</label>
              <label class="block text-sm pt-1">访问有效期<select id="share-expiry" class="ml-2 p-2 rounded-lg border border-border"><option value="7">7 天</option><option value="30">30 天</option><option value="1">1 天</option></select></label>
            </div>
            <label class="flex items-start gap-2 text-sm text-text-secondary"><input id="share-consent" type="checkbox" class="mt-1"><span>我已核对接收者、分享范围和有效期，并明确授权本次分享。可在专业协作页查看并撤销。</span></label>
            <input id="share-request-id" type="hidden" value="${newClientRequestId()}">
            <p id="share-save-status" class="text-xs text-text-muted" role="status">尚未创建授权。网络失败时可保留本页直接重试。</p>
            <button id="share-save-button" data-ui-call="confirmShareReport" data-ui-args="[${Number(reportId)}]" class="w-full py-3 rounded-xl bg-primary text-white font-medium disabled:opacity-60">确认分享</button>
          </div>
        </div>
      `;
      document.body.appendChild(modal);
    }

    let reportShareInFlight=false;
    async function confirmShareReport(reportId) {
      if(reportShareInFlight)return;
      const therapistInput = document.querySelector('input[name="share-therapist"]:checked');
      const note = document.getElementById('share-note')?.value || '';
      const consent = document.getElementById('share-consent')?.checked;
      const scope = [...document.querySelectorAll('input[name="share-scope"]:checked')].map(item => item.value);
      const expiresDays = Number(document.getElementById('share-expiry')?.value || 7);
      if (!therapistInput) {
        showToast('请选择已核验的专业人员');
        return;
      }
      if (!scope.length) { showToast('请至少选择一项分享内容'); return; }
      if (!consent) { showToast('请先核对并确认本次授权'); return; }
      if(!useMockMode&&navigator.onLine===false){const status=document.getElementById('share-save-status');if(status)status.textContent='未分享：当前网络已断开，联网后可直接重试。';showToast('当前网络已断开，周报尚未分享');return}
      const therapistId = parseInt(therapistInput.value);
      const clientRequestId=document.getElementById('share-request-id')?.value;
      const saveButton=document.getElementById('share-save-button'),saveStatus=document.getElementById('share-save-status');reportShareInFlight=true;if(saveButton){saveButton.disabled=true;saveButton.textContent='正在创建授权…'}if(saveStatus)saveStatus.textContent='正在创建授权，请勿关闭页面或重复点击。';
      try {
        const result = await apiRequest('/therapist/share', 'POST', { report_id: reportId, therapist_id: therapistId, client_request_id: clientRequestId, note, scope, expires_days: expiresDays });
        if (result.success) {
          const therapist = MOCK_DATA.therapists.find(item => Number(item.id) === therapistId);
          if(!reportShareRecords.some(item=>Number(item.id)===Number(result.share.id)))reportShareRecords.unshift({ ...result.share, report_id: reportId, therapist_id: therapistId, therapist_name: therapist?.name || `专业人员 #${therapistId}`, note, scope, expires_at: result.share.expires_at||new Date(Date.now() + expiresDays * 86400000).toISOString(), revoked_at: result.share.revoked_at||null, created_at: new Date().toISOString() });
          showToast(result.replayed?'该周报授权此前已创建，未重复分享':'周报已分享给专业人员');
          closeTopModal();
        } else {
          if(saveStatus)saveStatus.textContent=`未分享：${result.error||'服务拒绝创建授权'}。内容仍在本页，可重试。`;
          showToast(result.error || '分享失败');
        }
      } catch (error) {
        console.error('分享失败:', error);
        if(saveStatus)saveStatus.textContent='未分享：网络连接中断。内容仍在本页，联网后可重试。';
        showToast('网络连接中断，周报尚未分享');
      } finally {
        reportShareInFlight=false;const button=document.getElementById('share-save-button');if(button){button.disabled=false;button.textContent='确认分享'}
      }
    }

    async function revokeReportShare(shareId) {
      const result = await apiRequest(`/therapist/shares/${Number(shareId)}`, 'DELETE');
      if (!result.success) { showToast(result.error || '授权撤销失败'); return; }
      const item = reportShareRecords.find(share => Number(share.id) === Number(shareId));
      if (item) item.revoked_at = new Date().toISOString();
      showToast('周报授权已撤销');
      renderTherapist(document.getElementById('main-content'));
    }

    function escapeText(value) {
      return String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
    }

    function uiArgsAttr(...values) {
      return escapeText(JSON.stringify(values));
    }

    function getProfessionalRoute(concern) {
      const routes = {
        behavior:{role:'发育行为儿科 / 行为支持专业人员',reason:'先排查身体、沟通和环境因素，再做功能性行为评估'},
        mood:{role:'儿童精神科 / 儿童临床心理',reason:'评估持续低落、焦虑、易激惹、异常兴奋及自伤风险'},
        sleep:{role:'儿科 / 儿童精神科',reason:'排查疼痛、呼吸、作息、药物和情绪发作相关变化'},
        communication:{role:'言语语言治疗师',reason:'评估理解、表达、社交沟通和AAC支持需要'},
        sensory:{role:'作业治疗师 / 发育行为儿科',reason:'评估感官、动作、日常参与及身体原因'},
        feeding:{role:'儿科 + 营养/吞咽团队',reason:'先排除营养、胃肠、口腔运动和吞咽风险'},
        school:{role:'特教老师 / 学校支持团队',reason:'把家庭目标转化为课堂、同伴和环境支持'},
        medication:{role:'开药医生 / 儿童精神科',reason:'核对药名、剂量、时间、漏服和不良反应；不要自行调整'}
      };
      return routes[concern] || routes.behavior;
    }

    function showProfessionalIntake() {
      const modal=document.createElement('div');modal.className='fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-3';
      modal.innerHTML=`<div class="bg-white w-full max-w-2xl rounded-2xl max-h-[94vh] overflow-y-auto p-5 sm:p-6">
        <div class="flex justify-between gap-3"><div><h2 class="text-xl font-bold">AI会前问题整理</h2><p class="text-sm text-text-secondary mt-1">把零散观察整理成专业人员容易快速理解的摘要；不诊断、不推荐药物。</p></div><button data-ui-action="close-top-modal" aria-label="关闭问题整理" class="w-10 h-10 rounded-full bg-background">✕</button></div>
        <label class="mt-5 flex gap-3 p-4 rounded-xl bg-red-50 border border-red-200"><input id="pro-danger" type="checkbox" class="mt-1 w-5 h-5 accent-red-700"><span><strong class="block text-red-800">现在无法保证安全，或我不确定</strong><span class="text-sm text-red-900">自伤/伤人、自杀计划、意识异常、服药过量、严重不良反应或真实走失。</span></span></label>
        <div class="grid sm:grid-cols-2 gap-4 mt-5">
          <label class="text-sm font-bold">主要问题<select id="pro-concern" class="mt-2 w-full p-3 rounded-xl border bg-white"><option value="behavior">行为突然变化/频繁爆发</option><option value="mood">低落、焦虑、易激惹或异常兴奋</option><option value="sleep">睡眠变化</option><option value="communication">沟通与表达</option><option value="sensory">感官与日常参与</option><option value="feeding">进食、营养或吞咽</option><option value="school">学校学习与同伴</option><option value="medication">药物、漏服或不良反应</option></select></label>
          <label class="text-sm font-bold">持续多久<input id="pro-duration" maxlength="40" class="mt-2 w-full p-3 rounded-xl border" placeholder="如：5天；最近两周"></label>
          <label class="text-sm font-bold">频率或强度<input id="pro-frequency" maxlength="80" class="mt-2 w-full p-3 rounded-xl border" placeholder="如：每天2次，每次约20分钟"></label>
          <label class="text-sm font-bold">与平时相比<input id="pro-baseline" maxlength="80" class="mt-2 w-full p-3 rounded-xl border" placeholder="如：睡眠从9小时降到4小时"></label>
        </div>
        <label class="block mt-4 text-sm font-bold">发生前后与可能诱因<textarea id="pro-context" rows="3" maxlength="300" class="mt-2 w-full p-3 rounded-xl border" placeholder="疼痛/便秘、噪声、活动转换、学校事件、睡眠或用药变化；行为后发生了什么"></textarea></label>
        <label class="block mt-4 text-sm font-bold">已经尝试过什么，孩子如何反应<textarea id="pro-tried" rows="3" maxlength="300" class="mt-2 w-full p-3 rounded-xl border" placeholder="写具体步骤、持续时间、变好/无变化/更糟及不适反应"></textarea></label>
        <label class="block mt-4 text-sm font-bold">药物、补充剂和近期变化<textarea id="pro-meds" rows="2" maxlength="240" class="mt-2 w-full p-3 rounded-xl border" placeholder="药名、剂量、服用时间、漏服、调整日期；没有可写“无”"></textarea></label>
        <label class="block mt-4 text-sm font-bold">这次最想得到什么帮助<textarea id="pro-question" rows="2" maxlength="200" class="mt-2 w-full p-3 rounded-xl border" placeholder="如：先排查哪些身体原因？家庭和学校下一周统一做哪一步？"></textarea></label>
        <p class="text-xs text-text-muted mt-3">内容仅保存在当前标签页。生成前请去掉真实姓名、学校、住址和身份证等非必要信息。</p>
        <button data-ui-call="generateProfessionalBrief" class="w-full mt-5 py-3 rounded-xl bg-primary text-white font-bold">生成会前沟通单</button>
      </div>`;document.body.appendChild(modal);
    }

    function generateProfessionalBrief() {
      if(document.getElementById('pro-danger')?.checked){closeTopModal();navigateTo('emergency');return;}
      const concern=document.getElementById('pro-concern')?.value||'behavior';
      const read=id=>document.getElementById(id)?.value.trim()||'未记录';
      const question=read('pro-question');
      if(question==='未记录'){showToast('请写下这次最想得到的帮助');return;}
      const route=getProfessionalRoute(concern);
      const brief={concern,role:route.role,reason:route.reason,duration:read('pro-duration'),frequency:read('pro-frequency'),baseline:read('pro-baseline'),context:read('pro-context'),tried:read('pro-tried'),meds:read('pro-meds'),question,createdAt:new Date().toISOString()};
      sessionStorage.setItem('xingban_professional_brief',JSON.stringify(brief));closeTopModal();renderTherapist(document.getElementById('main-content'));showToast('会前沟通单已生成，请核对后再分享');
    }

    function getProfessionalBrief(){try{return JSON.parse(sessionStorage.getItem('xingban_professional_brief')||'null')}catch(_){return null}}
    async function copyProfessionalBrief(){const b=getProfessionalBrief();if(!b)return;const text=`建议联系：${b.role}\n主要原因：${b.reason}\n持续时间：${b.duration}\n频率/强度：${b.frequency}\n与平时相比：${b.baseline}\n前后情境：${b.context}\n已尝试及反应：${b.tried}\n药物与变化：${b.meds}\n本次核心问题：${b.question}`;try{await navigator.clipboard.writeText(text);showToast('已复制，请通过安全渠道发送')}catch(_){showToast('当前浏览器不允许复制，请手动选择文字')}}
    function clearProfessionalBrief(){sessionStorage.removeItem('xingban_professional_brief');renderTherapist(document.getElementById('main-content'));showToast('当前标签页中的沟通单已清除')}
    function showProfessionalPlanEditor(feedbackId,suggestionIndex){
      const feedback=MOCK_DATA.therapistFeedback.find(item=>item.id===feedbackId);
      const suggestion=feedback?.suggestions?.[suggestionIndex];
      if(!suggestion)return;
      const modal=document.createElement('div');modal.className='fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-[70] p-0 sm:p-4';modal.dataset.modal='true';
      modal.innerHTML=`<div class="bg-white w-full max-w-lg rounded-t-3xl sm:rounded-2xl p-5 max-h-[92vh] overflow-y-auto"><div class="flex justify-between gap-3"><div><div class="text-xs font-bold text-primary">建议 → 可执行计划</div><h2 class="text-lg font-bold mt-1">先补全，再开始</h2></div><button data-ui-action="close-top-modal" aria-label="关闭">✕</button></div><p class="mt-3 p-3 rounded-xl bg-background text-sm">${escapeText(suggestion)}</p><div class="grid gap-3 mt-4"><label class="text-sm font-medium">计划标题<input id="plan-title" maxlength="200" value="${escapeText(suggestion)}" class="mt-1 w-full p-3 rounded-xl border border-border"></label><label class="text-sm font-medium">希望看到的具体变化<textarea id="plan-goal" maxlength="500" rows="2" placeholder="例如：孩子能在情绪升级前用卡片表达暂停" class="mt-1 w-full p-3 rounded-xl border border-border"></textarea></label><label class="text-sm font-medium">频率与使用情境<input id="plan-frequency" maxlength="200" placeholder="例如：每天一次，在平静时练习" class="mt-1 w-full p-3 rounded-xl border border-border"></label><label class="text-sm font-medium">谁来执行<input id="plan-owner" maxlength="100" placeholder="例如：家长；学校老师确认后参与" class="mt-1 w-full p-3 rounded-xl border border-border"></label><label class="text-sm font-medium">停止并求助的条件<textarea id="plan-stop" maxlength="500" rows="2" placeholder="例如：孩子明显不适、冲突升级或出现安全风险" class="mt-1 w-full p-3 rounded-xl border border-border"></textarea></label><label class="text-sm font-medium">复核日期<input id="plan-review" type="date" class="mt-1 w-full p-3 rounded-xl border border-border"></label></div><label class="flex gap-2 mt-4 text-sm text-text-secondary"><input id="plan-confirmed" type="checkbox" class="mt-1"><span>这项计划已经与具备相应资质的专业人员确认；未确认时只保存为“待确认”，不自动开始。</span></label><input id="plan-request-id" type="hidden" value="${newClientRequestId()}"><p id="plan-save-status" class="mt-3 text-xs text-text-muted" role="status">尚未保存。网络失败时内容会保留在本页，可直接重试。</p><button id="plan-save-button" data-ui-call="saveProfessionalAction" data-ui-args="${uiArgsAttr(Number(Number(feedbackId)),Number(Number(suggestionIndex)))}" class="w-full mt-4 py-3 rounded-xl bg-primary text-white font-bold disabled:opacity-60">保存计划</button></div>`;
      document.body.appendChild(modal);
    }

    let professionalPlanSaveInFlight=false;
    async function saveProfessionalAction(feedbackId,suggestionIndex){
      if(professionalPlanSaveInFlight)return;
      const feedback=MOCK_DATA.therapistFeedback.find(item=>item.id===feedbackId);
      const suggestion=feedback?.suggestions?.[suggestionIndex];if(!suggestion)return;
      const data={client_request_id:document.getElementById('plan-request-id')?.value,source_feedback_id:feedbackId,title:document.getElementById('plan-title')?.value.trim(),goal:document.getElementById('plan-goal')?.value.trim(),frequency:document.getElementById('plan-frequency')?.value.trim(),responsible_person:document.getElementById('plan-owner')?.value.trim(),stop_conditions:document.getElementById('plan-stop')?.value.trim(),review_date:document.getElementById('plan-review')?.value||null,status:document.getElementById('plan-confirmed')?.checked?'active':'pending_confirmation'};
      if(!data.title){showToast('请填写计划标题');return} if(data.status==='active'&&(!data.goal||!data.frequency||!data.responsible_person||!data.stop_conditions||!data.review_date)){showToast('开始计划前请补全目标、频率、执行人、停止条件和复核日期');return}
      if(!useMockMode&&navigator.onLine===false){document.getElementById('plan-save-status').textContent='未保存：当前网络已断开，联网后可直接重试。';showToast('当前网络已断开，计划尚未保存');return}const button=document.getElementById('plan-save-button'),status=document.getElementById('plan-save-status');professionalPlanSaveInFlight=true;button.disabled=true;button.textContent='正在保存…';status.textContent='正在保存计划、审计记录和站内通知。';try{const result=await apiRequest('/therapist/plans','POST',data);if(!result.success)throw new Error(result.error||'保存失败');if(!professionalActions.some(item=>Number(item.id)===Number(result.plan.id)))professionalActions.unshift({...result.plan,suggestion,status:data.status,createdAt:new Date().toISOString()});professionalActions=professionalActions.slice(0,100);if(useMockMode)sessionStorage.setItem('xingban_professional_actions',JSON.stringify(professionalActions));closeTopModal();showToast(result.replayed?'该计划此前已保存，未重复创建':data.status==='active'?'计划已保存并标记为已确认':'已保存为待确认计划');renderTherapist(document.getElementById('main-content'))}catch(error){status.textContent=`未保存：${error.message||'网络连接中断'}。内容仍在本页，可重试。`;showToast(error.message||'计划尚未保存')}finally{professionalPlanSaveInFlight=false;const current=document.getElementById('plan-save-button');if(current){current.disabled=false;current.textContent='保存计划'}}
    }

    function showManualProfessionalPlanEditor() {
      if (currentUser?.role !== 'parent') return;
      const options = MOCK_DATA.therapists.map(item => `<option value="${Number(item.id)}">${escapeText(item.name)} · ${escapeText(item.title)}</option>`).join('');
      const modal=document.createElement('div');modal.className='modal-backdrop';modal.dataset.modal='true';
      modal.innerHTML=`<div class="modal-content max-w-xl"><div class="p-5 border-b border-border flex justify-between gap-3"><div><h2 class="text-lg font-bold">提交协作计划</h2><p class="text-xs text-text-muted mt-1">指定专业人员后，必须由对方账号确认，家长才能开始执行</p></div><button data-ui-action="close-top-modal" aria-label="关闭">✕</button></div><div class="p-5 grid gap-3"><label class="text-sm font-medium">接收专业人员<select id="manual-plan-therapist" class="mt-1 w-full p-3 rounded-xl border border-border bg-white"><option value="">暂不指定，仅保存草稿</option>${options}</select></label><label class="text-sm font-medium">计划标题<input id="manual-plan-title" maxlength="200" class="mt-1 w-full p-3 rounded-xl border border-border"></label><label class="text-sm font-medium">具体目标<textarea id="manual-plan-goal" maxlength="500" rows="2" class="mt-1 w-full p-3 rounded-xl border border-border"></textarea></label><label class="text-sm font-medium">频率与情境<input id="manual-plan-frequency" maxlength="200" class="mt-1 w-full p-3 rounded-xl border border-border"></label><label class="text-sm font-medium">执行人<input id="manual-plan-owner" maxlength="100" class="mt-1 w-full p-3 rounded-xl border border-border"></label><label class="text-sm font-medium">停止并求助条件<textarea id="manual-plan-stop" maxlength="500" rows="2" class="mt-1 w-full p-3 rounded-xl border border-border"></textarea></label><label class="text-sm font-medium">复核日期<input id="manual-plan-review" type="date" class="mt-1 w-full p-3 rounded-xl border border-border"></label><input id="manual-plan-request-id" type="hidden" value="${newClientRequestId()}"><p id="manual-plan-save-status" class="text-xs text-text-muted" role="status">尚未提交。失败时内容会保留在本页。</p><button id="manual-plan-save-button" data-ui-call="saveManualProfessionalPlan" class="mt-2 py-3 rounded-xl bg-primary text-white font-bold disabled:opacity-60">提交计划</button></div></div>`;
      document.body.appendChild(modal);
    }

    async function saveManualProfessionalPlan() {
      if(professionalPlanSaveInFlight)return;
      const therapistId=Number(document.getElementById('manual-plan-therapist')?.value)||null;
      const data={client_request_id:document.getElementById('manual-plan-request-id')?.value,therapist_id:therapistId,title:document.getElementById('manual-plan-title')?.value.trim(),goal:document.getElementById('manual-plan-goal')?.value.trim(),frequency:document.getElementById('manual-plan-frequency')?.value.trim(),responsible_person:document.getElementById('manual-plan-owner')?.value.trim(),stop_conditions:document.getElementById('manual-plan-stop')?.value.trim(),review_date:document.getElementById('manual-plan-review')?.value||null,status:'pending_confirmation'};
      if(!data.title||!data.goal||!data.frequency||!data.responsible_person||!data.stop_conditions||!data.review_date){showToast('请补全标题、目标、频率、执行人、停止条件和复核日期');return}
      const status=document.getElementById('manual-plan-save-status'),button=document.getElementById('manual-plan-save-button');if(!useMockMode&&navigator.onLine===false){status.textContent='未提交：当前网络已断开，联网后可直接重试。';showToast('当前网络已断开，计划尚未提交');return}professionalPlanSaveInFlight=true;button.disabled=true;button.textContent='正在提交…';status.textContent='正在原子保存计划、审计记录和站内通知。';try{const result=await apiRequest('/therapist/plans','POST',data);if(!result.success)throw new Error(result.error||'计划提交失败');if(!professionalActions.some(item=>Number(item.id)===Number(result.plan.id)))professionalActions.unshift(result.plan);closeTopModal();showToast(result.replayed?'该计划此前已保存，未重复创建':therapistId?'已提交专业人员确认':'草稿已保存，尚未请求专业确认');renderTherapist(document.getElementById('main-content'))}catch(error){status.textContent=`未提交：${error.message||'网络连接中断'}。内容仍在本页，可重试。`;showToast(error.message||'计划尚未提交')}finally{professionalPlanSaveInFlight=false;const current=document.getElementById('manual-plan-save-button');if(current){current.disabled=false;current.textContent='提交计划'}}
    }

    function showPlanReviewModal(index, decision) {
      const plan=professionalActions[index];if(!plan||currentUser?.role!=='therapist')return;
      const returning=decision==='returned';
      const modal=document.createElement('div');modal.className='modal-backdrop';modal.dataset.modal='true';
      modal.innerHTML=`<div class="modal-content max-w-lg p-5"><div class="flex justify-between"><h2 class="text-lg font-bold">${returning?'退回计划修改':'确认计划内容'}</h2><button data-ui-action="close-top-modal" aria-label="关闭">✕</button></div><div class="mt-4 p-3 rounded-xl bg-background text-sm"><strong>${escapeText(plan.title)}</strong><div class="mt-2">目标：${escapeText(plan.goal||'未填写')}</div><div>频率：${escapeText(plan.frequency||'未填写')}</div><div>停止条件：${escapeText(plan.stop_conditions||'未填写')}</div></div><label class="block mt-4 text-sm font-medium">${returning?'需要家长修改的具体内容':'专业备注（可选）'}<textarea id="plan-review-note" maxlength="1000" rows="3" class="mt-1 w-full p-3 rounded-xl border border-border"></textarea></label><button data-ui-call="submitPlanReview" data-ui-args="${uiArgsAttr(Number(index),'${decision}')}" class="w-full mt-4 py-3 rounded-xl ${returning?'bg-amber-600':'bg-success'} text-white font-bold">${returning?'退回家长修改':'确认本版本'}</button><p class="text-xs text-text-muted mt-3">操作会记录账号、角色、时间和备注；确认不等于替家长决定开始，也不能替代医疗处方。</p></div>`;
      document.body.appendChild(modal);
    }

    async function submitPlanReview(index, decision) {
      const plan=professionalActions[index];const note=document.getElementById('plan-review-note')?.value.trim()||'';
      if(decision==='returned'&&note.length<5){showToast('请具体说明需要修改的内容');return}
      const result=await apiRequest(`/therapist/plans/${Number(plan.id)}/review`,'POST',{decision,note});
      if(!result.success){showToast(result.error||'审核保存失败');return}
      professionalActions[index]={...plan,confirmation_status:decision,professional_note:note,reviewed_at:new Date().toISOString()};closeTopModal();showToast(decision==='confirmed'?'已确认并通知家长':'已退回并通知家长');renderTherapist(document.getElementById('main-content'));
    }

    async function updateProfessionalPlan(index,status){
      const allowed=['active','paused','completed','escalated'];if(!allowed.includes(status))return;
      const plan=professionalActions[index];if(!plan)return;
      const next={...plan,status};
      try{if(plan.id&&!useMockMode){const result=await apiRequest(`/therapist/plans/${Number(plan.id)}`,'PATCH',next);if(!result.success)throw new Error(result.error||'更新失败')}professionalActions[index]=next;if(useMockMode)sessionStorage.setItem('xingban_professional_actions',JSON.stringify(professionalActions));showToast(status==='paused'?'计划已暂停':status==='completed'?'计划已完成':'已标记为需要升级联系专业人员');renderTherapist(document.getElementById('main-content'))}catch(error){showToast(error.message||'计划状态更新失败')}
    }

    function renderTherapist(container) {
      document.getElementById('page-title').textContent = '专业协作';
      document.getElementById('page-subtitle').textContent = '把问题说清楚，把建议落下去';
      const therapists=MOCK_DATA.therapists,feedback=sessionDataMode==='server'?[]:MOCK_DATA.therapistFeedback,reports=MOCK_DATA.reports;
      const brief=getProfessionalBrief();
      const actions=professionalActions;
      const isTherapist=currentUser?.role==='therapist';
      container.innerHTML=`<div class="p-4 sm:p-6 space-y-5 max-w-5xl mx-auto animate-fade-in">
        ${isTherapist?`<section class="rounded-2xl bg-primary-dark text-white p-5 sm:p-6"><p class="text-sm text-white/75">专业账号工作台</p><h2 class="text-2xl font-bold mt-1">核对计划，而不是替家庭做决定</h2><p class="text-sm leading-6 text-white/85 mt-3">只处理明确分配给当前已认证账号的计划。确认本版本后，仍由家长决定是否开始；不适用或信息不足时请具体退回。</p></section>`:`<section class="rounded-2xl bg-primary-dark text-white p-5 sm:p-6"><p class="text-sm text-white/75">不知道该找谁、该怎么说？</p><h2 class="text-2xl font-bold mt-1">AI先帮你整理，专业人员负责判断</h2><p class="text-sm leading-6 text-white/85 mt-3">把变化、时间、诱因、已尝试方法和用药信息整理成一页会前沟通单。AI不诊断、不决定治疗、不修改药物。</p><div class="flex flex-wrap gap-2 mt-4"><button data-ui-call="showProfessionalIntake" class="px-4 py-2.5 rounded-xl bg-white text-primary-dark font-bold">整理一个新问题</button><button data-ui-call="showManualProfessionalPlanEditor" class="px-4 py-2.5 rounded-xl bg-white/10 border border-white/60 text-white font-bold">创建协作计划</button><button data-nav="emergency" class="px-4 py-2.5 rounded-xl border border-white/60 text-white font-bold">现在有危险</button></div></section>`}
        ${isTherapist?`<section class="rounded-2xl bg-white border border-border p-4"><h3 class="font-bold">分配给我的计划</h3><p class="text-xs text-text-muted mt-1">确认或退回均会写入审计记录并通知家长</p><div class="mt-3 space-y-3">${actions.length?actions.map((plan,index)=>`<article class="p-4 rounded-xl bg-background"><div class="flex justify-between gap-3"><strong>${escapeText(plan.title)}</strong><span class="text-xs font-bold">${({pending:'待确认',confirmed:'已确认',returned:'已退回',not_requested:'未请求'})[plan.confirmation_status]||'待确认'}</span></div><div class="text-sm text-text-secondary mt-2">目标：${escapeText(plan.goal||'未填写')}</div><div class="text-sm text-text-secondary">频率：${escapeText(plan.frequency||'未填写')}</div><div class="text-sm text-text-secondary">停止条件：${escapeText(plan.stop_conditions||'未填写')}</div>${plan.confirmation_status==='pending'?`<div class="grid grid-cols-2 gap-2 mt-3"><button data-ui-call="showPlanReviewModal" data-ui-args="${uiArgsAttr(Number(index),'confirmed')}" class="py-2 rounded-lg bg-success text-white font-bold">确认本版本</button><button data-ui-call="showPlanReviewModal" data-ui-args="${uiArgsAttr(Number(index),'returned')}" class="py-2 rounded-lg border border-amber-600 text-amber-700 font-bold">退回修改</button></div>`:`<div class="text-xs text-text-muted mt-2">${plan.professional_note?'备注：'+escapeText(plan.professional_note):'本版本已处理'}</div>`}</article>`).join(''):'<div class="p-4 rounded-xl bg-background text-sm text-text-muted">当前没有分配给您的待审计划。</div>'}</div></section>`:''}
        ${brief?`<section class="rounded-2xl bg-white border border-primary/30 p-5"><div class="flex justify-between gap-3"><div><div class="text-xs font-bold text-primary">AI整理 · 请家长核对</div><h3 class="font-bold text-lg mt-1">会前沟通单</h3></div><button data-ui-call="clearProfessionalBrief" class="text-sm text-text-muted">清除</button></div><div class="mt-4 rounded-xl bg-primary-light/20 p-4"><div class="font-bold">建议首先联系：${escapeText(brief.role)}</div><p class="text-sm mt-1">${escapeText(brief.reason)}</p></div><dl class="mt-4 grid gap-3 text-sm"><div><dt class="font-bold">持续与频率</dt><dd class="text-text-secondary">${escapeText(brief.duration)}；${escapeText(brief.frequency)}</dd></div><div><dt class="font-bold">与平时相比</dt><dd class="text-text-secondary">${escapeText(brief.baseline)}</dd></div><div><dt class="font-bold">前后情境</dt><dd class="text-text-secondary whitespace-pre-wrap">${escapeText(brief.context)}</dd></div><div><dt class="font-bold">已经尝试及反应</dt><dd class="text-text-secondary whitespace-pre-wrap">${escapeText(brief.tried)}</dd></div><div><dt class="font-bold">药物与变化</dt><dd class="text-text-secondary whitespace-pre-wrap">${escapeText(brief.meds)}</dd></div><div><dt class="font-bold">本次最重要的问题</dt><dd class="text-text-primary">${escapeText(brief.question)}</dd></div></dl><div class="grid sm:grid-cols-2 gap-2 mt-4"><button data-ui-call="copyProfessionalBrief" class="py-3 rounded-xl bg-primary text-white font-bold">复制沟通单</button>${reports.length?`<button data-ui-call="showShareToTherapistModal" data-ui-args="[${Number(Number(reports[0].id))}]" class="py-3 rounded-xl border border-primary text-primary font-bold">连同周报分享</button>`:''}</div><p class="text-xs text-text-muted mt-3">分享前再次确认接收人、范围和有效期；紧急情况不要等待回复。</p></section>`:''}
        <section><h3 class="font-bold text-text-primary">这个问题通常该找谁</h3><div class="grid sm:grid-cols-2 gap-3 mt-3">${[['behavior','行为反复或突然变化'],['mood','低落、焦虑或异常兴奋'],['communication','理解、表达或AAC'],['sensory','感官与日常参与'],['feeding','进食、营养或吞咽'],['medication','药物或明显不良反应']].map(([key,label])=>{const r=getProfessionalRoute(key);return`<div class="bg-white border border-border rounded-xl p-4"><div class="font-bold">${label}</div><div class="text-sm text-primary mt-1">${r.role}</div><p class="text-xs leading-5 text-text-muted mt-2">${r.reason}</p></div>`}).join('')}</div></section>
        <section><div class="flex items-end justify-between"><div><h3 class="font-bold text-text-primary">协作联系人</h3><p class="text-xs text-text-muted mt-1">${sessionDataMode==='server'?'仅显示后端已标记认证的资料；仍需家长确认实际服务关系':'以下均为虚构体验数据，资质和服务关系尚未核验'}</p></div></div><div class="space-y-3 mt-3">${therapists.length?therapists.map(t=>`<div class="bg-white rounded-xl border border-border p-4 flex gap-3"><div class="w-12 h-12 bg-primary-light/30 rounded-full flex items-center justify-center text-2xl">${escapeText(t.avatar)}</div><div><div class="font-bold">${escapeText(t.name)} <span class="text-xs font-normal ${sessionDataMode==='server'?'text-success bg-success/10':'text-amber-700 bg-amber-50'} px-2 py-1 rounded-lg">${sessionDataMode==='server'?'后台已核验':'演示资料·未核验'}</span></div><div class="text-sm text-text-secondary mt-1">${escapeText(t.title)} · ${escapeText(t.specialty)}</div>${t.years_of_experience?`<div class="text-xs text-text-muted">从业年限：${Number(t.years_of_experience)} 年</div>`:''}</div></div>`).join(''):'<div class="p-4 rounded-xl bg-background text-sm text-text-muted">暂无已认证的协作联系人。请通过当地正规医疗或专业渠道联系，不要等待平台回复。</div>'}</div></section>
        <section><h3 class="font-bold text-text-primary">收到建议后，不要只收藏</h3><div class="space-y-3 mt-3">${feedback.length?feedback.map(f=>`<article class="bg-white rounded-xl border border-border p-4"><div class="text-xs text-text-muted">${escapeText(f.therapist_name)} · ${formatDate(f.created_at)} · 演示反馈</div><p class="text-sm leading-6 mt-2">${escapeText(f.content)}</p><div class="mt-3 space-y-2">${(f.suggestions||[]).map((s,index)=>`<div class="flex items-center justify-between gap-3 rounded-lg bg-background p-3"><span class="text-sm">${escapeText(s)}</span><button data-ui-call="showProfessionalPlanEditor" data-ui-args="${uiArgsAttr(Number(Number(f.id)),Number(index))}" class="shrink-0 text-sm text-primary font-bold">制定计划</button></div>`).join('')}</div></article>`).join(''):'<div class="p-4 rounded-xl bg-background text-sm text-text-muted">真实专业反馈尚未接入当前账号。请先通过已核验渠道沟通，再把确认后的内容整理为协作计划。</div>'}</div></section>
        ${!isTherapist&&actions.length?`<section class="rounded-2xl bg-white border border-border p-4"><h3 class="font-bold">协作计划</h3><p class="text-xs text-text-muted mt-1">指定专业人员的计划必须由对方账号确认本版本，家长再决定是否开始</p><div class="mt-3 space-y-2">${actions.map((a,index)=>`<div class="p-3 bg-background rounded-xl text-sm"><div><strong>${({active:'执行中',paused:'已暂停',completed:'已完成',escalated:'需升级',pending_confirmation:'待确认'})[a.status]||'待确认'}</strong> · ${escapeText(a.title||a.suggestion)}</div><div class="text-xs mt-1 ${a.confirmation_status==='confirmed'?'text-success':a.confirmation_status==='returned'?'text-amber-700':'text-text-muted'}">专业确认：${({pending:'等待对方确认',confirmed:'已确认当前版本',returned:'已退回修改',not_requested:'未指定专业人员'})[a.confirmation_status]||'未请求'}</div>${a.professional_note?`<div class="text-xs text-text-secondary mt-1">专业备注：${escapeText(a.professional_note)}</div>`:''}${a.goal?`<div class="text-text-secondary mt-1">目标：${escapeText(a.goal)}</div>`:''}${a.review_date?`<div class="text-xs text-text-muted mt-1">复核：${escapeText(a.review_date)}</div>`:''}${a.status==='pending_confirmation'&&a.confirmation_status==='confirmed'?`<button data-ui-call="updateProfessionalPlan" data-ui-args="${uiArgsAttr(Number(index),'active')}" class="mt-3 px-3 py-1.5 rounded-lg bg-success text-white font-bold">家长确认开始</button>`:''}${a.status==='active'?`<div class="flex flex-wrap gap-2 mt-3"><button data-ui-call="updateProfessionalPlan" data-ui-args="${uiArgsAttr(Number(index),'paused')}" class="px-3 py-1.5 rounded-lg border border-border">暂停</button><button data-ui-call="updateProfessionalPlan" data-ui-args="${uiArgsAttr(Number(index),'completed')}" class="px-3 py-1.5 rounded-lg border border-success text-success">完成</button><button data-ui-call="updateProfessionalPlan" data-ui-args="${uiArgsAttr(Number(index),'escalated')}" class="px-3 py-1.5 rounded-lg border border-danger text-danger">情况变化·升级求助</button></div>`:''}</div>`).join('')}</div></section>`:''}
        ${reportShareRecords.length?`<section class="rounded-2xl bg-white border border-border p-4"><h3 class="font-bold">周报授权</h3><p class="text-xs text-text-muted mt-1">只显示当前账号创建的授权，可随时撤销</p><div class="mt-3 space-y-2">${reportShareRecords.map(share=>{const active=!share.revoked_at&&new Date(share.expires_at)>new Date();return`<div class="p-3 bg-background rounded-xl text-sm"><div class="font-medium">${escapeText(share.therapist_name||`专业人员 #${share.therapist_id}`)} · 周报 #${Number(share.report_id)}</div><div class="text-xs text-text-muted mt-1">范围：${(share.scope||[]).map(escapeText).join('、')} · ${active?'有效至 '+new Date(share.expires_at).toLocaleDateString('zh-CN'):share.revoked_at?'已撤销':'已到期'}</div>${active?`<button data-ui-call="revokeReportShare" data-ui-args="[${Number(Number(share.id))}]" class="mt-2 px-3 py-1.5 rounded-lg border border-danger text-danger">撤销授权</button>`:''}</div>`}).join('')}</div></section>`:''}
        <section class="rounded-xl bg-amber-50 border border-amber-200 p-4 text-sm text-amber-900"><strong>角色边界：</strong>“专业协作”不代表平台已经提供医疗服务。抑郁、躁狂、自伤/自杀、精神病性症状和药物问题应由儿童精神科等具备相应资质的人员处理；紧急时联系120/110，不等待平台回复。</section>
      </div>`;
    }
    // === 同伴联结模块 ===
    let currentPeerTab = 'groups';
    let currentGroupId = 1;

    function renderPeer(container) {
      document.getElementById('page-title').textContent = '同伴联结';
      document.getElementById('page-subtitle').textContent = '你并不孤单';

      const assessment = MOCK_DATA.lonelinessAssessment;
      const score = assessment.current_score;
      const scoreColor = score <= 3 ? 'text-success' : score <= 6 ? 'text-warning' : 'text-danger';
      const scoreLabel = score <= 3 ? '本次感受较轻' : score <= 6 ? '本次感受较明显' : '本次感受很强烈';
      const encourageText = score <= 3 ? '这只是一次主观记录，可继续留意变化。' : score <= 6 ? '可以告诉一位信任的人，并考虑安排实际支持。' : '请优先确认自己是否安全，不要独自承受或只等待群内回复。';

      container.innerHTML = `
        <div class="p-4 space-y-4 animate-fade-in">
          <div class="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900"><strong>体验功能：</strong>群组、动态和活动均为演示数据，没有真实成员、报名或实时值守。这里不是危机热线；如你或孩子有自伤、自杀、伤人或失控危险，请立即联系可信成人并拨打 120/110。</div>
          <div class="bg-white rounded-xl card-shadow p-4">
            <div class="flex items-center gap-3 mb-3">
              <div class="w-10 h-10 bg-primary-light/30 rounded-full flex items-center justify-center text-xl">💙</div>
              <div class="flex-1">
                <h3 class="font-bold text-text-primary">当下孤独感记录</h3>
                <p class="text-xs text-text-muted">单题主观记录，不是量表、诊断或风险评估</p>
              </div>
              <button data-ui-call="showLonelinessAssessModal" class="px-3 py-1.5 rounded-lg bg-primary/10 text-primary text-xs font-medium">重新记录</button>
            </div>
            <div class="flex items-center gap-4 mb-3">
              <div class="text-center">
                <div class="text-3xl font-bold ${scoreColor}">${score}</div>
                <div class="text-xs text-text-muted">/10分</div>
              </div>
              <div class="flex-1">
                <div class="text-sm font-medium ${scoreColor}">${scoreLabel}</div>
                <div class="text-xs text-text-secondary mt-1">${encourageText}</div>
                <!-- 简易趋势柱状图 -->
                <div class="flex items-end gap-2 mt-2 h-12">
                  ${assessment.history.slice().reverse().map(h => {
                    const barHeight = Math.max(10, (h.score / 10) * 100);
                    const barColor = h.score <= 3 ? 'bg-success' : h.score <= 6 ? 'bg-warning' : 'bg-danger';
                    const dateLabel = h.date.slice(5);
                    return `<div class="flex-1 flex flex-col items-center gap-1">
                      <div class="w-full ${barColor} rounded-t" style="height:${barHeight}%"></div>
                      <div class="text-[10px] text-text-muted">${dateLabel}</div>
                    </div>`;
                  }).join('')}
                </div>
              </div>
            </div>
            <!-- 个性化建议 -->
            <div class="border-t border-border pt-3 mt-3">
              <div class="text-xs font-medium text-primary mb-2">💡 可选支持行动（非个性化医疗建议）</div>
              <div class="space-y-2">
                ${assessment.suggestions.map((s, i) => `
                  <div class="flex items-center gap-2">
                    <span class="text-lg">${s.completed ? '✅' : s.icon}</span>
                    <div class="flex-1">
                      <div class="text-sm ${s.completed ? 'text-text-muted line-through' : 'text-text-primary'}">${escapeText(s.title)}</div>
                      <div class="text-xs text-text-muted">${escapeText(s.description)}</div>
                    </div>
                    ${!s.completed ? `<button data-ui-call="completeSuggestion" data-ui-args="[${Number(i)}]" class="px-2 py-1 rounded bg-primary/10 text-primary text-xs">标记已尝试</button>` : ''}
                  </div>
                `).join('')}
              </div>
            </div>
          </div>

          <!-- Tab切换 -->
          <div class="flex bg-white rounded-xl p-1 card-shadow">
            <button data-ui-call="renderPeerTab" data-ui-args='["groups"]' data-ui-pass-this="true" class="peer-tab flex-1 py-2.5 rounded-lg ${currentPeerTab === 'groups' ? 'bg-primary text-white font-medium' : 'text-text-secondary'}">互助群组</button>
            <button data-ui-call="renderPeerTab" data-ui-args='["messages"]' data-ui-pass-this="true" class="peer-tab flex-1 py-2.5 rounded-lg ${currentPeerTab === 'messages' ? 'bg-primary text-white font-medium' : 'text-text-secondary'}">群内动态</button>
            <button data-ui-call="renderPeerTab" data-ui-args='["activities"]' data-ui-pass-this="true" class="peer-tab flex-1 py-2.5 rounded-lg ${currentPeerTab === 'activities' ? 'bg-primary text-white font-medium' : 'text-text-secondary'}">线下活动</button>
          </div>

          <!-- Tab内容区 -->
          <div id="peer-tab-content">
            ${renderPeerTabContent(currentPeerTab)}
          </div>
        </div>
      `;
    }

    function renderPeerTabContent(tab) {
      if (tab === 'groups') {
        const groups = MOCK_DATA.peerGroups;
        if (groups.length === 0) {
          return '<div class="text-center py-12 text-text-muted"><div class="text-4xl mb-2">🤝</div>暂无互助群组</div>';
        }
        return `<div class="space-y-3">
          ${groups.map(g => `
            <div class="bg-white rounded-xl card-shadow p-4">
              <div class="flex items-start gap-3">
                <div class="w-12 h-12 bg-primary-light/30 rounded-xl flex items-center justify-center text-2xl">${escapeText(g.avatar)}</div>
                <div class="flex-1">
                  <div class="flex items-center gap-2">
                    <h4 class="font-bold text-text-primary">${escapeText(g.name)}</h4>
                    <span class="px-2 py-0.5 rounded-full bg-primary/10 text-primary text-xs">${escapeText(g.category)}</span>
                  </div>
                  <p class="text-sm text-text-secondary mt-1">${escapeText(g.description)}</p>
                  <div class="flex items-center gap-3 mt-2">
                    <span class="text-xs text-text-muted">👥 ${g.member_count}/${g.max_members}</span>
                    <span class="text-xs text-text-muted">🕐 ${escapeText(g.recent_activity)}</span>
                  </div>
                  <div class="flex gap-1.5 mt-2">
                    ${g.tags.map(t => `<span class="px-2 py-0.5 rounded-full bg-gray-100 text-text-muted text-xs">${escapeText(t)}</span>`).join('')}
                  </div>
                </div>
                <div class="flex flex-col gap-2">
                  ${g.is_joined
                    ? `<button data-ui-call="showGroupDetail" data-ui-args="[${Number(g.id)}]" class="px-3 py-1.5 rounded-lg bg-primary text-white text-xs font-medium">查看</button>`
                    : `<button data-ui-call="joinGroup" data-ui-args="[${Number(g.id)}]" class="px-3 py-1.5 rounded-lg border border-primary text-primary text-xs font-medium">加入</button>`
                  }
                </div>
              </div>
            </div>
          `).join('')}
        </div>`;
      }

      if (tab === 'messages') {
        const joinedGroups = MOCK_DATA.peerGroups.filter(g => g.is_joined);
        const messages = MOCK_DATA.peerMessages.filter(m => joinedGroups.some(g => g.id === m.group_id));
        if (messages.length === 0) {
          return '<div class="text-center py-12 text-text-muted"><div class="text-4xl mb-2">💬</div>暂无群内动态，快加入一个群组吧</div>';
        }
        return `<div class="space-y-3">
          <!-- 群组选择 -->
          <div class="flex gap-2 overflow-x-auto scrollbar-hide pb-1">
            ${joinedGroups.map(g => `
              <button data-ui-call="switchPeerGroup" data-ui-args="[${Number(g.id)}]" class="shrink-0 px-3 py-1.5 rounded-full ${currentGroupId === g.id ? 'bg-primary text-white' : 'bg-white text-text-secondary border border-border'} text-xs font-medium">${escapeText(g.avatar)} ${escapeText(g.name)}</button>
            `).join('')}
          </div>
          <!-- 消息流 -->
          <div class="space-y-3" id="peer-messages-list">
            ${messages.filter(m => m.group_id === currentGroupId).length > 0
              ? messages.filter(m => m.group_id === currentGroupId).map(m => `
                <div class="bg-white rounded-xl card-shadow p-4">
                  <div class="flex items-start gap-3">
                    <div class="w-8 h-8 bg-primary-light/30 rounded-full flex items-center justify-center text-lg">${escapeText(m.avatar)}</div>
                    <div class="flex-1">
                      <div class="flex items-center gap-2">
                        <span class="font-medium text-sm text-text-primary">${escapeText(m.user_name)}</span>
                        <span class="text-xs text-text-muted">${escapeText(m.time)}</span>
                      </div>
                      <p class="text-sm text-text-primary mt-1">${escapeText(m.content)}</p>
                      <div class="flex items-center gap-4 mt-2">
                        <button data-ui-call="likePeerMessage" data-ui-args="[${Number(m.id)}]" class="flex items-center gap-1 text-xs text-text-muted hover:text-danger">
                          <span>❤️</span><span>${m.likes}</span>
                        </button>
                        <button data-ui-call="replyPeerMessage" data-ui-args="[${Number(m.id)}]" class="flex items-center gap-1 text-xs text-text-muted hover:text-primary">
                          <span>💬</span><span>${m.replies}</span>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              `).join('')
              : '<div class="text-center py-8 text-text-muted"><div class="text-4xl mb-2">💬</div>该群组暂无消息</div>'
            }
          </div>
          <!-- 发送消息 -->
          <div class="bg-white rounded-xl card-shadow p-3 flex gap-2">
            <input type="text" id="peer-message-input" maxlength="500" placeholder="体验消息：不要填写姓名、电话、住址、病历或学校信息" class="flex-1 px-3 py-2 rounded-lg border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" data-ui-enter="send-peer">
            <button data-ui-call="sendPeerMessage" class="px-4 py-2 rounded-lg bg-primary text-white text-sm font-medium">发送</button>
          </div>
        </div>`;
      }

      if (tab === 'activities') {
        const activities = MOCK_DATA.peerActivities;
        if (activities.length === 0) {
          return '<div class="text-center py-12 text-text-muted"><div class="text-4xl mb-2">📅</div>暂无活动安排</div>';
        }
        return `<div class="space-y-3">
          ${activities.map(a => `
            <div class="bg-white rounded-xl card-shadow p-4">
              <div class="flex items-start gap-3">
                <div class="w-12 h-12 bg-primary-light/30 rounded-xl flex items-center justify-center text-2xl">${a.type === '线上' ? '💻' : '🏠'}</div>
                <div class="flex-1">
                  <div class="flex items-center gap-2">
                    <h4 class="font-bold text-text-primary">${escapeText(a.title)}</h4>
                    <span class="px-2 py-0.5 rounded-full ${a.type === '线上' ? 'bg-blue-100 text-blue-600' : 'bg-green-100 text-green-600'} text-xs">${escapeText(a.type)}</span>
                  </div>
                  <div class="flex items-center gap-3 mt-2 text-xs text-text-muted">
                    <span>📅 ${escapeText(a.date)}</span>
                    <span>🕐 ${escapeText(a.time)}</span>
                  </div>
                  <div class="flex items-center gap-3 mt-1 text-xs text-text-muted">
                    <span>🎤 ${escapeText(a.speaker)}</span>
                    <span>👥 ${a.participants}/${a.max_participants}</span>
                  </div>
                  <div class="mt-2">
                    <div class="progress-bar">
                      <div class="progress-fill" style="width:${(a.participants / a.max_participants) * 100}%"></div>
                    </div>
                  </div>
                </div>
                <div>
                  ${a.is_registered
                    ? '<span class="px-3 py-1.5 rounded-lg bg-success/10 text-success text-xs font-medium">已报名</span>'
                    : `<button data-ui-call="registerActivity" data-ui-args="[${Number(a.id)}]" class="px-3 py-1.5 rounded-lg bg-primary text-white text-xs font-medium">报名</button>`
                  }
                </div>
              </div>
            </div>
          `).join('')}
        </div>`;
      }
      return '';
    }

    function renderPeerTab(tab, btn) {
      currentPeerTab = tab;
      // 更新tab样式
      document.querySelectorAll('.peer-tab').forEach(el => {
        el.classList.remove('bg-primary', 'text-white', 'font-medium');
        el.classList.add('text-text-secondary');
      });
      if (btn) {
        btn.classList.remove('text-text-secondary');
        btn.classList.add('bg-primary', 'text-white', 'font-medium');
      }
      // 更新内容
      const contentEl = document.getElementById('peer-tab-content');
      if (contentEl) {
        contentEl.innerHTML = renderPeerTabContent(tab);
      }
    }

    function joinGroup(groupId) {
      const group = MOCK_DATA.peerGroups.find(g => g.id === groupId);
      if (group) {
        group.is_joined = true;
        group.member_count++;
        showToast(`体验状态：已加入「${escapeText(group.name)}」，未连接真实群组`);
        navigateTo('peer');
      }
    }

    function sendPeerMessage() {
      const input = document.getElementById('peer-message-input');
      if (!input) return;
      const content = input.value.trim();
      if (!content) { showToast('请输入消息内容'); return; }
      MOCK_DATA.peerMessages.unshift({
        id: MOCK_DATA.peerMessages.length + 1,
        group_id: currentGroupId,
        user_name: currentUser?.name || '我',
        avatar: '🙋',
        content: content,
        time: '刚刚',
        likes: 0,
        replies: 0
      });
      input.value = '';
      showToast('仅加入本次体验数据，未发送到真实群组');
      renderPeerTab('messages', document.querySelectorAll('.peer-tab')[1]);
    }

    function registerActivity(activityId) {
      const activity = MOCK_DATA.peerActivities.find(a => a.id === activityId);
      if (activity) {
        activity.is_registered = true;
        activity.participants++;
        showToast(`体验状态：已登记「${escapeText(activity.title)}」，并未真实报名`);
        navigateTo('peer');
      }
    }

    function showGroupDetail(groupId) {
      const group = MOCK_DATA.peerGroups.find(g => g.id === groupId);
      if (!group) return;
      const groupMessages = MOCK_DATA.peerMessages.filter(m => m.group_id === groupId);

      const modal = document.createElement('div');
      modal.className = 'fixed inset-0 bg-black/50 flex items-end justify-center z-50';
      modal.innerHTML = `
        <div class="bg-white w-full max-w-md rounded-t-3xl p-6 max-h-[80vh] overflow-y-auto animate-fade-in safe-area-bottom">
          <div class="flex justify-between items-center mb-4">
            <div class="flex items-center gap-2">
              <span class="text-2xl">${escapeText(group.avatar)}</span>
              <h3 class="text-lg font-bold">${escapeText(group.name)}</h3>
            </div>
            <button data-ui-action="remove-overlay" class="text-text-muted">✕</button>
          </div>
          <p class="text-sm text-text-secondary mb-3">${escapeText(group.description)}</p>
          <div class="flex items-center gap-3 mb-4">
            <span class="text-xs text-text-muted">👥 ${group.member_count}/${group.max_members}人</span>
            <span class="px-2 py-0.5 rounded-full bg-primary/10 text-primary text-xs">${escapeText(group.category)}</span>
            ${group.tags.map(t => `<span class="px-2 py-0.5 rounded-full bg-gray-100 text-text-muted text-xs">${escapeText(t)}</span>`).join('')}
          </div>
          <h4 class="font-medium text-text-primary mb-2">最近动态</h4>
          ${groupMessages.length > 0
            ? `<div class="space-y-3">${groupMessages.slice(0, 5).map(m => `
              <div class="p-3 rounded-lg bg-background">
                <div class="flex items-center gap-2 mb-1">
                  <span class="text-sm">${escapeText(m.avatar)}</span>
                  <span class="text-sm font-medium text-text-primary">${escapeText(m.user_name)}</span>
                  <span class="text-xs text-text-muted">${escapeText(m.time)}</span>
                </div>
                <p class="text-sm text-text-secondary">${escapeText(m.content)}</p>
              </div>
            `).join('')}</div>`
            : '<div class="text-center py-6 text-text-muted">暂无动态</div>'
          }
          <button data-ui-call="openPeerMessages" data-ui-args="${uiArgsAttr(Number(groupId))}" data-ui-pass-this="true" class="w-full mt-4 py-3 rounded-xl bg-primary text-white font-medium">进入群聊</button>
        </div>
      `;
      document.body.appendChild(modal);
    }

    function switchPeerGroup(groupId) {
      currentGroupId = groupId;
      renderPeerTab('messages', document.querySelectorAll('.peer-tab')[1]);
    }

    function likePeerMessage(messageId) {
      const msg = MOCK_DATA.peerMessages.find(m => m.id === messageId);
      if (msg) {
        msg.likes++;
        renderPeerTab('messages', document.querySelectorAll('.peer-tab')[1]);
      }
    }

    function replyPeerMessage(messageId) {
      const msg = MOCK_DATA.peerMessages.find(m => m.id === messageId);
      if (!msg) return;
      const input = document.getElementById('peer-message-input');
      if (input) {
        input.value = `@${msg.user_name} `;
        input.focus();
      }
    }

    function showLonelinessAssessModal() {
      const modal = document.createElement('div');
      modal.className = 'fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4';
      modal.innerHTML = `
        <div class="bg-white w-full max-w-sm rounded-2xl p-6 animate-fade-in">
          <div class="flex justify-between items-center mb-4">
            <h3 class="text-lg font-bold">当下孤独感记录</h3>
            <button data-ui-action="remove-overlay" class="text-text-muted">✕</button>
          </div>
          <div class="text-center mb-6">
            <div class="text-4xl mb-2">💙</div>
            <p class="text-sm text-text-secondary">请记录近一周的主观感受；单题记录不能判断心理健康状况</p>
            <p class="text-xs text-text-muted mt-1">1=不孤独，10=极度孤独</p>
          </div>
          <div class="mb-6">
            <input type="range" id="loneliness-slider" min="1" max="10" value="${MOCK_DATA.lonelinessAssessment.current_score}" class="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-primary" data-ui-input="loneliness">
            <div class="flex justify-between text-xs text-text-muted mt-1">
              <span>1</span><span>5</span><span>10</span>
            </div>
            <div class="text-center mt-3">
              <span class="text-3xl font-bold text-primary" id="loneliness-score-display">${MOCK_DATA.lonelinessAssessment.current_score}</span>
              <span class="text-sm text-text-muted">/10</span>
            </div>
          </div>
          <button data-ui-call="submitCurrentLonelinessScore" class="w-full py-3 rounded-xl bg-primary text-white font-medium">保存记录</button>
        </div>
      `;
      document.body.appendChild(modal);
    }

    function submitLonelinessScore(score) {
      if (!score || score < 1 || score > 10) { showToast('请选择1-10分'); return; }
      const today = new Date().toISOString().slice(0, 10);
      MOCK_DATA.lonelinessAssessment.current_score = score;
      MOCK_DATA.lonelinessAssessment.history.unshift({ date: today, score: score });
      if (MOCK_DATA.lonelinessAssessment.history.length > 8) {
        MOCK_DATA.lonelinessAssessment.history = MOCK_DATA.lonelinessAssessment.history.slice(0, 8);
      }
      closeTopModal();
      showToast('本次感受已记录；它不是诊断或风险评估');
      navigateTo('peer');
      if (score >= 8) showPeerSafetyCheck();
    }

    function showPeerSafetyCheck() {
      const modal = document.createElement('div');
      modal.className = 'fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4';
      modal.innerHTML = `
        <div class="bg-white w-full max-w-sm rounded-2xl p-6 animate-fade-in" role="dialog" aria-modal="true" aria-labelledby="peer-safety-title">
          <div class="w-12 h-12 rounded-full bg-danger/10 text-danger flex items-center justify-center text-2xl mb-3">🛟</div>
          <h3 id="peer-safety-title" class="text-lg font-bold text-text-primary">先确认你现在是否安全</h3>
          <p class="text-sm text-text-secondary leading-6 mt-2">这个分数不能判断风险。请直接确认：你现在是否有伤害自己、结束生命、伤害他人的想法，或担心自己马上失控？</p>
          <div class="mt-4 space-y-2">
            <button data-ui-call="removeOverlayThenNavigate" data-ui-args='["emergency"]' data-ui-pass-this="true" class="w-full py-3 rounded-xl bg-danger text-white font-bold">有 / 不确定：立即查看紧急支持</button>
            <button data-ui-call="removeOverlayThenNavigate" data-ui-args='["therapist"]' data-ui-pass-this="true" class="w-full py-3 rounded-xl border border-primary text-primary font-medium">没有即时危险：联系专业支持</button>
            <button data-ui-action="remove-overlay" class="w-full py-2 text-sm text-text-muted">稍后处理</button>
          </div>
          <p class="text-xs text-text-muted leading-5 mt-3">如危险迫近，不要独处或等待平台/群聊回复：联系身边可信成人，拨打 120/110，或前往最近急诊。</p>
        </div>`;
      document.body.appendChild(modal);
    }
    function completeSuggestion(index) {
      if (MOCK_DATA.lonelinessAssessment.suggestions[index]) {
        MOCK_DATA.lonelinessAssessment.suggestions[index].completed = true;
        showToast('已标记为尝试过；请按自身情况判断是否有帮助');
        navigateTo('peer');
      }
    }

    function renderFamily(container) {
      document.getElementById('page-title').textContent = '家庭系统';
      document.getElementById('page-subtitle').textContent = '情绪与感谢';

      container.innerHTML = `
        <div class="p-4 space-y-4 animate-fade-in">
          <div class="rounded-xl bg-danger/5 border border-danger/20 p-4 text-sm"><strong class="text-danger">家庭安全优先：</strong><span class="text-text-secondary">若存在暴力、威胁或人身安全风险，情绪签到和感谢卡不适用；先离开危险环境并联系可信成人，紧急时拨打 110。</span></div>
          <div class="flex bg-white rounded-xl p-1 card-shadow">
            <button data-ui-call="renderFamilyMood" data-ui-pass-this="true" class="flex-1 py-2 rounded-lg bg-primary text-white font-medium">情绪签到</button>
            <button data-ui-call="renderFamilyGratitude" data-ui-pass-this="true" class="flex-1 py-2 rounded-lg text-text-secondary">感谢卡</button>
          </div>

          <div id="family-content">
            ${renderFamilyMoodContent()}
          </div>
          <div class="bg-white rounded-xl card-shadow p-4"><h3 class="font-bold text-text-primary mb-3">更多家庭支持</h3><div class="grid grid-cols-2 gap-3">
            <button data-ui-call="showCaregiverAccessCenter" class="col-span-2 p-3 rounded-xl bg-teal-50 text-left"><strong class="block text-teal-900">共同照护授权</strong><span class="text-xs text-teal-700">各自账号 · 儿童级范围 · 可随时撤销</span></button>
            <button data-ui-call="showFamilyTool" data-ui-args='["caregiver"]' class="p-3 rounded-xl bg-blue-50 text-left"><strong class="block text-blue-900">照护者支持</strong><span class="text-xs text-blue-700">替班与恢复计划</span></button>
            <button data-ui-call="showFamilyTool" data-ui-args='["grandparent"]' class="p-3 rounded-xl bg-amber-50 text-left"><strong class="block text-amber-900">隔代沟通</strong><span class="text-xs text-amber-700">三种表达模板</span></button>
            <button data-ui-call="showFamilyTool" data-ui-args='["sibling"]' class="p-3 rounded-xl bg-purple-50 text-left"><strong class="block text-purple-900">手足专属时光</strong><span class="text-xs text-purple-700">活动计划与记录</span></button>
            <button data-ui-call="showFamilyTool" data-ui-args='["cbt"]' class="p-3 rounded-xl bg-green-50 text-left"><strong class="block text-green-900">思维记录</strong><span class="text-xs text-green-700">五步整理压力</span></button>
          </div></div>
        </div>
      `;
    }

    async function showCaregiverAccessCenter(){
      const modal=document.createElement('div');modal.className='fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-[80] p-0 sm:p-4';modal.dataset.modal='true';modal.innerHTML='<div class="modal-content max-w-2xl p-5 max-h-[94vh] overflow-y-auto"><div class="flex justify-between"><h2 class="text-lg font-bold">共同照护授权</h2><button data-ui-action="close-top-modal" aria-label="关闭">✕</button></div><div class="py-10 text-center text-text-muted">正在读取授权…</div></div>';document.body.appendChild(modal);
      if(sessionDataMode!=='server'){modal.firstElementChild.innerHTML='<div class="flex justify-between"><h2 class="text-lg font-bold">共同照护授权</h2><button data-ui-action="close-top-modal" aria-label="关闭">✕</button></div><div class="mt-4 p-4 rounded-xl bg-amber-50 text-sm text-amber-900">公开体验版没有真实家庭账号，不能生成可使用的邀请码。连接真实后端后，每位照护者必须用自己的手机号账号接受儿童级授权。</div>';return}
      try{const [members,assigned]=await Promise.all([apiRequest('/family/caregivers','GET'),apiRequest('/family/caregivers/children','GET')]);if(!members.success||!assigned.success)throw new Error('授权读取失败');renderCaregiverAccessCenter(modal,members.caregivers||[],assigned.children||[])}catch(error){modal.firstElementChild.innerHTML=`<p class="p-5 text-center text-text-muted">${escapeText(error.message||'读取失败')}</p>`}
    }
    function renderCaregiverAccessCenter(modal,members,assigned){
      const childOptions=(MOCK_DATA.children||[]).map(c=>`<option value="${Number(c.id)}">${escapeText(c.name||c.nickname||'儿童')}</option>`).join('');
      const memberCards=members.length?members.map(m=>`<div class="p-3 rounded-xl bg-background text-sm"><div class="flex justify-between"><strong>${escapeText(m.nickname||'照护者')} · ${escapeText(m.phone||'')}</strong><span>${escapeText(m.status)}</span></div><div class="text-xs text-text-muted mt-1">范围：${(m.permissions||[]).map(escapeText).join('、')}</div>${m.status==='active'?`<button data-ui-call="revokeCaregiverAccess" data-ui-args="[${Number(Number(m.id))}]" class="mt-2 px-3 py-1.5 rounded-lg border border-red-200 text-red-700">撤销授权</button>`:''}</div>`).join(''):'<p class="text-sm text-text-muted">尚无已接受的共同照护者。</p>';
      const assignedCards=assigned.length?assigned.map(c=>`<div class="p-3 rounded-xl bg-teal-50 text-sm"><strong>${escapeText(c.nickname)}</strong><div class="text-xs text-teal-800 mt-1">获授权：${(c.permissions||[]).map(escapeText).join('、')}</div><div class="flex flex-wrap gap-2 mt-2">${(c.permissions||[]).filter(p=>p!=='profile_summary').map(p=>`<button data-ui-call="showCaregiverResource" data-ui-args="${uiArgsAttr(Number(Number(c.id)),'${escapeText(p)}')}" class="px-3 py-1.5 rounded-lg bg-white border">${escapeText({behavior_records:'行为记录',weekly_reports:'周报',safety_plan:'安全预案'}[p]||p)}</button>`).join('')}</div></div>`).join(''):'<p class="text-sm text-text-muted">当前账号没有获授权儿童。</p>';
      modal.firstElementChild.innerHTML=`<div class="flex justify-between"><div><h2 class="text-lg font-bold">共同照护授权</h2><p class="text-xs text-text-muted mt-1">不共享密码；每项授权绑定具体儿童</p></div><button data-ui-action="close-top-modal" aria-label="关闭">✕</button></div><section class="mt-5"><h3 class="font-bold">邀请照护者</h3><select id="caregiver-child" class="mt-2 w-full p-3 rounded-xl border">${childOptions}</select><input id="caregiver-phone" inputmode="tel" maxlength="20" class="mt-2 w-full p-3 rounded-xl border" placeholder="对方登录手机号"><div class="mt-2 grid grid-cols-2 gap-2 text-sm">${[['profile_summary','基本档案摘要'],['behavior_records','行为记录'],['weekly_reports','周报'],['safety_plan','安全预案']].map(([v,l])=>`<label class="p-2 rounded-lg border"><input type="checkbox" name="caregiver-permission" value="${v}" ${v==='profile_summary'?'checked':''}> ${l}</label>`).join('')}</div><input id="caregiver-request-id" type="hidden" value="${newClientRequestId()}"><p id="caregiver-invite-status" class="mt-3 text-xs text-text-muted" role="status">尚未生成邀请码。失败时手机号和权限会保留在本页。</p><button id="caregiver-invite-button" data-ui-call="createCaregiverInvitation" class="mt-3 w-full py-3 rounded-xl bg-primary text-white font-bold disabled:opacity-60">生成7天邀请码</button></section><section class="mt-5"><h3 class="font-bold mb-2">我邀请的照护者</h3><div class="space-y-2">${memberCards}</div></section><section class="mt-5"><h3 class="font-bold">接受邀请码</h3><div class="flex gap-2 mt-2"><input id="caregiver-code" class="flex-1 p-3 rounded-xl border" placeholder="粘贴对方发送的邀请码"><button data-ui-call="acceptCaregiverInvitation" class="px-4 rounded-xl border">接受</button></div></section><section class="mt-5"><h3 class="font-bold mb-2">别人授权给我的儿童</h3><div class="space-y-2">${assignedCards}</div></section>`;
    }
    let caregiverInviteInFlight=false;
    async function createCaregiverInvitation(){if(caregiverInviteInFlight)return;const child_id=Number(document.getElementById('caregiver-child')?.value),phone=document.getElementById('caregiver-phone')?.value.trim(),permissions=[...document.querySelectorAll('input[name="caregiver-permission"]:checked')].map(el=>el.value),client_request_id=document.getElementById('caregiver-request-id')?.value,status=document.getElementById('caregiver-invite-status'),button=document.getElementById('caregiver-invite-button');if(!phone||!permissions.length){showToast('请填写对方手机号并选择授权范围');return}if(navigator.onLine===false){status.textContent='未生成：当前网络已断开，联网后可直接重试。';showToast('当前网络已断开，邀请码尚未生成');return}caregiverInviteInFlight=true;button.disabled=true;button.textContent='正在安全生成…';status.textContent='正在创建一次性邀请，请勿重复点击。';try{const r=await apiRequest('/family/caregivers/invitations','POST',{child_id,phone,permissions,client_request_id});if(!r.success)throw new Error(r.error||'邀请失败');status.textContent=r.replayed?'该邀请码此前已生成，本次已安全恢复。':'邀请码已生成；接受后系统会销毁可恢复密文。';window.prompt('请通过可信方式单独发送此邀请码；7天内有效。',r.invitation_code)}catch(e){status.textContent=`未生成：${e.message||'网络连接中断'}。手机号和权限仍保留，可重试。`;showToast(e.message||'邀请码尚未生成')}finally{caregiverInviteInFlight=false;const current=document.getElementById('caregiver-invite-button');if(current){current.disabled=false;current.textContent='生成7天邀请码'}}}
    async function acceptCaregiverInvitation(){const invitation_code=document.getElementById('caregiver-code')?.value.trim();try{const r=await apiRequest('/family/caregivers/invitations/accept','POST',{invitation_code});if(!r.success)throw new Error(r.error||'接受失败');closeTopModal();showToast('已接受儿童级授权');showCaregiverAccessCenter()}catch(e){showToast(e.message||'接受失败')}}
    async function revokeCaregiverAccess(id){if(!confirm('确认撤销该照护者对这个儿童的全部授权？'))return;try{const r=await apiRequest(`/family/caregivers/${encodeURIComponent(id)}`,'DELETE');if(!r.success)throw new Error(r.error||'撤销失败');closeTopModal();showToast('授权已撤销');showCaregiverAccessCenter()}catch(e){showToast(e.message||'撤销失败')}}
    async function showCaregiverResource(childId,permission){const paths={behavior_records:'records',weekly_reports:'reports',safety_plan:'safety-plan'},titles={behavior_records:'获授权行为记录',weekly_reports:'获授权周报',safety_plan:'获授权安全预案'};try{const r=await apiRequest(`/family/caregivers/children/${encodeURIComponent(childId)}/${paths[permission]}`,'GET');if(!r.success)throw new Error(r.error||'读取失败');const items=permission==='behavior_records'?(r.records||[]):permission==='weekly_reports'?(r.reports||[]):[r.plan];const modal=document.createElement('div');modal.className='fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-[90] p-0 sm:p-4';modal.dataset.modal='true';modal.innerHTML=`<div class="modal-content max-w-2xl p-5 max-h-[90vh] overflow-y-auto"><div class="flex justify-between"><h2 class="text-lg font-bold">${titles[permission]}</h2><button data-ui-action="close-top-modal" aria-label="关闭">✕</button></div><div class="mt-4 space-y-2">${items.length?items.map(item=>`<pre class="p-3 rounded-xl bg-background text-xs whitespace-pre-wrap break-words">${escapeText(JSON.stringify(item,null,2))}</pre>`).join(''):'<p class="text-text-muted">暂无数据</p>'}</div><p class="mt-3 text-xs text-text-muted">只显示儿童档案所有者明确授权的范围；不要转发或截图扩散。</p></div>`;document.body.appendChild(modal)}catch(e){showToast(e.message||'读取失败')}}

    function renderFamilyMoodContent() {
      return `
        <div>
          <h3 class="font-bold text-text-primary mb-3">今日心情</h3>
          <div class="grid grid-cols-6 gap-2 mb-4">
            ${[
              { emoji: '😊', mood: '开心', color: 'bg-yellow-100' },
              { emoji: '😌', mood: '平静', color: 'bg-blue-100' },
              { emoji: '😴', mood: '疲惫', color: 'bg-gray-100' },
              { emoji: '😰', mood: '压力', color: 'bg-orange-100' },
              { emoji: '😢', mood: '难过', color: 'bg-pink-100' },
              { emoji: '😟', mood: '焦虑', color: 'bg-purple-100' },
            ].map(m => `
              <button data-ui-call="recordMood" data-ui-args="${uiArgsAttr(m.mood,m.emoji)}" class="${m.color} rounded-xl p-2 flex flex-col items-center gap-1">
                <span class="text-xl">${m.emoji}</span>
                <span class="text-xs text-text-secondary">${escapeText(m.mood)}</span>
              </button>
            `).join('')}
          </div>

          <h3 class="font-bold text-text-primary mb-3">最近记录</h3>
          <div class="space-y-3">
            ${MOCK_DATA.familyMoods.map(m => `
              <div class="bg-white p-3 rounded-xl card-shadow flex items-center gap-3">
                <span class="text-xl">${m.emoji}</span>
                <div class="flex-1">
                  <div class="flex items-center gap-2">
                    <span class="font-medium text-text-primary">${escapeText(m.mood)}</span>
                    <span class="text-xs text-text-muted">${escapeText(m.date)}</span>
                  </div>
                  <p class="text-xs text-text-secondary">${escapeText(m.note)}</p>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      `;
    }

    function renderFamilyMood(btn) {
      btn.classList.add('bg-primary', 'text-white');
      btn.classList.remove('text-text-secondary');
      btn.nextElementSibling.classList.remove('bg-primary', 'text-white');
      btn.nextElementSibling.classList.add('text-text-secondary');
      document.getElementById('family-content').innerHTML = renderFamilyMoodContent();
    }

    function renderFamilyGratitude(btn) {
      btn.classList.add('bg-primary', 'text-white');
      btn.classList.remove('text-text-secondary');
      btn.previousElementSibling.classList.remove('bg-primary', 'text-white');
      btn.previousElementSibling.classList.add('text-text-secondary');

      document.getElementById('family-content').innerHTML = `
        <div>
          <div class="flex justify-between items-center mb-3">
            <h3 class="font-bold text-text-primary">感谢卡</h3>
            <button data-ui-call="showNewGratitude" class="px-3 py-1.5 bg-primary text-white rounded-lg text-sm">+ 新建</button>
          </div>
          <div class="space-y-3">
            ${MOCK_DATA.gratitudeCards.map(c => `
              <div class="bg-gradient-to-br from-primary-light/50 to-primary/20 rounded-xl p-4">
                <div class="flex justify-between items-start mb-2">
                  <span class="font-bold text-text-primary">致 ${escapeText(c.partner)}</span>
                  <span class="text-xs px-2 py-0.5 ${c.sent ? 'bg-success/20 text-success' : 'bg-warning/20 text-warning'} rounded-full">${c.sent ? '已发送' : '未发送'}</span>
                </div>
                <p class="text-text-secondary text-sm mb-2">"${escapeText(c.content)}"</p>
                <p class="text-xs text-text-muted">${escapeText(c.date)}</p>
              </div>
            `).join('')}
          </div>
        </div>
      `;
    }

    let moodSaveInFlight = false;
    async function recordMood(mood, emoji) {
      if (moodSaveInFlight) return;
      if (navigator.onLine === false) return showToast('当前离线，心情尚未记录');
      const note = prompt('添加备注（可选）：');
      if (note === null) return;

      moodSaveInFlight = true;
      try {
        const result = await apiRequest('/family/mood', 'POST', { mood, emoji, note: note || '', client_request_id: newClientRequestId() });

        if (result.success) {
          showToast(result.replayed ? '这次心情此前已记录，未重复添加' : `已记录心情：${mood}`);
          document.getElementById('family-content').innerHTML = renderFamilyMoodContent();
        } else {
          showToast(result.error || '记录失败');
        }
      } catch (error) {
        console.error('记录心情失败:', error);
        showToast('心情尚未确认保存，请稍后重试');
      } finally {
        moodSaveInFlight = false;
      }
    }

    function showNewGratitude() {
      const modal = document.createElement('div');
      modal.className = 'fixed inset-0 bg-black/50 flex items-end justify-center z-50';
      modal.innerHTML = `
        <div class="bg-white w-full max-w-md rounded-t-3xl p-6 modal-slide safe-area-bottom">
          <div class="flex justify-between items-center mb-4">
            <h2 class="text-lg font-bold">创建感谢卡</h2>
            <button data-ui-action="remove-overlay" class="text-text-muted">✕</button>
          </div>
          <div class="space-y-4">
            <div>
              <label class="block text-sm text-text-secondary mb-1">对方称呼</label>
              <input type="text" id="gratitude-partner" placeholder="如：孩子爸爸" class="w-full px-4 py-2.5 rounded-xl border border-border">
            </div>
            <div>
              <label class="block text-sm text-text-secondary mb-1">感谢内容</label>
              <textarea id="gratitude-content" placeholder="写下你的感谢..." class="w-full px-4 py-3 rounded-xl border border-border" rows="3"></textarea>
            </div>
            <input type="hidden" id="gratitude-request-id" value="${newClientRequestId()}">
            <button id="gratitude-save-button" data-ui-call="saveGratitude" class="w-full py-3 rounded-xl bg-primary text-white font-medium disabled:opacity-60">保存</button>
            <p id="gratitude-save-status" class="text-xs text-text-muted" role="status">尚未保存或发送</p>
          </div>
        </div>
      `;
      document.body.appendChild(modal);
    }

    async function saveGratitude() {
      const partner = document.getElementById('gratitude-partner').value;
      const content = document.getElementById('gratitude-content').value;
      const button = document.getElementById('gratitude-save-button');
      const status = document.getElementById('gratitude-save-status');
      if (button.disabled) return;

      if (!partner || !content) {
        showToast('请填写完整信息');
        return;
      }
      if (navigator.onLine === false) { status.textContent = '未保存：当前网络已断开，内容仍保留。'; return showToast('当前离线，感谢卡尚未保存'); }

      button.disabled = true; button.textContent = '正在保存…'; status.textContent = '正在保存，请勿重复点击。';
      try {
        const result = await apiRequest('/family/gratitude', 'POST', { partner, content, client_request_id: document.getElementById('gratitude-request-id').value });

        if (result.success) {
          showToast(result.replayed ? '感谢卡此前已保存，未重复创建' : '感谢卡已创建');
          closeTopModal();
          renderFamilyGratitude(document.querySelector('#family-content').previousElementSibling);
        } else {
          showToast(result.error || '创建失败');
        }
      } catch (error) {
        console.error('创建感谢卡失败:', error);
        status.textContent = '保存状态未确认，内容仍保留；可使用同一页面重试。'; showToast('感谢卡尚未确认保存');
      } finally {
        if (document.body.contains(button)) { button.disabled = false; button.textContent = '保存'; }
      }
    }

    function showFamilyTool(type) {
      const configs = {
        caregiver: ['照护者恢复与替班计划', [['state','我现在的状态','如：很累、需要休息'],['helper','可以联系的替班人','姓名与联系方式'],['rest','今天最小恢复行动','如：由家人接手30分钟，我去吃饭']], '如果您也有伤害自己或他人的想法，或无法保证安全，请立即联系 120/110 和可信成人。'],
        grandparent: ['隔代沟通三种模板', [['scene','需要沟通的具体场景','只写事实，不给老人贴标签'],['gentle','温和说服型','我知道您是关心孩子，我们先一起试试……'],['education','科普解释型','专业人员建议这样做，是因为……'],['boundary','边界设定型','这件事我们会按已确认的方案执行，请不要……']], '模板是沟通草稿；涉及暴力、威胁时优先保证人身安全。'],
        sibling: ['手足专属时光', [['activity','本次活动','如：一起散步、单独阅读'],['time','时间与时长','如：周六 15:00，20分钟'],['feeling','完成后的感受','尊重手足不愿参与']], '不要求手足承担照护责任，也不以“懂事”为交换条件。'],
        cbt: ['五步思维记录', [['situation','1. 发生了什么','只记录可观察事实'],['thought','2. 当时的想法','脑中最先出现的话'],['emotion','3. 情绪与强度','如：焦虑 7/10'],['evidence','4. 支持/不支持想法的证据','分别写下'],['alternative','5. 更平衡的想法','不是强迫积极，而是更完整']], '此工具用于整理想法，不替代心理治疗或危机支持。']
      };
      const [title, fields, warning] = configs[type];
      const saved = JSON.parse(sessionStorage.getItem(`xingban_family_${type}`) || '{}');
      const modal = document.createElement('div'); modal.className='fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4'; modal.dataset.modal='true';
      modal.innerHTML=`<div class="bg-white w-full max-w-lg rounded-2xl p-5 max-h-[90vh] overflow-y-auto"><div class="flex justify-between mb-4"><h2 class="text-lg font-bold">${escapeText(title)}</h2><button data-ui-action="close-top-modal">✕</button></div><div class="space-y-3">${fields.map(([id,label,ph])=>`<label class="block text-sm font-medium">${escapeText(label)}<textarea id="family-${type}-${id}" rows="2" placeholder="${escapeText(ph)}" class="mt-1 w-full p-3 rounded-xl border border-border">${escapeText(saved[id]||'')}</textarea></label>`).join('')}</div><p class="mt-3 text-xs text-text-muted">${escapeText(warning)}</p><button data-ui-call="saveFamilyTool" data-ui-args="${uiArgsAttr(type,fields.map(f=>f[0]))}" class="w-full mt-4 py-3 rounded-xl bg-primary text-white font-bold">保存到当前标签页</button></div>`;
      document.body.appendChild(modal);
    }

    function saveFamilyTool(type, ids) {
      const data = { updatedAt: new Date().toISOString() }; ids.forEach(id => data[id] = document.getElementById(`family-${type}-${id}`).value.trim());
      sessionStorage.setItem(`xingban_family_${type}`, JSON.stringify(data)); closeTopModal(); showToast('已暂存到当前标签页，关闭页面后清除');
    }

    async function renderGrowth(container) {
      document.getElementById('page-title').textContent = '家长成长';
      document.getElementById('page-subtitle').textContent = '学习与进步';

      container.innerHTML = `
        <div class="p-4 space-y-4 animate-fade-in">
          <div class="text-center py-8 text-text-muted">加载中...</div>
        </div>
      `;

      try {
        const result = await apiRequest('/growth/profile', 'GET');

        if (result.success) {
          const profile = result.profile;
          const levels = ['L1','L2','L3','L4','L5'];
          const courses = MOCK_DATA.growthCourses;
          const courseCategories = ['全部', '入门', '行为干预', '情绪管理', '社交技能', '感觉统合', '沟通'];
          const unlockedAchievements = MOCK_DATA.achievements.filter(a => a.unlocked).length;

          container.innerHTML = `
            <div class="p-4 space-y-4 animate-fade-in">
              <div class="bg-gradient-to-br from-primary to-primary-dark rounded-2xl p-5 text-white card-shadow">
                <div class="flex items-center justify-between mb-4">
                  <div>
                    <div class="text-sm text-white/80">当前等级</div>
                    <div class="text-3xl font-bold">${profile.level}</div>
                  </div>
                  <div class="text-right">
                    <div class="text-sm text-white/80">学习积分</div>
                    <div class="text-3xl font-bold">${profile.growth_index}</div>
                  </div>
                </div>
                <div class="flex items-center justify-between">
                  ${levels.map((l, i) => `
                    <div class="flex flex-col items-center">
                      <div class="w-6 h-6 rounded-full ${profile.level >= l ? 'bg-white' : 'bg-white/30'} flex items-center justify-center text-xs font-bold ${profile.level >= l ? 'text-primary' : 'text-white'}">${l.replace('L','')}</div>
                      ${i < 4 ? '<div class="w-8 h-1 bg-white/30 my-1"></div>' : ''}
                    </div>
                  `).join('')}
                </div>
              </div>

              <div>
                <h3 class="font-bold text-text-primary mb-3">学习活动分布</h3>
                <div class="bg-white rounded-xl card-shadow p-4 space-y-4">
                  ${Object.entries(profile.dimensions || {}).map(([key, value]) => `
                    <div>
                      <div class="flex justify-between text-sm mb-1">
                        <span class="text-text-secondary">${key === 'knowledge' ? '知识' : key === 'practice' ? '实践' : key === 'emotion' ? '情感' : key === 'communication' ? '沟通' : key}</span>
                        <span class="text-text-primary font-medium">${value}%</span>
                      </div>
                      <div class="progress-bar">
                        <div class="progress-fill" style="width: ${value}%"></div>
                      </div>
                    </div>
                  `).join('')}
                </div>
              </div>

              <!-- 成长课程 -->
              <div>
                <div class="flex items-center justify-between mb-3">
                  <h3 class="font-bold text-text-primary">成长课程</h3>
                  <button data-nav="achievements" class="text-sm text-primary font-medium">查看成就 →</button>
                </div>
                <div class="flex gap-2 overflow-x-auto scrollbar-hide pb-2 mb-3">
                  ${courseCategories.map((cat, i) => `
                    <button data-ui-call="filterGrowthCourses" data-ui-args='["${cat}"]' class="whitespace-nowrap px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${i === 0 ? 'bg-primary text-white' : 'bg-white text-text-secondary border border-border'}" id="course-cat-${i}">${cat}</button>
                  `).join('')}
                </div>
                <div id="growth-courses-list" class="space-y-3">
                  ${renderCourseCards(courses)}
                </div>
              </div>

              <div>
                <h3 class="font-bold text-text-primary mb-3">成长记录</h3>
                <div id="growth-history" class="space-y-3">
                  <div class="text-center py-4 text-text-muted">加载中...</div>
                </div>
              </div>
            </div>
          `;

          await loadGrowthHistory();
        } else {
          container.innerHTML = `
            <div class="p-4 space-y-4 animate-fade-in">
              <div class="text-center py-8 text-text-muted">加载失败</div>
            </div>
          `;
        }
      } catch (error) {
        console.error('获取成长数据失败:', error);
        container.innerHTML = `
          <div class="p-4 space-y-4 animate-fade-in">
            <div class="text-center py-8 text-text-muted">网络错误</div>
          </div>
        `;
      }
    }

    function renderCourseCards(courses) {
      return courses.map(c => `
        <div class="bg-white rounded-xl card-shadow p-4">
          <div class="flex items-start gap-3">
            <div class="w-12 h-12 bg-primary-light/30 rounded-xl flex items-center justify-center text-2xl flex-shrink-0">${c.icon}</div>
            <div class="flex-1 min-w-0">
              <div class="flex items-center justify-between">
                <div class="font-bold text-text-primary text-sm">${c.title}</div>
                ${c.progress === 100 ? '<span class="text-xs text-success font-medium">已完成</span>' : c.progress > 0 ? '<span class="text-xs text-primary font-medium">学习中</span>' : '<span class="text-xs text-text-muted">未开始</span>'}
              </div>
              <div class="text-xs text-text-muted mt-0.5">${c.description}</div>
              <div class="flex items-center gap-3 mt-2">
                <span class="text-xs text-text-muted">📖 ${c.completed_chapters}/${c.chapters}章</span>
                <span class="text-xs text-text-muted">⏱ ${c.duration}</span>
              </div>
              <div class="progress-bar mt-2">
                <div class="progress-fill" style="width: ${c.progress}%"></div>
              </div>
              <div class="flex items-center justify-between mt-2">
                <span class="text-xs text-text-muted">${c.progress}%</span>
                <button data-ui-call="showCourseDetail" data-ui-args="[${Number(c.id)}]" class="text-xs text-primary font-medium">${c.progress === 100 ? '复习' : c.progress > 0 ? '继续学习' : '开始学习'} →</button>
              </div>
            </div>
          </div>
        </div>
      `).join('');
    }

    function filterGrowthCourses(category) {
      const categories = ['全部', '入门', '行为干预', '情绪管理', '社交技能', '感觉统合', '沟通'];
      categories.forEach((cat, i) => {
        const btn = document.getElementById('course-cat-' + i);
        if (btn) {
          btn.className = 'whitespace-nowrap px-3 py-1.5 rounded-full text-sm font-medium transition-colors ' + (cat === category ? 'bg-primary text-white' : 'bg-white text-text-secondary border border-border');
        }
      });
      const filtered = category === '全部' ? MOCK_DATA.growthCourses : MOCK_DATA.growthCourses.filter(c => c.category === category);
      document.getElementById('growth-courses-list').innerHTML = filtered.length > 0 ? renderCourseCards(filtered) : '<div class="text-center py-6 text-text-muted">该分类暂无课程</div>';
    }

    const COURSE_CONTENT = {
      1:{chapters:['理解谱系差异','沟通不只靠语言','感官与身体因素','选择有意义的目标','准备专业沟通'],goal:'从孩子优势、支持需要和真实参与出发理解孤独症',steps:['写下一个具体生活场景','分别记录孩子的优势、困难与环境要求','选择一种能增加理解、选择或参与的支持'],check:'我是在描述事实，还是用诊断标签解释一切？',caution:'本课程不能用于自行诊断；明显或突然的功能变化应由专业人员评估。'},
      2:{chapters:['ABC事实记录','健康与安全排查','调整前因','教替代沟通','安全强化','复核和停止'],goal:'用正向行为支持改善沟通、参与和安全，而不是追求服从',steps:['写清发生前—行为—发生后','先调整任务、沟通与环境','一次尝试一个低风险支持并记录孩子反应'],check:'替代方式是否比问题行为更容易，并尊重孩子拒绝？',caution:'疼痛、危机或伤害风险优先处理；基本需求不能被当作奖励扣留。'},
      3:{chapters:['发现升级信号','共同调节','建立可退出空间','恢复后沟通','心理健康红旗'],goal:'在保证安全和尊重的前提下帮助孩子恢复调节',steps:['先降低成人语速和环境刺激','提供可接受也可拒绝的支持','恢复后只复盘一个事实并共同选下一步'],check:'孩子是真的恢复，还是因为僵住、害怕或无法表达而安静？',caution:'不强抱、不围堵、不强迫呼吸；自伤、自杀、伤人、意识异常或异常少睡兴奋立即升级。'},
      4:{chapters:['选择一个场景','写描述性句子','加入视觉和AAC','预演与泛化'],goal:'用一个短故事帮助孩子预知具体场景，并保留选择和退出',steps:['每次只写一个真实场景','说明会发生什么和可以怎样表达','先在安全环境预演，再进入真实情境一个小步骤'],check:'故事是否符合孩子理解水平，并允许说不或离开？',caution:'不要把故事写成服从清单，不强迫眼神接触或掩饰痛苦。'},
      5:{chapters:['认识感官差异','排查身体原因','建立偏好档案','调整环境','专业协作','复核不适','跨场景一致'],goal:'以舒适和生活参与评价支持，而不是以安静或服从评价',steps:['记录具体声光触觉和身体状态','让孩子主动选择或拒绝低强度支持','记录舒适度、参与和不适后决定是否继续'],check:'我是否把疼痛、沟通困难或环境过载误当成“不听话”？',caution:'不强迫刷触、旋转或负重；头晕、恶心、疼痛或反应加重立即停止。'},
      6:{chapters:['承认所有沟通形式','选择核心词汇','示范而非测试','保证AAC可用','与言语治疗师协作'],goal:'让孩子在不同场景都能请求、拒绝、求助和分享',steps:['确认孩子可靠的是、否、停止和帮助表达','成人说话时同步示范图片或设备','等待并接受手势、图片、设备或近似表达'],check:'孩子在压力时能否随时获得沟通工具并表达停止？',caution:'AAC不能被没收或当奖励，不抓手强迫点选，也不承诺短期恢复口语。'}
    };
    function showCourseDetail(id) {
      const course = MOCK_DATA.growthCourses.find(c => c.id === id);
      const content = COURSE_CONTENT[id];
      if (!course || !content) return;
      const currentIndex = Math.min(course.completed_chapters, content.chapters.length - 1);
      const chapterTitle = content.chapters[currentIndex];
      const modal = document.createElement('div');
      modal.className = 'fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4';
      modal.innerHTML = `<div class="bg-white w-full max-w-lg rounded-2xl p-5 animate-fade-in max-h-[90vh] overflow-y-auto">
        <div class="flex justify-between items-start mb-4"><div><div class="text-xs text-primary">${escapeText(course.category)} · 第${currentIndex + 1}/${content.chapters.length}章</div><h3 class="text-lg font-bold mt-1">${escapeText(chapterTitle)}</h3></div><button data-ui-action="close-top-modal" aria-label="关闭课程">✕</button></div>
        <section class="rounded-xl bg-primary-light/20 p-4"><strong>本课程目标</strong><p class="text-sm text-text-secondary mt-1">${escapeText(content.goal)}</p></section>
        <section class="mt-4"><h4 class="font-bold">本章跟着做</h4><ol class="mt-2 space-y-2">${content.steps.map((step,index)=>`<li class="flex gap-3 text-sm"><span class="w-6 h-6 rounded-full bg-primary text-white flex items-center justify-center flex-shrink-0">${index+1}</span><span>${escapeText(step)}</span></li>`).join('')}</ol></section>
        <section class="mt-4 rounded-xl bg-blue-50 border border-blue-100 p-3 text-sm text-blue-900"><strong>完成前核对：</strong>${escapeText(content.check)}</section>
        <section class="mt-3 rounded-xl bg-amber-50 border border-amber-200 p-3 text-sm text-amber-900"><strong>边界与停止条件：</strong>${escapeText(content.caution)}</section>
        <details class="mt-4 rounded-xl border border-border p-3"><summary class="font-medium cursor-pointer">查看完整课程路线</summary><ol class="mt-2 space-y-1 text-sm text-text-secondary">${content.chapters.map((title,index)=>`<li>${index+1}. ${escapeText(title)}${index < course.completed_chapters ? ' · 已阅读' : index === currentIndex ? ' · 当前' : ''}</li>`).join('')}</ol></details>
        <label class="mt-4 flex items-start gap-2 text-sm"><input id="course-complete-confirm" type="checkbox" class="mt-1"><span>我已阅读本章，并理解这只是家长教育内容，不是诊断或个体治疗方案。</span></label>
        <button data-ui-call="startLearning" data-ui-args="[${Number(course.id)}]" class="w-full mt-4 py-3 rounded-xl bg-primary text-white font-medium">${course.progress === 100 ? '完成复习（不重复计分）' : '确认完成本章'}</button>
      </div>`;
      document.body.appendChild(modal);
    }

    async function startLearning(courseId) {
      const course = MOCK_DATA.growthCourses.find(c => c.id === courseId);
      if (!course) return;
      if (!document.getElementById('course-complete-confirm')?.checked) { showToast('请先阅读并确认本章边界'); return; }
      if (course.progress === 100) { closeTopModal(); showToast('已完成复习，不重复增加积分'); return; }

      try {
        const result = await apiRequest('/growth/earn', 'POST', { action: 'course_learning', points: 5, description: '课程学习进度更新：' + course.title });
        if (result.success) {
          const wasCompleted = course.progress === 100;
          // 更新mock数据中的进度
          if (course.completed_chapters < course.chapters) {
            course.completed_chapters++;
            course.progress = Math.round((course.completed_chapters / course.chapters) * 100);
          }

          // 数据联动：完成课程 ↔ 成长体系
          if (!wasCompleted && course.progress === 100) {
            addGrowthRecord('完成课程: ' + course.title, 15, 'learning');
            showToast('🎉 恭喜完成课程！获得15成长积分');
          } else {
            showToast('学习进度已更新！');
          }

          closeTopModal();
          // 重新渲染成长页面
          navigateTo('growth');
        }
      } catch (error) {
        console.error('学习失败:', error);
        showToast('网络错误');
      }
    }

    async function loadGrowthHistory() {
      try {
        const result = await apiRequest('/growth/history', 'GET');

        if (result.success && result.records.length > 0) {
          document.getElementById('growth-history').innerHTML = result.records.map(r => `
            <div class="bg-white p-3 rounded-xl card-shadow flex items-center gap-3">
              <div class="w-8 h-8 bg-success/20 rounded-full flex items-center justify-center">
                <svg class="w-4 h-4 text-success" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                  <polyline points="22 4 12 14.01 9 11.01"/>
                </svg>
              </div>
              <div class="flex-1">
                <div class="text-sm font-medium text-text-primary">${r.action}</div>
                <div class="text-xs text-text-muted">获得 ${r.points} 成长积分</div>
              </div>
              <span class="text-xs text-text-muted">${formatDate(r.created_at)}</span>
            </div>
          `).join('');
        } else {
          document.getElementById('growth-history').innerHTML = `
            <div class="text-center py-4 text-text-muted">暂无成长记录</div>
          `;
        }
      } catch (error) {
        console.error('获取成长记录失败:', error);
      }
    }

    function renderAchievements(container) {
      document.getElementById('page-title').textContent = '成就徽章';
      document.getElementById('page-subtitle').textContent = '记录每一步成长';

      const achievements = MOCK_DATA.achievements;
      const unlocked = achievements.filter(a => a.unlocked);
      const total = achievements.length;
      const unlockedCount = unlocked.length;
      const progressPercent = Math.round((unlockedCount / total) * 100);

      const categoryLabels = {
        all: '全部',
        milestone: '里程碑',
        recording: '记录',
        report: '周报',
        learning: '学习',
        strategy: '策略',
        community: '社区',
        safety: '安全'
      };
      const categories = Object.entries(categoryLabels);

      container.innerHTML = `
        <div class="p-4 space-y-4 animate-fade-in">
          <!-- 统计卡片 -->
          <div class="bg-gradient-to-br from-amber-400 to-orange-500 rounded-2xl p-5 text-white card-shadow">
            <div class="flex items-center justify-between mb-3">
              <div>
                <div class="text-sm text-white/80">已解锁成就</div>
                <div class="text-3xl font-bold">${unlockedCount}<span class="text-lg text-white/70">/${total}</span></div>
              </div>
              <div class="text-5xl">🏆</div>
            </div>
            <div class="progress-bar bg-white/30">
              <div class="h-full rounded-full bg-white" style="width: ${progressPercent}%; height: 6px; border-radius: 3px;"></div>
            </div>
            <div class="text-xs text-white/70 mt-1">${progressPercent}% 完成</div>
          </div>

          <!-- 分类筛选 -->
          <div class="flex gap-2 overflow-x-auto scrollbar-hide pb-1">
            ${categories.map(([key, label], i) => `
              <button data-ui-call="filterAchievements" data-ui-args='["${key}"]' class="whitespace-nowrap px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${i === 0 ? 'bg-primary text-white' : 'bg-white text-text-secondary border border-border'}" id="ach-cat-${i}">${label}</button>
            `).join('')}
          </div>

          <!-- 成就列表 -->
          <div id="achievements-list" class="grid grid-cols-2 gap-3">
            ${renderAchievementCards(achievements)}
          </div>
        </div>
      `;
    }

    function renderAchievementCards(achievements) {
      return achievements.map(a => {
        if (a.unlocked) {
          return `
            <div class="bg-white rounded-xl card-shadow p-4 cursor-pointer hover:shadow-md transition-shadow" data-ui-call="showAchievementDetail" data-ui-args="[${Number(a.id)}]">
              <div class="text-center">
                <div class="text-4xl mb-2">${a.icon}</div>
                <div class="font-bold text-text-primary text-sm">${escapeText(a.title)}</div>
                <div class="text-xs text-text-muted mt-1">${escapeText(a.description)}</div>
                <div class="mt-2">
                  <span class="text-xs text-success font-medium">✓ 已解锁</span>
                </div>
                <div class="text-xs text-text-muted mt-1">${formatDate(a.unlocked_at)}</div>
              </div>
            </div>
          `;
        } else {
          const progressPercent = a.target ? Math.round((a.progress / a.target) * 100) : 0;
          return `
            <div class="bg-white rounded-xl card-shadow p-4 opacity-70">
              <div class="text-center">
                <div class="text-4xl mb-2 grayscale opacity-50">${a.icon}</div>
                <div class="font-bold text-text-secondary text-sm">${escapeText(a.title)}</div>
                <div class="text-xs text-text-muted mt-1">${escapeText(a.description)}</div>
                <div class="progress-bar mt-2">
                  <div class="progress-fill" style="width: ${progressPercent}%"></div>
                </div>
                <div class="text-xs text-text-muted mt-1">${a.progress || 0}/${a.target || 0}</div>
              </div>
            </div>
          `;
        }
      }).join('');
    }

    function filterAchievements(category) {
      const categoryMap = {
        all: '全部',
        milestone: '里程碑',
        recording: '记录',
        report: '周报',
        learning: '学习',
        strategy: '策略',
        community: '社区',
        safety: '安全'
      };
      const categories = Object.entries(categoryMap);
      categories.forEach(([key, label], i) => {
        const btn = document.getElementById('ach-cat-' + i);
        if (btn) {
          btn.className = 'whitespace-nowrap px-3 py-1.5 rounded-full text-sm font-medium transition-colors ' + (key === category ? 'bg-primary text-white' : 'bg-white text-text-secondary border border-border');
        }
      });
      const filtered = category === 'all' ? MOCK_DATA.achievements : MOCK_DATA.achievements.filter(a => a.category === category);
      document.getElementById('achievements-list').innerHTML = filtered.length > 0 ? renderAchievementCards(filtered) : '<div class="col-span-2 text-center py-8 text-text-muted">该分类暂无成就</div>';
    }

    function showAchievementDetail(id) {
      const achievement = MOCK_DATA.achievements.find(a => a.id === id);
      if (!achievement || !achievement.unlocked) return;

      const categoryLabels = {
        milestone: '里程碑',
        recording: '记录',
        report: '周报',
        learning: '学习',
        strategy: '策略',
        community: '社区',
        safety: '安全'
      };

      const modal = document.createElement('div');
      modal.className = 'fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4';
      modal.innerHTML = `
        <div class="bg-white w-full max-w-sm rounded-2xl p-6 animate-fade-in">
          <div class="flex justify-between items-start mb-4">
            <h3 class="text-lg font-bold">成就详情</h3>
            <button data-ui-action="remove-overlay" class="text-text-muted">✕</button>
          </div>
          <div class="text-center py-4">
            <div class="text-6xl mb-3">${achievement.icon}</div>
            <div class="text-xl font-bold text-text-primary">${achievement.title}</div>
            <div class="text-sm text-text-secondary mt-1">${achievement.description}</div>
            <div class="inline-block mt-3 px-3 py-1 rounded-full bg-primary-light/30 text-primary text-xs font-medium">${categoryLabels[achievement.category] || achievement.category}</div>
            <div class="mt-4 pt-4 border-t border-border">
              <div class="text-sm text-text-muted">解锁时间</div>
              <div class="font-medium text-text-primary">${achievement.unlocked_at}</div>
            </div>
            <button data-ui-action="remove-overlay" class="w-full mt-4 py-2.5 rounded-xl bg-primary text-white font-medium">太棒了！</button>
          </div>
        </div>
      `;
      document.body.appendChild(modal);
    }

    function renderSafety(container) {
      document.getElementById('page-title').textContent = '安全中心';
      document.getElementById('page-subtitle').textContent = '防走失与技能';

      container.innerHTML = `
        <div class="p-4 space-y-4 animate-fade-in">
          <div class="grid grid-cols-2 gap-3">
            <button data-ui-call="showSafetyProfile" class="bg-white p-4 rounded-xl card-shadow flex flex-col items-center gap-2">
              <div class="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center">
                <svg class="w-6 h-6 text-red-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
                  <path d="M3 3v5h5"/>
                  <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/>
                  <path d="M16 21h5v-5"/>
                </svg>
              </div>
              <span class="font-medium text-text-primary">安全档案</span>
              <span class="text-xs text-text-muted">紧急联系信息</span>
            </button>
            <button data-ui-call="showSafetySkills" class="bg-white p-4 rounded-xl card-shadow flex flex-col items-center gap-2">
              <div class="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
                <svg class="w-6 h-6 text-blue-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10"/>
                </svg>
              </div>
              <span class="font-medium text-text-primary">技能训练</span>
              <span class="text-xs text-text-muted">安全技能学习</span>
            </button>
            <button data-ui-call="showWanderingPlan" class="bg-white p-4 rounded-xl card-shadow flex flex-col items-center gap-2"><div class="w-12 h-12 bg-amber-100 rounded-full flex items-center justify-center text-2xl">🗺️</div><span class="font-medium text-text-primary">防走失预案</span><span class="text-xs text-text-muted">地点与行动清单</span></button>
            <button data-ui-call="startMissingChildMode" class="bg-red-50 border-2 border-red-300 p-4 rounded-xl flex flex-col items-center gap-2"><div class="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center text-2xl">🚨</div><span class="font-bold text-red-800">孩子走失</span><span class="text-xs text-red-700">立即行动模式</span></button>
          </div>

          <div class="bg-gradient-to-br from-red-500 to-orange-500 rounded-2xl p-4 text-white">
            <div class="flex items-center gap-3 mb-2">
              <svg class="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                <line x1="12" y1="9" x2="12" y2="13"/>
                <line x1="12" y1="17" x2="12.01" y2="17"/>
              </svg>
              <span class="font-bold">紧急提醒</span>
            </div>
            <p class="text-sm text-white/90">紧急情况下请保持冷静，并立即拨打 110 或 120。</p>
          </div>
        </div>
      `;
    }

    function showSafetyProfile() {
      const modal = document.createElement('div');
      modal.className = 'fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4';
      modal.innerHTML = `
        <div class="bg-white w-full max-w-sm rounded-2xl p-6 animate-fade-in">
          <div class="flex justify-between items-start mb-4">
            <h3 class="text-lg font-bold">安全档案</h3>
            <button data-ui-action="remove-overlay" class="text-text-muted">✕</button>
          </div>
          <div class="space-y-4">
            <div>
              <div class="text-sm text-text-muted mb-1">孩子</div>
              <div class="flex items-center gap-2">
                <span class="emoji-avatar bg-primary-light/30">👦</span>
                <span class="font-medium">小明</span>
              </div>
            </div>
            <div>
              <div class="text-sm text-text-muted mb-1">诊断信息</div>
              <div class="px-3 py-2 bg-secondary/30 rounded-lg">孤独症</div>
            </div>
            <div>
              <div class="text-sm text-text-muted mb-1">紧急联系人</div>
              <div class="text-text-primary">妈妈: 138****8000</div>
              <div class="text-text-primary">爸爸: 139****9000</div>
            </div>
            <div>
              <div class="text-sm text-text-muted mb-1">过敏信息</div>
              <div class="text-text-primary">无已知过敏</div>
            </div>
            <div>
              <div class="text-sm text-text-muted mb-1">沟通注意事项</div>
              <p class="text-text-secondary text-sm">孩子对视觉提示反应较好，请使用图片卡片沟通。</p>
            </div>
          </div>
          <button data-ui-action="remove-overlay" class="w-full mt-6 py-3 rounded-xl bg-primary text-white font-medium">知道了</button>
        </div>
      `;
      document.body.appendChild(modal);
    }

    async function showSafetySkills() {
      const modal = document.createElement('div');
      modal.className = 'fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4';
      modal.innerHTML = `
        <div class="bg-white w-full max-w-sm rounded-2xl p-6 animate-fade-in">
          <div class="flex justify-between items-start mb-4">
            <h3 class="text-lg font-bold">安全技能训练</h3>
            <button data-ui-action="remove-overlay" class="text-text-muted">✕</button>
          </div>
          <div id="safety-skills-list" class="space-y-3">
            <div class="text-center py-4 text-text-muted">加载中...</div>
          </div>
          <button data-ui-action="remove-overlay" class="w-full mt-6 py-3 rounded-xl bg-primary text-white font-medium">知道了</button>
        </div>
      `;
      document.body.appendChild(modal);

      const fallbackSkills = [{id:1,name:'记住照护者姓名和电话',difficulty:'简单',description:'分段练习姓名与一个主要联系电话，不要求一次背完。'},{id:2,name:'走散后停在安全地点',difficulty:'中等',description:'练习停下、不继续奔跑，向穿制服的工作人员求助。'},{id:3,name:'识别道路与水边危险',difficulty:'中等',description:'使用真实场景照片练习“停—等—找成人”，必须由成人陪同。'}];
      const renderSafetySkillList = skills => { const list=document.getElementById('safety-skills-list'); if(!list)return; list.innerHTML=skills.map(s=>`<div class="bg-white border border-border rounded-xl p-3"><div class="flex items-center justify-between mb-2"><span class="font-medium text-text-primary">${escapeText(s.name)}</span><span class="text-xs px-2 py-0.5 bg-primary-light/30 text-primary rounded-full">${escapeText(s.difficulty)}</span></div><p class="text-xs text-text-secondary mb-2">${escapeText(s.description)}</p><input id="safety-practice-request-${Number(s.id)}" type="hidden" value="${newClientRequestId()}"><p id="safety-practice-status-${Number(s.id)}" class="text-xs text-text-muted mb-2" role="status">尚未记录；只有真实练习完成后才点击。</p><button id="safety-practice-button-${Number(s.id)}" data-ui-call="practiceSkill" data-ui-args="[${Number(s.id)}]" class="w-full py-2 bg-primary-light/30 text-primary rounded-lg text-sm disabled:opacity-60">记录完成一次真实练习</button></div>`).join(''); };
      renderSafetySkillList(fallbackSkills);

      try {
        const result = await apiRequest('/safety/skills', 'GET');

        if (result.success) {
          renderSafetySkillList(result.skills);
        } else {
          console.warn('使用本地安全技能清单');
        }
      } catch (error) {
        console.error('获取安全技能失败:', error);
      }
    }

    const safetyPracticeInFlight = new Set();
    async function practiceSkill(skillId) {
      if (safetyPracticeInFlight.has(skillId)) return;
      if (!confirm('请只在成人陪同、真实完成练习后记录。确认已完成本次练习吗？')) return;
      const childId = Number(selectedChild?.id || MOCK_DATA.children?.[0]?.id);
      const requestId = document.getElementById(`safety-practice-request-${skillId}`)?.value;
      const status = document.getElementById(`safety-practice-status-${skillId}`);
      const button = document.getElementById(`safety-practice-button-${skillId}`);
      if (!childId) { showToast('请先建立或选择儿童档案'); return; }
      if (navigator.onLine === false) { if(status)status.textContent='未记录：当前网络已断开；本次真实练习不会被冒充为已保存。'; showToast('当前网络已断开，练习尚未记录'); return; }
      safetyPracticeInFlight.add(skillId); if(button){button.disabled=true;button.textContent='正在记录…'} if(status)status.textContent='正在保存，请勿重复点击。';
      try {
        const result = await apiRequest(`/safety/skills/${skillId}/practice`, 'POST', {
          child_id: childId,
          client_request_id: requestId,
          completed: true
        });

        if (result.success) {
          if(status)status.textContent=result.replayed?'该次练习此前已记录，未重复计数。':'已记录本次真实练习。';
          showToast(result.replayed?'该次练习此前已记录':'本次真实练习已记录');
        } else {
          throw new Error(result.error || '练习记录失败');
        }
      } catch (error) {
        if(status)status.textContent=`未确认记录：${error.message||'网络连接中断'}。可使用同一请求安全重试。`;
        showToast('练习尚未确认记录');
      } finally {
        safetyPracticeInFlight.delete(skillId); if(button){button.disabled=false;button.textContent='记录完成一次真实练习'}
      }
    }

    async function showWanderingPlan() {
      const p = (await loadSensitiveRecord('wandering_plan','xingban_wandering_plan',{})).data;
      const modal=document.createElement('div'); modal.className='fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4'; modal.dataset.modal='true';
      const fields=[['photo','近期照片与衣着描述','如：照片保存位置、今日上衣颜色'],['places','孩子常去或偏好的地点','逐行填写'],['communication','沟通与感官注意','姓名回应、是否怕警笛、沟通方式'],['contacts','信任联系人分工','谁报警、谁找常去地点、谁留守'],['meeting','家庭集合点','走散后的固定集合位置']];
      modal.innerHTML=`<div class="bg-white w-full max-w-lg rounded-2xl p-5 max-h-[90vh] overflow-y-auto"><div class="flex justify-between"><div><h2 class="text-xl font-bold">防走失预案</h2><p class="text-xs text-text-muted">建议与共同监护人定期演练</p></div><button data-ui-action="close-top-modal">✕</button></div><div class="space-y-3 mt-4">${fields.map(([id,l,ph])=>`<label class="block text-sm font-medium">${escapeText(l)}<textarea id="wander-${id}" rows="2" placeholder="${escapeText(ph)}" class="mt-1 w-full p-3 rounded-xl border border-border">${escapeText(p[id]||'')}</textarea></label>`).join('')}</div><button data-ui-call="saveWanderingPlan" class="w-full mt-4 py-3 bg-primary text-white rounded-xl font-bold">保存预案</button></div>`; document.body.appendChild(modal);
    }

    async function saveWanderingPlan(){const ids=['photo','places','communication','contacts','meeting'];const p={updatedAt:new Date().toISOString()};ids.forEach(id=>p[id]=document.getElementById('wander-'+id).value.trim());try{const saved=await persistSensitiveRecord('wandering_plan',p,'xingban_wandering_plan');closeTopModal();showToast(saved.server?'防走失预案已加密保存':'服务不可用，体验数据暂存当前设备');}catch(_){showToast('安全存储不可用，未保存敏感数据');}}

    async function startMissingChildMode() {
      const p=(await loadSensitiveRecord('wandering_plan','xingban_wandering_plan',{})).data; const modal=document.createElement('div');modal.className='fixed inset-0 bg-red-950/90 flex items-center justify-center z-[80] p-3';modal.dataset.modal='true';
      modal.innerHTML=`<div class="bg-white w-full max-w-lg rounded-2xl p-5 max-h-[94vh] overflow-y-auto"><div class="text-xs font-bold text-red-700">走失立即行动</div><h2 class="text-2xl font-bold mt-1">不要独自盲目寻找</h2><ol class="mt-4 space-y-3 list-decimal pl-5 text-sm leading-6"><li>立即确认最后出现的时间、地点和衣着，安排一名成人留在原地。</li><li>拨打 110，说明孩子年龄、沟通特点、诊断/特殊需要及可能去向。</li><li>分工检查水边、道路、交通站点、高处和孩子常去地点，不进入危险区域。</li><li>向场所工作人员出示近期照片；不要在公开群发送身份证号或完整住址。</li></ol><div class="mt-4 p-3 bg-background rounded-xl text-sm"><strong>预案摘要：</strong><p class="mt-1">常去地点：${escapeText(p.places||'尚未填写')}</p><p>沟通注意：${escapeText(p.communication||'尚未填写')}</p><p>家庭分工：${escapeText(p.contacts||'尚未填写')}</p></div><div class="grid grid-cols-2 gap-2 mt-4"><button data-ui-call="callEmergencyContact" data-ui-args='["110","报警"]' class="py-3 bg-red-700 text-white rounded-xl font-bold">拨打 110</button><button data-ui-call="showEmergencyContactManager" class="py-3 border border-border rounded-xl font-bold">联系家人</button></div><button data-ui-action="close-top-modal" class="w-full mt-2 py-3 text-text-secondary">取消 / 已找回</button></div>`;document.body.appendChild(modal);
    }

    async function renderStories(container) {
      document.getElementById('page-title').textContent = '故事工坊';
      document.getElementById('page-subtitle').textContent = '社交故事库';

      container.innerHTML = `
        <div class="p-4 space-y-4 animate-fade-in">
          <div class="flex justify-between items-center">
            <h3 class="font-bold text-text-primary">故事库</h3>
            <button data-ui-call="showNewStory" class="px-4 py-2 bg-primary text-white rounded-xl text-sm font-medium">
              + 创建
            </button>
          </div>

          <div id="story-list" class="space-y-3">
            <div class="text-center py-4 text-text-muted">加载中...</div>
          </div>
        </div>
      `;

      try {
        const result = await apiRequest('/story/library', 'GET');

        if (result.success) {
          const storyList = document.getElementById('story-list');
          storyList.innerHTML = result.stories.map(s => `
            <div data-ui-call="showStoryDetail" data-ui-args="[${Number(s.id)}]" class="bg-white p-4 rounded-xl card-shadow cursor-pointer">
              <div class="flex items-start gap-3">
                <div class="text-3xl">${s.cover_image || '📚'}</div>
                <div class="flex-1">
                  <h4 class="font-bold text-text-primary mb-1">${escapeText(s.title)}</h4>
                  <p class="text-sm text-text-secondary line-clamp-2 mb-2">${escapeText(s.content)}</p>
                  <div class="flex items-center gap-2">
                    <span class="text-xs px-2 py-0.5 bg-secondary/50 text-text-secondary rounded-full">${escapeText(s.category)}</span>
                  </div>
                </div>
              </div>
            </div>
          `).join('');
        } else {
          document.getElementById('story-list').innerHTML = `
            <div class="text-center py-4 text-text-muted">加载失败</div>
          `;
        }
      } catch (error) {
        console.error('获取故事列表失败:', error);
      }
    }

    function showNewStory() {
      const modal = document.createElement('div');
      modal.className = 'fixed inset-0 bg-black/50 flex items-end justify-center z-50';
      modal.innerHTML = `
        <div class="bg-white w-full max-w-md rounded-t-3xl p-6 modal-slide safe-area-bottom">
          <div class="flex justify-between items-center mb-4">
            <h2 class="text-lg font-bold">创建故事</h2>
            <button data-ui-action="remove-overlay" class="text-text-muted">✕</button>
          </div>
          <div class="rounded-xl bg-amber-50 border border-amber-200 p-3 text-xs text-amber-900">故事用于预告具体场景，不是服从脚本。不要强迫眼神接触、身体接触或掩饰痛苦；必须保留拒绝、求助和退出方式。</div>
          <div class="space-y-4 mt-4">
            <div>
              <label class="block text-sm text-text-secondary mb-1">标题</label>
              <input id="new-story-title" type="text" placeholder="例如：去医院前我可以知道什么" maxlength="80" class="w-full px-4 py-2.5 rounded-xl border border-border">
            </div>
            <div>
              <label class="block text-sm text-text-secondary mb-1">分类</label>
              <select id="new-story-category" class="w-full px-4 py-2.5 rounded-xl border border-border">
                <option value="emotion">情绪管理</option>
                <option value="social">社交互动</option>
                <option value="daily">日常生活</option>
                <option value="safety">安全认知</option>
              </select>
            </div>
            <div>
              <label class="block text-sm text-text-secondary mb-1">内容</label>
              <textarea id="new-story-content" placeholder="用描述性语言写一个具体场景，保留孩子说不、求助和退出的方式" maxlength="3000" class="w-full px-4 py-3 rounded-xl border border-border" rows="4"></textarea>
            </div>
            <input type="hidden" id="new-story-request-id" value="${newClientRequestId()}">
            <button id="new-story-save-button" data-ui-call="createStory" class="w-full py-3 rounded-xl bg-primary text-white font-medium disabled:opacity-60">创建</button>
            <p id="new-story-save-status" class="text-xs text-text-muted" role="status">将保存到当前儿童档案；尚未保存。</p>
          </div>
        </div>
      `;
      document.body.appendChild(modal);
    }

    async function createStory() {
      const childId = currentChildId();
      const title = document.getElementById('new-story-title').value.trim();
      const category = document.getElementById('new-story-category').value;
      const content = document.getElementById('new-story-content').value.trim();
      const button = document.getElementById('new-story-save-button');
      const status = document.getElementById('new-story-save-status');
      if (button.disabled) return;

      if (!childId) { showToast('请先选择儿童档案'); return; }
      if (!title || !content) {
        showToast('请填写完整信息');
        return;
      }
      if (navigator.onLine === false) { status.textContent = '未保存：当前网络已断开，故事内容仍保留。'; return showToast('当前离线，故事尚未保存'); }

      button.disabled = true; button.textContent = '正在保存…'; status.textContent = '正在保存到当前儿童档案，请勿重复点击。';
      try {
        const result = await apiRequest('/story/custom', 'POST', {
          child_id: childId,
          client_request_id: document.getElementById('new-story-request-id').value,
          title,
          category,
          content,
          cover_image: '📖'
        });

        if (result.success) {
          showToast(result.replayed ? '故事此前已保存，未重复创建' : '创建成功！');
          closeTopModal();
          renderStories(document.getElementById('main-content'));
        } else {
          showToast(result.error || '创建失败');
        }
      } catch (error) {
        console.error('创建故事失败:', error);
        status.textContent = '保存状态未确认，内容仍保留；可使用同一页面重试。'; showToast('故事尚未确认保存');
      } finally {
        if (document.body.contains(button)) { button.disabled = false; button.textContent = '创建'; }
      }
    }

    let activeStoryForReader = null;

    async function showStoryDetail(id) {
      const modal = document.createElement('div');
      modal.className = 'fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4';
      modal.innerHTML = `
        <div class="bg-white w-full max-w-sm rounded-2xl p-6 animate-fade-in max-h-[80vh] overflow-y-auto">
          <div class="flex justify-between items-start mb-4">
            <h3 class="text-lg font-bold">加载中...</h3>
            <button data-ui-action="remove-overlay" class="text-text-muted">✕</button>
          </div>
          <div class="text-center py-8 text-text-muted">加载中...</div>
        </div>
      `;
      document.body.appendChild(modal);

      try {
        const result = await apiRequest(`/story/library/${id}`, 'GET');

        if (result.success) {
          const story = result.story;
          activeStoryForReader = story;
          modal.innerHTML = `
            <div class="bg-white w-full max-w-sm rounded-2xl p-6 animate-fade-in max-h-[80vh] overflow-y-auto">
              <div class="flex justify-between items-start mb-4">
                <h3 class="text-lg font-bold">${escapeText(story.title)}</h3>
                <button data-ui-action="remove-overlay" class="text-text-muted">✕</button>
              </div>
              <div class="flex items-center gap-2 mb-4">
                <span class="text-xs px-2 py-0.5 bg-secondary/50 text-text-secondary rounded-full">${escapeText(story.category)}</span>
              </div>
              <p class="text-text-primary leading-relaxed mb-6">${escapeText(story.content)}</p>
              <div class="flex items-center gap-2 mb-4">
                <button data-ui-call="playStory" data-ui-args="[${Number(id)}]" class="flex-1 py-3 rounded-xl bg-primary text-white font-medium flex items-center justify-center gap-2">
                  <svg class="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                    <polygon points="5 3 19 12 5 21 5 3"/>
                  </svg>
                  <span>播放故事</span>
                </button>
              </div>
              <div class="flex items-center justify-between pt-4 border-t border-border">
                <span class="text-xs text-text-muted">播放次数: ${story.play_count || 0}</span>
              </div>
            </div>
          `;
        } else {
          modal.innerHTML = `
            <div class="bg-white w-full max-w-sm rounded-2xl p-6 animate-fade-in">
              <div class="text-center py-8 text-text-muted">加载失败</div>
              <button data-ui-action="remove-overlay" class="w-full mt-4 py-3 rounded-xl bg-primary text-white font-medium">关闭</button>
            </div>
          `;
        }
      } catch (error) {
        console.error('获取故事详情失败:', error);
        modal.innerHTML = `
          <div class="bg-white w-full max-w-sm rounded-2xl p-6 animate-fade-in">
            <div class="text-center py-8 text-text-muted">网络错误</div>
            <button data-ui-action="remove-overlay" class="w-full mt-4 py-3 rounded-xl bg-primary text-white font-medium">关闭</button>
          </div>
        `;
      }
    }

    async function playStory(id) {
      const story = activeStoryForReader && Number(activeStoryForReader.id) === Number(id) ? activeStoryForReader : MOCK_DATA.storyLibrary.find(s => Number(s.id) === Number(id));
      if (!story) return;

      // 打开故事阅读模式
      const modal = document.createElement('div');
      modal.id = 'story-reader';
      modal.className = 'fixed inset-0 bg-[#1a1a2e] z-[60] flex flex-col';
      modal.innerHTML = `
        <div class="flex items-center justify-between p-4 text-white/60">
          <button data-ui-call="closeStoryReader" class="text-sm">✕ 关闭</button>
          <span class="text-sm">${escapeText(story.title)}</span>
          <span id="story-progress-text" class="text-xs">阅读模式</span>
        </div>
        <div class="flex-1 overflow-y-auto p-6 max-w-md mx-auto w-full">
          <div class="text-center mb-6">
            <span class="text-5xl">${story.cover_image || '📚'}</span>
          </div>
          <h2 class="text-xl font-bold text-white text-center mb-6">${escapeText(story.title)}</h2>
          <div id="story-reading-content" class="text-white/90 leading-loose text-lg space-y-4">
            ${String(story.content||'').split(/[。！？]/).filter(s => s.trim()).map(s => `<p class="story-paragraph opacity-0 transition-opacity duration-500">${escapeText(s.trim())}。</p>`).join('')}
          </div>
        </div>
        <div class="p-4 max-w-md mx-auto w-full">
          <div class="flex items-center justify-center gap-6 text-white/60">
            <button data-ui-call="storyPrevParagraph" class="w-12 h-12 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20">
              <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="15 18 9 12 15 6"/>
              </svg>
            </button>
            <button id="story-play-btn" data-ui-call="toggleStoryAutoPlay" data-ui-args="[${Number(id)}]" class="w-14 h-14 rounded-full bg-primary flex items-center justify-center hover:bg-primary-dark">
              <svg id="story-play-icon" class="w-6 h-6 text-white" viewBox="0 0 24 24" fill="currentColor">
                <polygon points="5 3 19 12 5 21 5 3"/>
              </svg>
            </button>
            <button data-ui-call="storyNextParagraph" class="w-12 h-12 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20">
              <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="9 18 15 12 9 6"/>
              </svg>
            </button>
          </div>
          <div class="progress-bar mt-4">
            <div id="story-progress-bar" class="progress-fill" style="width: 0%"></div>
          </div>
        </div>
      `;
      document.body.appendChild(modal);

      // 初始化段落显示
      currentStoryParagraph = 0;
      updateStoryParagraphs();
    }

    let currentStoryParagraph = 0;
    let storyAutoPlayTimer = null;

    function closeStoryReader() {
      if (storyAutoPlayTimer) clearInterval(storyAutoPlayTimer);
      storyAutoPlayTimer = null;
      document.getElementById('story-reader')?.remove();
    }

    function updateStoryParagraphs() {
      const paragraphs = document.querySelectorAll('.story-paragraph');
      paragraphs.forEach((p, i) => {
        p.style.opacity = i <= currentStoryParagraph ? '1' : '0';
      });

      // 更新进度条
      const total = paragraphs.length;
      const progress = total > 0 ? ((currentStoryParagraph + 1) / total * 100) : 0;
      const bar = document.getElementById('story-progress-bar');
      if (bar) bar.style.width = progress + '%';

      const text = document.getElementById('story-progress-text');
      if (text) text.textContent = `${currentStoryParagraph + 1}/${total}`;
    }

    function storyNextParagraph() {
      const paragraphs = document.querySelectorAll('.story-paragraph');
      if (currentStoryParagraph < paragraphs.length - 1) {
        currentStoryParagraph++;
        updateStoryParagraphs();
      }
    }

    function storyPrevParagraph() {
      if (currentStoryParagraph > 0) {
        currentStoryParagraph--;
        updateStoryParagraphs();
      }
    }

    function toggleStoryAutoPlay(id) {
      const icon = document.getElementById('story-play-icon');
      if (storyAutoPlayTimer) {
        clearInterval(storyAutoPlayTimer);
        storyAutoPlayTimer = null;
        if (icon) icon.innerHTML = '<polygon points="5 3 19 12 5 21 5 3"/>';
      } else {
        storyAutoPlayTimer = setInterval(() => {
          const paragraphs = document.querySelectorAll('.story-paragraph');
          if (currentStoryParagraph < paragraphs.length - 1) {
            storyNextParagraph();
          } else {
            clearInterval(storyAutoPlayTimer);
            storyAutoPlayTimer = null;
            if (icon) icon.innerHTML = '<polygon points="5 3 19 12 5 21 5 3"/>';
            showToast('故事播放完成');
          }
        }, 2000);
        if (icon) icon.innerHTML = '<rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>';
      }

      try { apiRequest('/story/play', 'POST', { story_id: id }); } catch(e) {}
    }

    function renderAI(container) {
      document.getElementById('page-title').textContent = '观察摘要';
      document.getElementById('page-subtitle').textContent = '只整理记录，不替孩子下结论';

      // 行为情绪分类统计
      const emotionCounts = { '积极': 0, '平静': 0, '消极': 0, '焦虑': 0, '烦躁': 0 };
      MOCK_DATA.behaviors.forEach(b => { if (emotionCounts[b.emotion] !== undefined) emotionCounts[b.emotion]++; });
      const maxEmotionCount = Math.max(...Object.values(emotionCounts), 1);
      const emotionColors = { '积极': '#10b981', '平静': '#3b82f6', '消极': '#f59e0b', '焦虑': '#ef4444', '烦躁': '#8b5cf6' };

      // AI智能建议
      const aiSuggestions = [];
      const negativeCount = (emotionCounts['消极'] || 0) + (emotionCounts['焦虑'] || 0) + (emotionCounts['烦躁'] || 0);
      const positiveCount = emotionCounts['积极'] || 0;
      if (negativeCount > positiveCount) {
        aiSuggestions.push({ icon: '📝', title: '近期需要更多关注', desc: '记录中待改善情绪较多。请结合睡眠、精力、用药变化和持续时间观察；若出现自伤、自杀言语、伤人或意识异常，请立即使用紧急支持并联系专业人员。', priority: 'high' });
      }
      if (emotionCounts['焦虑'] > 2) {
        aiSuggestions.push({ icon: '◔', title: '核对焦虑标签记录', desc: '这些是家长选择的标签，不代表焦虑障碍或趋势。请核对发生时间、疼痛、睡眠、环境变化和孩子的表达。', priority: 'high' });
      }
      if (emotionCounts['积极'] >= 3) {
        aiSuggestions.push({ icon: '○', title: '保留孩子状态较好的情境', desc: '记录哪些环境、活动和支持与孩子状态较好同时出现，供家长和专业人员核对；不能据此证明因果。', priority: 'medium' });
      }
      aiSuggestions.push({ icon: '📊', title: '按需要记录即可', desc: '本页只汇总家庭观察，不做诊断。无需为了连续天数增加负担；记录明显变化及发生时间更有帮助。', priority: 'low' });
      aiSuggestions.push({ icon: '□', title: '准备一个可核对的问题', desc: '从原始记录中选一个最需要帮助的问题，到专业协作生成会前沟通单；目标和干预由家长与专业人员共同确认。', priority: 'medium' });

      container.innerHTML = `
        <div class="p-4 space-y-4 animate-fade-in">
          <div class="bg-gradient-to-br from-cyan-500 to-blue-500 rounded-2xl p-5 text-white card-shadow">
            <div class="flex items-center gap-3 mb-4">
              <svg class="w-8 h-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10"/>
                <line x1="12" y1="8" x2="12" y2="12"/>
                <line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
              <div>
                <div class="font-bold">家庭观察摘要</div>
                <div class="text-sm text-white/80">不是诊断，不能替代儿童精神科评估</div>
              </div>
            </div>
            <div class="grid grid-cols-2 gap-4">
              <div>
                <div class="text-2xl font-bold">${MOCK_DATA.behaviors.length}</div>
                <div class="text-xs text-white/70">摘要记录数</div>
              </div>
              <div>
                <div class="text-2xl font-bold">家庭填写</div>
                <div class="text-xs text-white/70">数据来源</div>
              </div>
              <div>
                <div class="text-2xl font-bold">未审核</div>
                <div class="text-xs text-white/70">专业复核状态</div>
              </div>
              <div>
                <div class="text-2xl font-bold">今天</div>
                <div class="text-xs text-white/70">最后分析</div>
              </div>
            </div>
          </div>

          <!-- 快速分析 -->
          <div>
            <h3 class="font-bold text-text-primary mb-3">快速分析</h3>
            <button data-ui-call="runAIAnalysis" class="w-full bg-white p-4 rounded-xl card-shadow flex items-center gap-4 hover:shadow-md transition-shadow active:scale-[0.98]">
              <div class="w-12 h-12 bg-cyan-100 rounded-xl flex items-center justify-center">
                <svg class="w-6 h-6 text-cyan-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0z"/>
                  <path d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/>
                </svg>
              </div>
              <div class="flex-1 text-left">
                <div class="font-medium text-text-primary">分析最近行为记录</div>
                <div class="text-xs text-text-muted">生成记录摘要；高风险情况请直接联系专业服务</div>
              </div>
              <svg class="w-5 h-5 text-text-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M9 18l6-6-6-6"/>
              </svg>
            </button>
          </div>

          <!-- 行为趋势图表 -->
          <div>
            <h3 class="font-bold text-text-primary mb-3">情绪分布统计</h3>
            <div class="bg-white rounded-xl card-shadow p-4 space-y-3">
              ${Object.entries(emotionCounts).map(([emotion, count]) => `
                <div class="flex items-center gap-3">
                  <span class="text-xs w-8 text-text-secondary">${emotion}</span>
                  <div class="flex-1 h-6 bg-gray-100 rounded-full overflow-hidden">
                    <div class="h-full rounded-full transition-all duration-500" style="width: ${Math.max(count / maxEmotionCount * 100, 2)}%; background-color: ${emotionColors[emotion]}"></div>
                  </div>
                  <span class="text-xs w-6 text-right font-medium" style="color: ${emotionColors[emotion]}">${count}</span>
                </div>
              `).join('')}
              <div class="flex items-center gap-3 pt-2 border-t border-border">
                <span class="text-xs text-text-muted">总计 ${MOCK_DATA.behaviors.length} 条记录</span>
                <span class="text-xs text-text-muted ml-auto">标签分布不代表诊断或情绪趋势</span>
              </div>
            </div>
          </div>

          <!-- 能力评估边界 -->
          <div>
            <h3 class="font-bold text-text-primary mb-3">能力评估状态</h3>
            <div class="bg-white rounded-xl card-shadow p-4">
              <div class="font-medium text-text-primary">未提供标准化能力分数</div>
              <p class="text-sm text-text-secondary mt-2">社交、沟通、情绪和自理不能由少量家庭记录自动评分。需要评估时，请由具备资质的专业人员选择适龄工具，并结合家庭与学校多场景信息。</p>
            </div>
          </div>

          <!-- AI智能建议 -->
          <div>
            <h3 class="font-bold text-text-primary mb-3">下一步核对</h3>
            <div class="space-y-3">
              ${aiSuggestions.map(s => {
                const priorityColors = { high: 'bg-danger/10 text-danger', medium: 'bg-warning/10 text-warning', low: 'bg-success/10 text-success' };
                const priorityLabels = { high: '重要', medium: '建议', low: '提示' };
                return `
                  <div class="bg-white p-4 rounded-xl card-shadow">
                    <div class="flex items-start gap-3">
                      <span class="text-2xl">${s.icon}</span>
                      <div class="flex-1">
                        <div class="flex items-center gap-2 mb-1">
                          <span class="font-medium text-text-primary text-sm">${escapeText(s.title)}</span>
                          <span class="text-xs px-1.5 py-0.5 rounded ${priorityColors[s.priority]}">${priorityLabels[s.priority]}</span>
                        </div>
                        <p class="text-xs text-text-secondary leading-relaxed">${s.desc}</p>
                      </div>
                    </div>
                  </div>
                `;
              }).join('')}
            </div>
          </div>

          <!-- 分析记录 -->
          <div>
            <h3 class="font-bold text-text-primary mb-3">分析记录</h3>
            <div class="space-y-3">
              <div class="bg-white p-4 rounded-xl card-shadow">
                <div class="flex items-center justify-between mb-2">
                  <span class="font-medium text-text-primary">行为分类分析</span>
                  <span class="text-xs text-warning">自动摘要 · 未经专业复核</span>
                </div>
                <p class="text-sm text-text-secondary">当前体验数据不足以判断哭闹是否增加。请返回原始记录核对日期、场景、持续时间和记录遗漏。</p>
                <div class="flex gap-2 mt-2">
                  <span class="text-xs px-2 py-0.5 bg-primary-light/50 text-primary rounded-full">正向强化</span>
                  <span class="text-xs px-2 py-0.5 bg-secondary/50 text-text-secondary rounded-full">行为引导</span>
                </div>
              </div>
              <div class="bg-white p-4 rounded-xl card-shadow">
                <div class="flex items-center justify-between mb-2">
                  <span class="font-medium text-text-primary">情绪趋势分析</span>
                  <span class="text-xs text-warning">自动摘要 · 未经专业复核</span>
                </div>
                <p class="text-sm text-text-secondary">标签分布不能证明情绪趋势，也不能自动选择干预。请核对睡眠、疼痛、沟通、感官和近期事件。</p>
                <div class="flex gap-2 mt-2">
                  <span class="text-xs px-2 py-0.5 bg-success/20 text-success rounded-full">感官安抚</span>
                  <span class="text-xs px-2 py-0.5 bg-secondary/50 text-text-secondary rounded-full">情绪调节</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      `;
    }

    function runAIAnalysis() {
      showToast('已按当前家庭记录重新汇总；请核对原始记录');
      navigateTo('ai');
    }

    async function renderCommunity(container) {
      document.getElementById('page-title').textContent = '用户社区';
      document.getElementById('page-subtitle').textContent = '家长互助交流';

      const categories = ['全部', '综合讨论', '训练心得', '情感分享', '资源推荐', '问题求助'];
      const categoryValues = ['全部', 'general', 'training', 'emotion', 'resource', 'question'];

      container.innerHTML = `
        <div class="p-4 space-y-4 animate-fade-in">
          <div class="rounded-xl bg-amber-50 border border-amber-200 p-3 text-sm text-amber-900"><strong>社区不是危机热线。</strong> 如孩子或照护者当前可能伤害自己/他人、意识异常或失控，请不要等待回复，立即使用“紧急支持”并联系 120/110。</div>
          <div class="flex justify-between items-center gap-2">
            <h3 class="font-bold text-text-primary">社区帖子</h3>
            <div class="flex gap-2"><button data-ui-call="showMyCommunityReports" class="px-3 py-2 border border-border bg-white rounded-xl text-sm font-medium">我的举报</button><button data-ui-call="showNewPost" class="px-4 py-2 bg-primary text-white rounded-xl text-sm font-medium">+ 发帖</button></div>
          </div>

          <!-- 搜索栏 -->
          <div class="relative">
            <svg class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="11" cy="11" r="8"/>
              <line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <input type="text" id="community-search" placeholder="搜索帖子..." value="${escapeText(communityFilter.search)}"
              data-ui-input="community"
              class="w-full pl-10 pr-4 py-2.5 rounded-xl border border-border bg-white text-sm focus:outline-none focus:ring-2 focus:ring-primary">
          </div>

          <!-- 分类筛选 -->
          <div class="flex gap-2 overflow-x-auto scrollbar-hide">
            ${categories.map((cat, i) => `
              <button data-ui-call="filterCommunityByCategory" data-ui-args='["${categoryValues[i]}"]' class="px-3 py-1.5 rounded-lg ${communityFilter.category === categoryValues[i] ? 'bg-primary text-white' : 'bg-white border border-border text-text-secondary'} text-sm whitespace-nowrap">${cat}</button>
            `).join('')}
          </div>

          <div id="post-list" class="space-y-3">
            <div class="text-center py-4 text-text-muted">加载中...</div>
          </div>
        </div>
      `;

      try {
        const result = await apiRequest('/community/posts', 'GET');

        if (result.success) {
          const filteredPosts = getFilteredCommunityPosts(result.posts);
          const postList = document.getElementById('post-list');
          postList.innerHTML = filteredPosts.length > 0 ? filteredPosts.map(p => `
            <div data-ui-call="showPostDetail" data-ui-args="[${Number(p.id)}]" class="bg-white p-4 rounded-xl card-shadow cursor-pointer">
              <h4 class="font-bold text-text-primary mb-2">${escapeText(p.title)}</h4>
              <p class="text-sm text-text-secondary line-clamp-2 mb-3">${escapeText(p.content)}</p>
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-2">
                  <span class="text-xs px-2 py-0.5 bg-secondary/50 text-text-secondary rounded-full">${escapeText(getCategoryName(p.category))}</span>
                </div>
                <div class="flex items-center gap-3 text-xs text-text-muted">
                  <span class="flex items-center gap-1">
                    <svg class="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
                    </svg>
                    ${p.likes}
                  </span>
                  <span class="flex items-center gap-1">
                    <svg class="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                    </svg>
                    ${p.comments_count}
                  </span>
                </div>
              </div>
            </div>
          `).join('') : `
            <div class="text-center py-8 text-text-muted">
              ${communityFilter.search || communityFilter.category !== '全部' ? '没有匹配的帖子' : '暂无帖子'}
            </div>
          `;
        } else {
          document.getElementById('post-list').innerHTML = `
            <div class="text-center py-4 text-text-muted">加载失败</div>
          `;
        }
      } catch (error) {
        console.error('获取帖子列表失败:', error);
      }
    }

    function getFilteredCommunityPosts(posts) {
      let filtered = [...posts];
      if (communityFilter.category !== '全部') {
        filtered = filtered.filter(p => p.category === communityFilter.category);
      }
      if (communityFilter.search) {
        const q = communityFilter.search.toLowerCase();
        filtered = filtered.filter(p =>
          p.title.toLowerCase().includes(q) ||
          p.content.toLowerCase().includes(q)
        );
      }
      return filtered;
    }

    function onCommunitySearch(value) {
      communityFilter.search = value;
      renderCommunity(document.getElementById('main-content'));
    }

    function filterCommunityByCategory(category) {
      communityFilter.category = category;
      renderCommunity(document.getElementById('main-content'));
    }

    function getCategoryName(category) {
      const names = {
        'general': '综合讨论',
        'training': '训练心得',
        'emotion': '情感分享',
        'resource': '资源推荐',
        'question': '问题求助'
      };
      return names[category] || category;
    }

    function showNewPost() {
      const modal = document.createElement('div');
      modal.className = 'fixed inset-0 bg-black/50 flex items-end justify-center z-50';
      modal.innerHTML = `
        <div class="bg-white w-full max-w-md rounded-t-3xl p-6 modal-slide safe-area-bottom">
          <div class="flex justify-between items-center mb-4">
            <h2 class="text-lg font-bold">发布帖子</h2>
            <button data-ui-action="remove-overlay" class="text-text-muted">✕</button>
          </div>
          <div class="space-y-4">
            <div>
              <label class="block text-sm text-text-secondary mb-1">标题</label>
              <input id="new-post-title" type="text" placeholder="用不含个人身份信息的文字概括问题" maxlength="80" class="w-full px-4 py-2.5 rounded-xl border border-border">
            </div>
            <div>
              <label class="block text-sm text-text-secondary mb-1">分类</label>
              <select id="new-post-category" class="w-full px-4 py-2.5 rounded-xl border border-border">
                <option value="general">综合讨论</option>
                <option value="training">训练心得</option>
                <option value="emotion">情感分享</option>
                <option value="resource">资源推荐</option>
                <option value="question">问题求助</option>
              </select>
            </div>
            <div>
              <label class="block text-sm text-text-secondary mb-1">内容</label>
              <textarea id="new-post-content" placeholder="描述事实和希望获得的支持；不要发布姓名、学校、住址、电话或病历图片" maxlength="2000" class="w-full px-4 py-3 rounded-xl border border-border" rows="4"></textarea>
            </div>
            <label class="flex items-start gap-3 p-3 rounded-xl bg-background text-sm"><input id="new-post-anonymous" type="checkbox" checked class="mt-1 accent-primary"><span><strong class="block">匿名发布</strong><span class="text-xs text-text-muted">默认不展示昵称；发布前请删除姓名、学校、电话、诊断证明和照片信息。</span></span></label>
            <p class="text-xs text-danger">社区不是危机热线。如孩子有即时自伤、自杀或伤人风险，请使用紧急支持并联系 120/110。</p>
            <input id="new-post-request-id" type="hidden" value="${newClientRequestId()}">
            <p id="new-post-status" class="text-xs text-text-muted" role="status">尚未发布。网络失败时文字会保留在本页。</p>
            <button id="new-post-button" data-ui-call="createPost" class="w-full py-3 rounded-xl bg-primary text-white font-medium disabled:opacity-60">发布</button>
          </div>
        </div>
      `;
      document.body.appendChild(modal);
    }

    let communityPostInFlight = false;
    async function createPost() {
      if (communityPostInFlight) return;
      const title = document.getElementById('new-post-title').value.trim();
      const category = document.getElementById('new-post-category').value;
      const content = document.getElementById('new-post-content').value.trim();
      const anonymous = document.getElementById('new-post-anonymous').checked;
      const client_request_id = document.getElementById('new-post-request-id').value;
      const status = document.getElementById('new-post-status');
      const button = document.getElementById('new-post-button');

      if (!title || !content) {
        showToast('请填写完整信息');
        return;
      }

      if (navigator.onLine === false) {
        status.textContent = '未发布：当前网络已断开，文字仍保留在本页。';
        showToast('当前网络已断开，帖子尚未发布');
        return;
      }

      communityPostInFlight = true;
      button.disabled = true;
      button.textContent = '正在发布…';
      status.textContent = '正在发布，请勿重复点击。';
      try {
        const result = await apiRequest('/community/posts', 'POST', { title, content, category, anonymous, client_request_id });

        if (result.success && result.held_for_review) {
          closeTopModal();
          showCommunitySafetyHold(result);
        } else if (result.success) {
          showToast(result.replayed ? '这篇帖子此前已经发布' : '发布成功！');

          // 数据联动：社区互动 ↔ 成就（检查"社区之星"成就）
          const communityAchievement = MOCK_DATA.achievements.find(a => a.id === 6);
          if (communityAchievement && !communityAchievement.unlocked) {
            communityAchievement.progress = (communityAchievement.progress || 0) + 1;
            if (communityAchievement.progress >= communityAchievement.target) {
              communityAchievement.unlocked = true;
              communityAchievement.unlocked_at = new Date().toISOString().split('T')[0];
              setTimeout(() => showToast('🏆 成就解锁：社区之星'), 1500);
            }
          }

          closeTopModal();
          renderCommunity(document.getElementById('main-content'));
        } else {
          showToast(result.error || '发布失败');
        }
      } catch (error) {
        console.error('发布帖子失败:', error);
        status.textContent = `未确认发布：${error.message || '网络连接中断'}。文字仍在本页，可用同一内容重试。`;
        showToast('帖子尚未确认发布，内容已保留');
      } finally {
        communityPostInFlight = false;
        const currentButton = document.getElementById('new-post-button');
        if (currentButton) { currentButton.disabled = false; currentButton.textContent = '发布'; }
      }
    }

    async function showPostDetail(id) {
      const modal = document.createElement('div');
      modal.className = 'fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4';
      modal.innerHTML = `
        <div class="bg-white w-full max-w-sm rounded-2xl p-6 animate-fade-in max-h-[80vh] overflow-y-auto">
          <div class="flex justify-between items-start mb-4">
            <h3 class="text-lg font-bold">加载中...</h3>
            <button data-ui-action="remove-overlay" class="text-text-muted">✕</button>
          </div>
          <div class="text-center py-8 text-text-muted">加载中...</div>
        </div>
      `;
      document.body.appendChild(modal);

      try {
        const [postResult, commentsResult] = await Promise.all([
          apiRequest(`/community/posts/${id}`, 'GET'),
          apiRequest(`/community/posts/${id}/comments`, 'GET')
        ]);

        if (postResult.success) {
          const post = postResult.post;
          const comments = commentsResult.success ? commentsResult.comments : [];

          modal.innerHTML = `
            <div class="bg-white w-full max-w-sm rounded-2xl p-6 animate-fade-in max-h-[80vh] flex flex-col">
              <div class="flex justify-between items-start mb-4">
                <h3 class="text-lg font-bold">${escapeText(post.title)}</h3>
                <button data-ui-action="remove-overlay" class="text-text-muted">✕</button>
              </div>
              <div class="flex items-center gap-2 mb-4">
                <span class="text-xs px-2 py-0.5 bg-secondary/50 text-text-secondary rounded-full">${escapeText(getCategoryName(post.category))}</span>
              </div>
              <p class="text-text-primary leading-relaxed mb-4 flex-1">${escapeText(post.content)}</p>

              <div class="flex items-center gap-4 mb-4 pb-4 border-b border-border">
                <button data-ui-call="likePost" data-ui-args="[${Number(id)}]" class="flex items-center gap-1 text-sm text-text-muted hover:text-danger transition-colors">
                  <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
                  </svg>
                  <span id="post-likes-${id}">${post.likes}</span>
                </button>
                <button data-ui-call="reportCommunityContent" data-ui-args="[${Number(id)}]" class="ml-auto text-xs text-text-muted hover:text-danger">举报</button>
                <button data-ui-call="blockCommunityContent" data-ui-args="[${Number(id)}]" class="text-xs text-text-muted hover:text-danger">屏蔽</button>
              </div>

              <div class="mb-4">
                <h4 class="font-medium text-text-primary mb-2">评论 (${comments.length})</h4>
                <div id="comments-list-${id}" class="space-y-3 max-h-[200px] overflow-y-auto">
                  ${comments.map(c => `
                    <div class="bg-secondary/30 p-3 rounded-lg">
                      <p class="text-sm text-text-primary">${escapeText(c.content)}</p>
                    </div>
                  `).join('') || '<div class="text-center py-4 text-text-muted text-sm">暂无评论</div>'}
                </div>
              </div>

              <div class="flex gap-2">
                <input id="comment-input-${id}" type="text" placeholder="写下支持性评论，不提供诊断或用药建议" maxlength="500" class="flex-1 px-4 py-2 rounded-xl border border-border">
                <input id="comment-request-id-${id}" type="hidden" value="${newClientRequestId()}">
                <button id="comment-button-${id}" data-ui-call="addComment" data-ui-args="[${Number(id)}]" class="px-4 py-2 bg-primary text-white rounded-xl text-sm disabled:opacity-60">发送</button>
              </div>
              <p id="comment-status-${id}" class="mt-2 text-xs text-text-muted" role="status">尚未发送；失败时评论会保留。</p>
            </div>
          `;
        } else {
          modal.innerHTML = `
            <div class="bg-white w-full max-w-sm rounded-2xl p-6 animate-fade-in">
              <div class="text-center py-8 text-text-muted">加载失败</div>
              <button data-ui-action="remove-overlay" class="w-full mt-4 py-3 rounded-xl bg-primary text-white font-medium">关闭</button>
            </div>
          `;
        }
      } catch (error) {
        console.error('获取帖子详情失败:', error);
        modal.innerHTML = `
          <div class="bg-white w-full max-w-sm rounded-2xl p-6 animate-fade-in">
            <div class="text-center py-8 text-text-muted">网络错误</div>
            <button data-ui-action="remove-overlay" class="w-full mt-4 py-3 rounded-xl bg-primary text-white font-medium">关闭</button>
          </div>
        `;
      }
    }

    async function likePost(id) {
      try {
        const result = await apiRequest(`/community/posts/${id}/like`, 'POST');

        if (result.success) {
          const likesEl = document.getElementById(`post-likes-${id}`);
          if (likesEl) likesEl.textContent = result.likes;
          showToast(result.message);
        } else {
          showToast(result.error || '操作失败');
        }
      } catch (error) {
        console.error('点赞失败:', error);
        showToast('网络错误');
      }
    }

    function reportCommunityContent(id) {
      const modal=document.createElement('div');modal.className='fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-[70] p-0 sm:p-4';modal.dataset.modal='true';
      modal.innerHTML=`<div class="bg-white w-full max-w-md rounded-t-3xl sm:rounded-2xl p-5"><div class="flex justify-between"><h2 class="text-lg font-bold">举报社区内容</h2><button data-ui-action="close-top-modal">✕</button></div><p class="text-xs text-text-muted mt-2">举报会生成可查询工单；若有人当前可能受伤，不要等待审核。</p><label class="block text-sm font-medium mt-4">原因<select id="community-report-reason" class="mt-1 w-full p-3 rounded-xl border border-border"><option value="crisis">涉及自伤、伤人或即时危险</option><option value="privacy">泄露儿童或家庭隐私</option><option value="harassment">骚扰、攻击或歧视</option><option value="misinformation">疑似医疗错误信息</option><option value="fraud">诈骗或违规推销</option><option value="other">其他</option></select></label><label class="block text-sm font-medium mt-3">补充说明<textarea id="community-report-details" maxlength="500" rows="3" class="mt-1 w-full p-3 rounded-xl border border-border" placeholder="不要重复粘贴不必要的隐私信息"></textarea></label><input id="community-report-request-id" type="hidden" value="${newClientRequestId()}"><p id="community-report-status" class="mt-3 text-xs text-text-muted" role="status">尚未提交。网络失败时内容会保留在本页。</p><button id="community-report-button" data-ui-call="submitCommunityReport" data-ui-args="[${Number(Number(id))}]" class="w-full mt-4 py-3 rounded-xl bg-primary text-white font-bold disabled:opacity-60">提交举报</button></div>`;
      document.body.appendChild(modal);
    }
    let communityReportInFlight=false;
    async function submitCommunityReport(id){if(communityReportInFlight)return;const reason=document.getElementById('community-report-reason')?.value;const details=document.getElementById('community-report-details')?.value.trim()||'';const client_request_id=document.getElementById('community-report-request-id')?.value,status=document.getElementById('community-report-status'),button=document.getElementById('community-report-button');if(navigator.onLine===false){status.textContent='未提交：当前网络已断开；如有即时危险请直接联系120/110。';showToast('当前网络已断开，举报尚未提交');return}communityReportInFlight=true;button.disabled=true;button.textContent='正在提交工单…';status.textContent='正在提交，请勿重复点击；即时危险不要等待平台。';try{const result=await apiRequest('/community/reports','POST',{target_type:'post',target_id:id,reason,details,client_request_id});if(!result.success)throw new Error(result.error||'举报失败');closeTopModal();if(reason==='crisis'){showCommunitySafetyHold({...result,safety:{title:'举报已进入紧急优先队列',actions:result.safety?.actions||['不要等待社区回复','立即联系120/110或既往就诊机构']}})}else{showToast(result.replayed?`举报此前已提交，工单号 ${result.case_ref}`:`举报已提交，工单号 ${result.case_ref}`)}}catch(error){status.textContent=`未提交：${error.message||'网络连接中断'}。内容仍在本页，可重试；即时危险请直接求助。`;showToast(error.message||'举报尚未提交')}finally{communityReportInFlight=false;const current=document.getElementById('community-report-button');if(current){current.disabled=false;current.textContent='提交举报'}}}
    async function showMyCommunityReports(){const modal=document.createElement('div');modal.className='fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-[70] p-0 sm:p-4';modal.dataset.modal='true';modal.innerHTML='<div class="bg-white w-full max-w-md rounded-t-3xl sm:rounded-2xl p-5"><div class="flex justify-between"><h2 class="text-lg font-bold">我的举报记录</h2><button data-ui-action="close-top-modal">✕</button></div><div class="py-8 text-center text-text-muted">加载中…</div></div>';document.body.appendChild(modal);try{const result=await apiRequest('/community/reports/mine','GET');if(!result.success)throw new Error(result.error||'读取失败');const names={crisis:'即时危险',harassment:'骚扰攻击',privacy:'隐私泄露',misinformation:'错误信息',fraud:'诈骗推销',other:'其他'};const statuses={open:'待处理',reviewing:'处理中',resolved:'已处理',dismissed:'不成立'};modal.firstElementChild.innerHTML=`<div class="flex justify-between"><div><h2 class="text-lg font-bold">我的举报记录</h2><p class="text-xs text-text-muted mt-1">这里显示处理状态，不展示其他用户身份</p></div><button data-ui-action="close-top-modal">✕</button></div><div class="mt-4 space-y-3 max-h-[65vh] overflow-y-auto">${result.reports.length?result.reports.map(item=>`<div class="p-3 rounded-xl bg-background text-sm"><div class="flex justify-between gap-2"><strong>${escapeText(names[item.reason]||item.reason)}</strong><span class="text-primary">${escapeText(statuses[item.status]||item.status)}</span></div><div class="text-xs text-text-muted mt-1 break-all">工单：${escapeText(item.case_ref)}</div><div class="text-xs text-text-muted mt-1">${formatDate(item.created_at)}</div></div>`).join(''):'<div class="py-8 text-center text-text-muted">暂无举报记录</div>'}</div>`}catch(error){modal.firstElementChild.innerHTML=`<div class="text-center py-8 text-text-muted">${escapeText(error.message||'读取失败')}</div><button data-ui-action="close-top-modal" class="w-full py-3 rounded-xl bg-primary text-white">关闭</button>`}}
    function blockCommunityContent(id) { MOCK_DATA.communityPosts = MOCK_DATA.communityPosts.filter(p => p.id !== id); closeTopModal(); showToast('已在当前设备屏蔽该内容'); renderCommunity(document.getElementById('main-content')); }

    const communityCommentInFlight = new Set();
    async function addComment(postId) {
      if (communityCommentInFlight.has(postId)) return;
      const content = document.getElementById(`comment-input-${postId}`).value;
      const client_request_id = document.getElementById(`comment-request-id-${postId}`).value;
      const status = document.getElementById(`comment-status-${postId}`);
      const button = document.getElementById(`comment-button-${postId}`);

      if (!content) {
        showToast('请输入评论内容');
        return;
      }

      if (navigator.onLine === false) {
        status.textContent = '未发送：当前网络已断开，评论仍保留在输入框。';
        showToast('当前网络已断开，评论尚未发送');
        return;
      }

      communityCommentInFlight.add(postId);
      button.disabled = true;
      button.textContent = '发送中…';
      status.textContent = '正在发送，请勿重复点击。';
      try {
        const result = await apiRequest(`/community/posts/${postId}/comments`, 'POST', { content, client_request_id });

        if (result.success && result.held_for_review) {
          document.getElementById(`comment-input-${postId}`).value = '';
          closeTopModal();
          showCommunitySafetyHold(result);
        } else if (result.success) {
          showToast(result.replayed ? '这条评论此前已经发送' : '评论成功');
          document.getElementById(`comment-input-${postId}`).value = '';
          closeTopModal();
          showPostDetail(postId);
        } else {
          showToast(result.error || '评论失败');
        }
      } catch (error) {
        console.error('评论失败:', error);
        status.textContent = `未确认发送：${error.message || '网络连接中断'}。评论仍在输入框，可重试。`;
        showToast('评论尚未确认发送，内容已保留');
      } finally {
        communityCommentInFlight.delete(postId);
        const currentButton = document.getElementById(`comment-button-${postId}`);
        if (currentButton) { currentButton.disabled = false; currentButton.textContent = '发送'; }
      }
    }

    async function renderNotifications(container) {
      document.getElementById('page-title').textContent = '消息通知';
      document.getElementById('page-subtitle').textContent = '系统通知与互动提醒';

      container.innerHTML = `
        <div class="p-4 space-y-4 animate-fade-in">
          ${settingsState.quietNight ? '<div class="rounded-xl bg-blue-50 border border-blue-100 p-3 text-sm text-blue-800">安静时段已开启：非紧急互动提醒将在夜间静默；危机处置请勿依赖应用通知。</div>' : ''}
          <div class="flex justify-between items-center">
            <h3 class="font-bold text-text-primary">通知列表</h3>
            <button data-ui-call="markAllRead" class="text-sm text-primary">全部已读</button>
          </div>

          <div id="notification-list" class="space-y-3">
            <div class="text-center py-4 text-text-muted">加载中...</div>
          </div>
        </div>
      `;

      try {
        const result = await apiRequest('/notification', 'GET');

        if (result.success) {
          const notificationList = document.getElementById('notification-list');
          notificationList.innerHTML = result.notifications.map(n => `
            <div data-ui-call="markNotificationRead" data-ui-args="[${Number(n.id)}]" class="bg-white p-4 rounded-xl card-shadow ${!n.is_read ? 'border-l-4 border-primary' : ''} cursor-pointer">
              <div class="flex items-start justify-between mb-2">
                <div class="flex items-center gap-2">
                  <div class="w-8 h-8 rounded-full ${getNotificationIconColor(n.type)} flex items-center justify-center">
                    <span>${getNotificationIcon(n.type)}</span>
                  </div>
                  <span class="font-medium text-text-primary">${escapeText(n.title)}</span>
                </div>
                <span class="text-xs text-text-muted">${formatDate(n.created_at)}</span>
              </div>
              <p class="text-sm text-text-secondary ml-10">${escapeText(n.content)}</p>
            </div>
          `).join('');

          if (result.notifications.length === 0) {
            notificationList.innerHTML = `
              <div class="text-center py-8 text-text-muted">暂无通知</div>
            `;
          }
        } else {
          document.getElementById('notification-list').innerHTML = `
            <div class="text-center py-4 text-text-muted">加载失败</div>
          `;
        }
      } catch (error) {
        console.error('获取通知列表失败:', error);
      }
    }

    function getNotificationIcon(type) {
      const icons = {
        'comment': '💬',
        'like': '❤️',
        'system': '📢',
        'training': '📚'
      };
      return icons[type] || '📩';
    }

    function getNotificationIconColor(type) {
      const colors = {
        'comment': 'bg-blue-100',
        'like': 'bg-red-100',
        'system': 'bg-gray-100',
        'training': 'bg-green-100'
      };
      return colors[type] || 'bg-gray-100';
    }

    async function markAllRead() {
      try {
        const result = await apiRequest('/notification/read', 'PUT');

        if (result.success) {
          showToast('已全部标记为已读');
          renderNotifications(document.getElementById('main-content'));
        } else {
          showToast(result.error || '操作失败');
        }
      } catch (error) {
        console.error('标记已读失败:', error);
        showToast('网络错误');
      }
    }

    async function markNotificationRead(id) {
      try {
        const result = await apiRequest(`/notification/${id}/read`, 'PUT');

        if (result.success) {
          renderNotifications(document.getElementById('main-content'));
        }
      } catch (error) {
        console.error('标记已读失败:', error);
      }
    }

    function getMentalHealthProfile() {
      return cachedSensitiveRecord('mental_health_profile','xingban_mental_health_profile',{});
    }

    async function showMentalHealthProfileEditor() {
      const p = (await loadSensitiveRecord('mental_health_profile','xingban_mental_health_profile',{})).data;
      const modal = document.createElement('div');
      modal.className = 'fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4';
      modal.dataset.modal = 'true';
      modal.innerHTML = `<div class="bg-white w-full max-w-lg rounded-2xl p-5 max-h-[90vh] overflow-y-auto">
        <div class="flex justify-between items-center mb-4"><h3 class="text-lg font-bold">心理健康照护档案</h3><button data-ui-action="close-top-modal" aria-label="关闭">✕</button></div>
        <div class="rounded-xl bg-amber-50 border border-amber-200 p-3 text-sm text-amber-900 mb-4">仅记录专业人员已确认或家长观察到的信息，不用于自行诊断。当前体验版保存在本机浏览器，请勿填写身份证号、详细住址等不必要信息。</div>
        <div class="space-y-3">
          <label class="block text-sm">诊断/评估状态<input id="mh-status" value="${p.status || ''}" placeholder="如：儿童精神科评估中 / 医生已确诊" class="mt-1 w-full p-3 rounded-xl border border-border"></label>
          <label class="block text-sm">平常睡眠基线<input id="mh-sleep" value="${p.sleep || ''}" placeholder="如：通常 21:30–07:00" class="mt-1 w-full p-3 rounded-xl border border-border"></label>
          <label class="block text-sm">已确认的预警表现<textarea id="mh-signs" rows="2" class="mt-1 w-full p-3 rounded-xl border border-border" placeholder="如：连续少睡、异常兴奋、谈及死亡">${p.signs || ''}</textarea></label>
          <label class="block text-sm">精神科/心理专业人员<input id="mh-clinician" value="${p.clinician || ''}" placeholder="机构或称呼、可联系时间" class="mt-1 w-full p-3 rounded-xl border border-border"></label>
          <label class="block text-sm">用药与重要医嘱摘要<textarea id="mh-medication" rows="2" class="mt-1 w-full p-3 rounded-xl border border-border" placeholder="只按处方记录；不要在应用内自行调整剂量">${p.medication || ''}</textarea></label>
          <label class="block text-sm">既往危机与有效处理<textarea id="mh-history" rows="2" class="mt-1 w-full p-3 rounded-xl border border-border">${p.history || ''}</textarea></label>
          <label class="block text-sm">首选就诊机构<input id="mh-hospital" value="${p.hospital || ''}" class="mt-1 w-full p-3 rounded-xl border border-border"></label>
        </div>
        <button data-ui-call="saveMentalHealthProfile" class="w-full mt-4 py-3 rounded-xl bg-primary text-white font-medium">保存档案</button>
      </div>`;
      document.body.appendChild(modal);
    }

    async function saveMentalHealthProfile() {
      const profile = { status: document.getElementById('mh-status').value.trim(), sleep: document.getElementById('mh-sleep').value.trim(), signs: document.getElementById('mh-signs').value.trim(), clinician: document.getElementById('mh-clinician').value.trim(), medication: document.getElementById('mh-medication').value.trim(), history: document.getElementById('mh-history').value.trim(), hospital: document.getElementById('mh-hospital').value.trim(), updatedAt: new Date().toISOString() };
      try { const saved=await persistSensitiveRecord('mental_health_profile',profile,'xingban_mental_health_profile'); closeTopModal(); showToast(saved.server?'照护档案已加密保存':'服务不可用，体验数据暂存当前设备'); navigateTo('profile-detail'); } catch(_){ showToast('安全存储不可用，未保存敏感数据'); }
    }

    function renderChildProfileDetail(container) {
      document.getElementById('page-title').textContent = '数字孪生档案';
      document.getElementById('page-subtitle').textContent = '全方位了解孩子';

      const profile = MOCK_DATA.childProfile;
      const mental = getMentalHealthProfile();

      container.innerHTML = `
        <div class="p-4 space-y-4 animate-fade-in">
          <div class="bg-gradient-to-br from-primary to-primary-dark rounded-2xl p-5 text-white card-shadow">
            <div class="flex items-center gap-4">
              <div class="w-20 h-20 bg-white/20 rounded-2xl flex items-center justify-center text-4xl">${profile.avatar}</div>
              <div>
                <h2 class="text-2xl font-bold">${profile.name}</h2>
                <p class="text-white/80">${profile.gender} · ${profile.age}岁</p>
                <p class="text-white/80 text-sm mt-1">诊断: ${profile.diagnosis} (${profile.diagnosis_level})</p>
              </div>
            </div>
          </div>

          <div class="bg-white rounded-xl card-shadow p-4 border-l-4 border-primary">
            <div class="flex items-start justify-between gap-3 mb-3"><div><h3 class="font-bold text-text-primary">心理健康照护档案</h3><p class="text-xs text-text-muted mt-1">用于就医沟通，不构成诊断或用药建议</p></div><button data-ui-call="showMentalHealthProfileEditor" class="px-3 py-2 rounded-lg bg-primary-light/40 text-primary text-sm">${mental.updatedAt ? '编辑' : '建立档案'}</button></div>
            ${mental.updatedAt ? `<div class="grid sm:grid-cols-2 gap-2 text-sm"><div><span class="text-text-muted">评估状态：</span>${mental.status || '未填写'}</div><div><span class="text-text-muted">睡眠基线：</span>${mental.sleep || '未填写'}</div><div><span class="text-text-muted">专业人员：</span>${mental.clinician || '未填写'}</div><div><span class="text-text-muted">首选机构：</span>${mental.hospital || '未填写'}</div></div><p class="text-xs text-text-muted mt-3">家庭填写 · 更新于 ${new Date(mental.updatedAt).toLocaleString('zh-CN')} · 未经专业复核</p>` : '<p class="text-sm text-text-secondary">建议在专业人员指导下记录睡眠基线、预警表现、就诊联系人及医嘱摘要。</p>'}
          </div>

          <div class="bg-white rounded-xl card-shadow p-4">
            <h3 class="font-bold text-text-primary mb-3 flex items-center gap-2">
              <span>📊</span>能力雷达
            </h3>
            <div class="relative w-full h-48 flex items-center justify-center">
              <svg viewBox="0 0 200 200" class="w-full h-full">
                ${generateRadarChart(profile.capacity_radar)}
              </svg>
            </div>
            <div class="flex justify-between mt-2 text-xs text-text-muted">
              <span>沟通</span>
              <span>社交</span>
              <span>自理</span>
              <span>认知</span>
              <span>运动</span>
              <span>情绪</span>
            </div>
          </div>

          <div class="bg-white rounded-xl card-shadow p-4">
            <h3 class="font-bold text-text-primary mb-3 flex items-center gap-2">
              <span>👂</span>感官档案
            </h3>
            <div class="space-y-2">
              <div class="flex items-center gap-3">
                <span class="text-sm text-text-secondary w-10">听觉</span>
                <div class="flex-1 h-2.5 bg-gray-100 rounded-full overflow-hidden">
                  <div class="h-full rounded-full ${getSensoryBarColor(profile.sensory_hearing)}" style="width: ${getSensoryWidth(profile.sensory_hearing)}%"></div>
                </div>
                <span class="text-sm font-medium w-10 text-right ${getSensoryColor(profile.sensory_hearing)}">${profile.sensory_hearing}</span>
              </div>
              <div class="flex items-center gap-3">
                <span class="text-sm text-text-secondary w-10">视觉</span>
                <div class="flex-1 h-2.5 bg-gray-100 rounded-full overflow-hidden">
                  <div class="h-full rounded-full ${getSensoryBarColor(profile.sensory_visual)}" style="width: ${getSensoryWidth(profile.sensory_visual)}%"></div>
                </div>
                <span class="text-sm font-medium w-10 text-right ${getSensoryColor(profile.sensory_visual)}">${profile.sensory_visual}</span>
              </div>
              <div class="flex items-center gap-3">
                <span class="text-sm text-text-secondary w-10">触觉</span>
                <div class="flex-1 h-2.5 bg-gray-100 rounded-full overflow-hidden">
                  <div class="h-full rounded-full ${getSensoryBarColor(profile.sensory_tactile)}" style="width: ${getSensoryWidth(profile.sensory_tactile)}%"></div>
                </div>
                <span class="text-sm font-medium w-10 text-right ${getSensoryColor(profile.sensory_tactile)}">${profile.sensory_tactile}</span>
              </div>
              <div class="flex items-center gap-3">
                <span class="text-sm text-text-secondary w-10">味觉</span>
                <div class="flex-1 h-2.5 bg-gray-100 rounded-full overflow-hidden">
                  <div class="h-full rounded-full ${getSensoryBarColor(profile.sensory_taste)}" style="width: ${getSensoryWidth(profile.sensory_taste)}%"></div>
                </div>
                <span class="text-sm font-medium w-10 text-right ${getSensoryColor(profile.sensory_taste)}">${profile.sensory_taste}</span>
              </div>
              <div class="flex items-center gap-3">
                <span class="text-sm text-text-secondary w-10">嗅觉</span>
                <div class="flex-1 h-2.5 bg-gray-100 rounded-full overflow-hidden">
                  <div class="h-full rounded-full ${getSensoryBarColor(profile.sensory_smell)}" style="width: ${getSensoryWidth(profile.sensory_smell)}%"></div>
                </div>
                <span class="text-sm font-medium w-10 text-right ${getSensoryColor(profile.sensory_smell)}">${profile.sensory_smell}</span>
              </div>
              <div class="flex items-center gap-3">
                <span class="text-sm text-text-secondary w-10">前庭</span>
                <div class="flex-1 h-2.5 bg-gray-100 rounded-full overflow-hidden">
                  <div class="h-full rounded-full ${getSensoryBarColor(profile.sensory_vestibular)}" style="width: ${getSensoryWidth(profile.sensory_vestibular)}%"></div>
                </div>
                <span class="text-sm font-medium w-10 text-right ${getSensoryColor(profile.sensory_vestibular)}">${profile.sensory_vestibular}</span>
              </div>
            </div>
            <div class="flex flex-wrap gap-2 mt-3 pt-3 border-t border-border">
              <span class="text-xs px-2 py-1 bg-red-50 text-red-600 rounded-full">敏感 = 高反应</span>
              <span class="text-xs px-2 py-1 bg-yellow-50 text-yellow-600 rounded-full">回避 = 逃避刺激</span>
              <span class="text-xs px-2 py-1 bg-green-50 text-green-600 rounded-full">寻求 = 追求刺激</span>
              <span class="text-xs px-2 py-1 bg-blue-50 text-blue-600 rounded-full">正常 = 适度反应</span>
            </div>
          </div>

          <div class="bg-white rounded-xl card-shadow p-4">
            <h3 class="font-bold text-text-primary mb-3 flex items-center gap-2">
              <span>✨</span>强化物清单
            </h3>
            <div class="flex flex-wrap gap-2">
              ${profile.reinforcers.map(r => `
                <span class="px-3 py-1.5 bg-yellow-100 text-yellow-700 rounded-full text-sm">${r}</span>
              `).join('')}
            </div>
          </div>

          <div class="bg-white rounded-xl card-shadow p-4">
            <h3 class="font-bold text-text-primary mb-3 flex items-center gap-2">
              <span>🏥</span>医疗信息
            </h3>
            <div class="space-y-2 text-sm">
              <div class="flex justify-between">
                <span class="text-text-muted">主治医生</span>
                <span class="text-text-primary">${profile.medical_info.doctor_name}</span>
              </div>
              <div class="flex justify-between">
                <span class="text-text-muted">就诊医院</span>
                <span class="text-text-primary">${profile.medical_info.hospital}</span>
              </div>
              <div class="flex justify-between">
                <span class="text-text-muted">联系电话</span>
                <span class="text-text-primary">${profile.medical_info.phone}</span>
              </div>
              <div class="flex justify-between">
                <span class="text-text-muted">用药情况</span>
                <span class="text-text-primary">${profile.medical_info.medications}</span>
              </div>
              <div class="flex justify-between">
                <span class="text-text-muted">过敏史</span>
                <span class="text-text-primary">${profile.medical_info.allergies}</span>
              </div>
              <div class="mt-2 pt-2 border-t border-border">
                <span class="text-text-muted">备注:</span>
                <p class="text-text-primary mt-1">${profile.medical_info.notes}</p>
              </div>
            </div>
          </div>

          <div class="bg-white rounded-xl card-shadow p-4">
            <div class="flex justify-between items-center mb-3">
              <h3 class="font-bold text-text-primary flex items-center gap-2">
                <span>🎯</span>干预目标
              </h3>
              <button data-ui-call="showNewGoal" class="text-xs text-primary">+ 添加</button>
            </div>
            <div class="space-y-3">
              ${profile.goals.map(g => `
                <div class="p-3 bg-secondary/30 rounded-lg">
                  <div class="flex items-center justify-between mb-1">
                    <span class="font-medium text-text-primary">${g.category}</span>
                    <span class="text-xs px-2 py-0.5 ${getGoalStatusColor(g.status)} rounded-full">${getGoalStatusText(g.status)}</span>
                  </div>
                  <p class="text-sm text-text-secondary">${g.target}</p>
                  <div class="flex items-center justify-between mt-2 text-xs">
                    <span class="text-text-muted">进度: ${g.current_level}/${g.target_level}</span>
                    <span class="text-text-muted">截止: ${escapeText(g.deadline)}</span>
                  </div>
                  <div class="progress-bar mt-2">
                    <div class="progress-fill" style="width: ${(g.current_level/g.target_level)*100}%"></div>
                  </div>
                </div>
              `).join('')}
            </div>
          </div>

          <div class="bg-white rounded-xl card-shadow p-4">
            <h3 class="font-bold text-text-primary mb-3 flex items-center gap-2">
              <span>🌱</span>发展里程碑
            </h3>
            <div class="relative">
              <div class="absolute left-4 top-0 bottom-0 w-0.5 bg-border"></div>
              <div class="space-y-3">
                ${profile.development_milestones.map((m, i) => `
                  <div class="flex gap-3 relative">
                    <div class="w-8 h-8 rounded-full ${m.achieved ? 'bg-success' : 'bg-secondary'} flex items-center justify-center flex-shrink-0 z-10 text-white text-xs font-bold">
                      ${m.achieved ? '✓' : i + 1}
                    </div>
                    <div class="flex-1 p-3 ${m.achieved ? 'bg-success/5 border border-success/20' : 'bg-gray-50 border border-border'} rounded-lg">
                      <div class="flex items-center justify-between">
                        <span class="font-medium text-text-primary text-sm">${m.title}</span>
                        <span class="text-xs px-2 py-0.5 ${m.achieved ? 'bg-success/20 text-success' : 'bg-gray-200 text-gray-500'} rounded-full">${m.achieved ? '已达成' : '未达成'}</span>
                      </div>
                      <p class="text-xs text-text-secondary mt-1">${m.description}</p>
                      <div class="flex items-center justify-between mt-1">
                        <span class="text-xs text-text-muted">${m.age}</span>
                        ${m.achieved ? `<span class="text-xs text-success">${escapeText(m.date)}</span>` : ''}
                      </div>
                    </div>
                  </div>
                `).join('')}
              </div>
            </div>
          </div>

          <div class="bg-white rounded-xl card-shadow p-4">
            <h3 class="font-bold text-text-primary mb-3 flex items-center gap-2">
              <span>💡</span>个性化推荐
            </h3>
            <div class="space-y-3">
              ${profile.personalized_recommendations.map(r => `
                <div class="flex items-start gap-3 p-3 bg-primary-light/20 rounded-lg">
                  <span class="text-xl">${r.icon}</span>
                  <div class="flex-1">
                    <div class="font-medium text-text-primary text-sm">${r.title}</div>
                    <p class="text-xs text-text-secondary mt-1">${r.description}</p>
                  </div>
                  <button data-ui-call="navigateTo" data-ui-args='["${getRecommendationTarget(r.type)}"]' class="text-xs text-primary whitespace-nowrap">去执行 →</button>
                </div>
              `).join('')}
            </div>
          </div>

          <div class="bg-white rounded-xl card-shadow p-4">
            <h3 class="font-bold text-text-primary mb-3 flex items-center gap-2">
              <span>🌟</span>优势与挑战
            </h3>
            <div class="grid grid-cols-2 gap-4">
              <div>
                <div class="text-sm text-text-muted mb-2">优势</div>
                <div class="space-y-1">
                  ${profile.strengths.map(s => `
                    <div class="flex items-center gap-2 text-sm text-text-primary">
                      <span class="w-1.5 h-1.5 bg-success rounded-full"></span>
                      ${escapeText(s)}
                    </div>
                  `).join('')}
                </div>
              </div>
              <div>
                <div class="text-sm text-text-muted mb-2">挑战</div>
                <div class="space-y-1">
                  ${profile.challenges.map(c => `
                    <div class="flex items-center gap-2 text-sm text-text-primary">
                      <span class="w-1.5 h-1.5 bg-danger rounded-full"></span>
                      ${escapeText(c)}
                    </div>
                  `).join('')}
                </div>
              </div>
            </div>
          </div>
        </div>
      `;
    }

    function generateRadarChart(data) {
      const values = Object.values(data);
      const maxValue = 100;
      const centerX = 100;
      const centerY = 100;
      const radius = 70;
      const points = [];
      const labels = Object.keys(data);

      for (let i = 0; i < values.length; i++) {
        const angle = (Math.PI * 2 * i) / values.length - Math.PI / 2;
        const value = values[i] / maxValue * radius;
        points.push({
          x: centerX + Math.cos(angle) * value,
          y: centerY + Math.sin(angle) * value
        });
      }

      const pointString = points.map(p => `${p.x},${p.y}`).join(' ');
      const lineString = points.map((p, i) => {
        const next = points[(i + 1) % points.length];
        return `${p.x},${p.y} ${next.x},${next.y}`;
      }).join(' ');

      let gridLines = '';
      for (let r = radius / 4; r <= radius; r += radius / 4) {
        let gridPoints = '';
        for (let i = 0; i < values.length; i++) {
          const angle = (Math.PI * 2 * i) / values.length - Math.PI / 2;
          const x = centerX + Math.cos(angle) * r;
          const y = centerY + Math.sin(angle) * r;
          gridPoints += `${x},${y} `;
        }
        gridLines += `<polygon points="${gridPoints}" fill="none" stroke="#e5e7eb" stroke-width="1"/>`;
      }

      let axisLines = '';
      for (let i = 0; i < values.length; i++) {
        const angle = (Math.PI * 2 * i) / values.length - Math.PI / 2;
        const x = centerX + Math.cos(angle) * radius;
        const y = centerY + Math.sin(angle) * radius;
        axisLines += `<line x1="${centerX}" y1="${centerY}" x2="${x}" y2="${y}" stroke="#e5e7eb" stroke-width="1"/>`;
      }

      return `
        ${gridLines}
        ${axisLines}
        <polygon points="${pointString}" fill="rgba(122, 157, 140, 0.3)" stroke="#7A9D8C" stroke-width="2"/>
        ${points.map(p => `<circle cx="${p.x}" cy="${p.y}" r="3" fill="#7A9D8C"/>`).join('')}
      `;
    }

    function getSensoryColor(status) {
      switch(status) {
        case '敏感': return 'text-danger';
        case '回避': return 'text-warning';
        case '寻求': return 'text-primary';
        case '正常': return 'text-success';
        default: return 'text-text-muted';
      }
    }

    function getSensoryBarColor(status) {
      switch(status) {
        case '敏感': return 'bg-red-400';
        case '回避': return 'bg-yellow-400';
        case '寻求': return 'bg-primary';
        case '正常': return 'bg-success';
        default: return 'bg-gray-400';
      }
    }

    function getSensoryWidth(status) {
      switch(status) {
        case '敏感': return 90;
        case '回避': return 70;
        case '寻求': return 60;
        case '正常': return 40;
        default: return 30;
      }
    }

    function getRecommendationTarget(type) {
      switch(type) {
        case 'sensory': return 'strategies';
        case 'social': return 'stories';
        case 'emotion': return 'emergency';
        case 'cognition': return 'strategies';
        default: return 'home';
      }
    }

    function getGoalStatusColor(status) {
      switch(status) {
        case 'completed': return 'bg-success/20 text-success';
        case 'in_progress': return 'bg-primary/20 text-primary';
        case 'pending': return 'bg-gray-200 text-gray-600';
        default: return 'bg-gray-200 text-gray-600';
      }
    }

    function getGoalStatusText(status) {
      switch(status) {
        case 'completed': return '已完成';
        case 'in_progress': return '进行中';
        case 'pending': return '待开始';
        default: return status;
      }
    }

    function showNewGoal() {
      const modal = document.createElement('div');
      modal.className = 'fixed inset-0 bg-black/50 flex items-end justify-center z-50';
      modal.innerHTML = `
        <div class="bg-white w-full max-w-md rounded-t-3xl p-6 modal-slide safe-area-bottom">
          <div class="flex justify-between items-center mb-4">
            <h2 class="text-lg font-bold">添加干预目标</h2>
            <button data-ui-action="remove-overlay" class="text-text-muted">✕</button>
          </div>
          <div class="space-y-4">
            <div>
              <label class="block text-sm text-text-secondary mb-1">目标分类</label>
              <select id="goal-category" class="w-full px-4 py-2.5 rounded-xl border border-border">
                <option value="沟通">沟通</option>
                <option value="社交">社交</option>
                <option value="自理">自理</option>
                <option value="认知">认知</option>
                <option value="运动">运动</option>
                <option value="情绪">情绪</option>
              </select>
            </div>
            <div>
              <label class="block text-sm text-text-secondary mb-1">目标描述</label>
              <textarea id="goal-target" placeholder="描述具体的干预目标..." class="w-full px-4 py-3 rounded-xl border border-border" rows="3"></textarea>
            </div>
            <div class="flex gap-4">
              <div class="flex-1">
                <label class="block text-sm text-text-secondary mb-1">当前等级</label>
                <input type="number" id="goal-current" min="1" max="5" value="1" class="w-full px-4 py-2.5 rounded-xl border border-border">
              </div>
              <div class="flex-1">
                <label class="block text-sm text-text-secondary mb-1">目标等级</label>
                <input type="number" id="goal-target-level" min="1" max="5" value="3" class="w-full px-4 py-2.5 rounded-xl border border-border">
              </div>
            </div>
            <div>
              <label class="block text-sm text-text-secondary mb-1">截止日期</label>
              <input type="date" id="goal-deadline" class="w-full px-4 py-2.5 rounded-xl border border-border">
            </div>
            <input type="hidden" id="goal-request-id" value="${newClientRequestId()}">
            <button id="goal-save-button" data-ui-call="saveGoal" class="w-full py-3 rounded-xl bg-primary text-white font-medium disabled:opacity-60">保存</button>
            <p id="goal-save-status" class="text-xs text-text-muted" role="status">尚未保存</p>
          </div>
        </div>
      `;
      document.body.appendChild(modal);
    }

    async function saveGoal() {
      const childId = currentChildId();
      const category = document.getElementById('goal-category').value;
      const target = document.getElementById('goal-target').value;
      const current_level = parseInt(document.getElementById('goal-current').value);
      const target_level = parseInt(document.getElementById('goal-target-level').value);
      const deadline = document.getElementById('goal-deadline').value;
      const button = document.getElementById('goal-save-button');
      const status = document.getElementById('goal-save-status');
      if (button.disabled) return;

      if (!childId) {
        showToast('请先选择儿童档案');
        return;
      }
      if (!target || !deadline) {
        showToast('请填写完整信息');
        return;
      }
      if (navigator.onLine === false) { status.textContent = '未保存：当前网络已断开，内容仍保留，可联网后重试。'; return showToast('当前离线，目标尚未保存'); }

      button.disabled = true; button.textContent = '正在保存…'; status.textContent = '正在保存，请勿重复点击。';
      try {
        const result = await apiRequest(`/child/${childId}/goals`, 'POST', {
          client_request_id: document.getElementById('goal-request-id').value,
          goal_type: category,
          description: target,
          target_date: deadline
        });

        if (result.success) {
          showToast(result.replayed ? '目标此前已保存，未重复创建' : '目标添加成功');
          closeTopModal();
          renderChildProfileDetail(document.getElementById('main-content'));
        } else {
          showToast(result.error || '添加失败');
        }
      } catch (error) {
        status.textContent = '保存状态未确认，内容仍保留；请使用同一页面重试。'; showToast('目标尚未确认保存');
      } finally {
        if (document.body.contains(button)) { button.disabled = false; button.textContent = '保存'; }
      }
    }

    function renderCareer(container) {
      document.getElementById('page-title').textContent = '生涯规划';
      document.getElementById('page-subtitle').textContent = '以孩子意愿为中心的成长支持规划';

      container.innerHTML = `
        <div class="p-4 space-y-4 animate-fade-in">
          <div class="flex bg-white rounded-xl p-1 card-shadow">
            <button data-ui-call="renderCareerTimeline" data-ui-pass-this="true" class="flex-1 py-2 rounded-lg bg-primary text-white font-medium">生涯时间轴</button>
            <button data-ui-call="renderCareerGoals" data-ui-pass-this="true" class="flex-1 py-2 rounded-lg text-text-secondary">生涯目标</button>
            <button data-ui-call="renderCareerSimulator" data-ui-pass-this="true" class="flex-1 py-2 rounded-lg text-text-secondary">未来支持</button>
          </div>

          <div id="career-content">
            ${renderCareerTimelineContent()}
          </div>
        </div>
      `;
    }

    function renderCareerTimelineContent() {
      const milestones = MOCK_DATA.careerMilestones;

      return `
        <div>
          <h3 class="font-bold text-text-primary mb-3">成长里程碑</h3>
          <div class="relative">
            <div class="absolute left-4 top-0 bottom-0 w-0.5 bg-border"></div>
            <div class="space-y-4">
              ${milestones.map((m, index) => `
                <div class="flex gap-4 relative">
                  <div class="w-8 h-8 rounded-full ${m.achieved ? 'bg-success' : 'bg-secondary'} flex items-center justify-center flex-shrink-0 z-10">
                    ${m.achieved ? '✓' : index + 1}
                  </div>
                  <div class="flex-1 bg-white rounded-xl p-4 card-shadow">
                    <div class="flex items-center justify-between mb-1">
                      <span class="font-bold text-text-primary">${m.title}</span>
                      <span class="text-xs text-text-muted">${m.age}岁</span>
                    </div>
                    <p class="text-sm text-text-secondary">${m.description}</p>
                    ${m.achieved ? `<p class="text-xs text-success mt-2">已达成: ${escapeText(m.date)}</p>` : ''}
                  </div>
                </div>
              `).join('')}
            </div>
          </div>
          <button data-ui-call="showNewMilestone" class="w-full mt-4 py-3 rounded-xl border-2 border-dashed border-border text-text-secondary hover:border-primary hover:text-primary transition-colors">
            + 添加里程碑
          </button>
        </div>
      `;
    }

    function renderCareerTimeline(btn) {
      btn.classList.add('bg-primary', 'text-white');
      btn.classList.remove('text-text-secondary');
      btn.nextElementSibling.classList.remove('bg-primary', 'text-white');
      btn.nextElementSibling.classList.add('text-text-secondary');
      btn.nextElementSibling.nextElementSibling.classList.remove('bg-primary', 'text-white');
      btn.nextElementSibling.nextElementSibling.classList.add('text-text-secondary');
      document.getElementById('career-content').innerHTML = renderCareerTimelineContent();
    }

    function renderCareerGoals(btn) {
      btn.classList.add('bg-primary', 'text-white');
      btn.classList.remove('text-text-secondary');
      btn.previousElementSibling.classList.remove('bg-primary', 'text-white');
      btn.previousElementSibling.classList.add('text-text-secondary');
      btn.nextElementSibling.classList.remove('bg-primary', 'text-white');
      btn.nextElementSibling.classList.add('text-text-secondary');

      const goals = MOCK_DATA.careerGoals;

      document.getElementById('career-content').innerHTML = `
        <div>
          <h3 class="font-bold text-text-primary mb-3">生涯目标</h3>
          <div class="space-y-3">
            ${goals.map(g => `
              <div class="bg-white rounded-xl p-4 card-shadow">
                <div class="flex items-center justify-between mb-2">
                  <span class="font-bold text-text-primary">${escapeText(g.title)}</span>
                  <span class="text-xs px-2 py-0.5 ${getGoalStatusColor(g.status)} rounded-full">${getGoalStatusText(g.status)}</span>
                </div>
                <p class="text-sm text-text-secondary mb-3">${escapeText(g.description)}</p>
                <div class="flex items-center justify-between text-xs text-text-muted">
                  <span>类型: ${getCareerGoalType(g.type)}</span>
                  <span>截止: ${escapeText(g.deadline)}</span>
                </div>
                <div class="flex gap-2 mt-3">
                  <button data-ui-call="updateGoalStatus" data-ui-args="${uiArgsAttr(Number(g.id),'completed')}" class="flex-1 py-2 bg-success/10 text-success rounded-lg text-xs">标记完成</button>
                  <button data-ui-call="editCareerGoal" data-ui-args="[${Number(g.id)}]" class="flex-1 py-2 bg-secondary/50 text-text-secondary rounded-lg text-xs">编辑</button>
                </div>
              </div>
            `).join('')}
          </div>
          <button data-ui-call="showNewCareerGoal" class="w-full mt-4 py-3 rounded-xl border-2 border-dashed border-border text-text-secondary hover:border-primary hover:text-primary transition-colors">
            + 添加目标
          </button>
        </div>
      `;
    }

    function renderCareerSimulator(btn) {
      btn.classList.add('bg-primary', 'text-white');
      btn.classList.remove('text-text-secondary');
      btn.previousElementSibling.classList.remove('bg-primary', 'text-white');
      btn.previousElementSibling.classList.add('text-text-secondary');
      btn.previousElementSibling.previousElementSibling.classList.remove('bg-primary', 'text-white');
      btn.previousElementSibling.previousElementSibling.classList.add('text-text-secondary');

      document.getElementById('career-content').innerHTML = `
        <div>
          <h3 class="font-bold text-text-primary mb-3">未来支持方案</h3>
          <div class="bg-gradient-to-br from-blue-500 to-purple-500 rounded-2xl p-5 text-white card-shadow mb-4">
            <div class="text-center mb-4">
              <div class="text-sm text-white/80">按阶段提前准备支持，不预测孩子结局</div>
              <div class="text-2xl font-bold mt-1">${escapeText(selectedChild?.name || '当前儿童')} · 分阶段准备</div>
            </div>
            <div class="grid grid-cols-2 gap-3 text-sm">
              <div class="bg-white/20 rounded-lg p-3">孩子的意愿与拒绝</div>
              <div class="bg-white/20 rounded-lg p-3">沟通与环境适配</div>
              <div class="bg-white/20 rounded-lg p-3">健康、安全与决策</div>
              <div class="bg-white/20 rounded-lg p-3">学习、社区与活动</div>
            </div>
          </div>

          <div class="bg-white rounded-xl p-4 card-shadow">
            <h4 class="font-medium text-text-primary mb-3">规划原则</h4>
            <p class="text-sm text-text-secondary mb-4">
              不要依据诊断标签预设职业。请从孩子当前兴趣、沟通方式、感官需要、日常参与和本人意愿出发，同时准备不同支持强度下的教育、生活、健康、决策支持和职业探索方案。
            </p>
            <fieldset class="space-y-2 mb-4">
              <legend class="text-sm font-medium text-text-primary mb-2">这次优先梳理哪些支持？（可多选）</legend>
              ${[['communication','沟通与表达'],['daily_living','日常生活参与'],['learning','学习与环境适配'],['community','社区与成年过渡']].map(([value,label]) => `<label class="flex items-center gap-2 text-sm text-text-secondary"><input type="checkbox" name="career-support-domain" value="${value}" class="w-4 h-4" ${value === 'communication' ? 'checked' : ''}>${label}</label>`).join('')}
            </fieldset>
            <label class="block text-sm font-medium text-text-primary mb-2" for="career-support-level">目前希望获得的协助强度</label>
            <select id="career-support-level" class="w-full px-4 py-2.5 rounded-xl border border-border mb-4">
              <option value="light">少量提醒或环境调整</option><option value="regular">持续协助与定期复核</option><option value="intensive">密集协助与跨专业协调</option>
            </select>
            <button id="career-support-plan-button" data-ui-call="runCareerSimulation" class="w-full py-3 rounded-xl bg-primary text-white font-medium">
              生成下一步讨论清单
            </button>
            <p id="career-support-plan-status" class="text-xs text-text-muted mt-2" role="status">清单用于家庭与专业人员共同讨论，不是能力预测或诊断结论。</p>
          </div>

          <div id="career-support-plan-result"></div>

          <div class="bg-white rounded-xl p-4 card-shadow">
            <h4 class="font-medium text-text-primary mb-1">法律与成年过渡核对清单</h4><p class="text-xs text-text-muted mb-3">以下是讨论主题，不是法律意见；制度因地区和时间变化，请向当地主管部门或执业律师核验。</p>
            <div class="space-y-2 text-sm">
              <div class="flex items-start gap-2">
                <span class="text-primary">📋</span>
                <div>
                  <div class="font-medium text-text-primary">提前做好法律规划</div>
                  <div class="text-text-secondary">建议尽早为孩子建立法律保护机制</div>
                </div>
              </div>
              <div class="flex items-start gap-2">
                <span class="text-primary">🏠</span>
                <div>
                  <div class="font-medium text-text-primary">监护权安排</div>
                  <div class="text-text-secondary">考虑指定监护人或设立信托</div>
                </div>
              </div>
              <div class="flex items-start gap-2">
                <span class="text-primary">💰</span>
                <div>
                  <div class="font-medium text-text-primary">财产规划</div>
                  <div class="text-text-secondary">合理安排财产继承和管理</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      `;
    }

    function getCareerGoalType(type) {
      const types = {
        'skill': '技能培养',
        'social': '社交能力',
        'career': '职业探索',
        'education': '教育规划',
        'life': '生活能力'
      };
      return types[type] || type;
    }

    function showNewMilestone() {
      const modal = document.createElement('div');
      modal.className = 'fixed inset-0 bg-black/50 flex items-end justify-center z-50';
      modal.innerHTML = `
        <div class="bg-white w-full max-w-md rounded-t-3xl p-6 modal-slide safe-area-bottom">
          <div class="flex justify-between items-center mb-4">
            <h2 class="text-lg font-bold">添加里程碑</h2>
            <button data-ui-action="remove-overlay" class="text-text-muted">✕</button>
          </div>
          <div class="space-y-4">
            <div>
              <label class="block text-sm text-text-secondary mb-1">成长阶段</label>
              <select id="milestone-stage" class="w-full px-4 py-2.5 rounded-xl border border-border">
                <option value="1">了解情况与建立支持</option><option value="2">早期支持</option><option value="3">学前适应</option>
                <option value="4">学龄支持</option><option value="5">青春期支持</option><option value="6">成年过渡</option><option value="7">成年生活</option>
              </select>
            </div>
            <div>
              <label class="block text-sm text-text-secondary mb-1">里程碑名称</label>
              <input type="text" id="milestone-title" placeholder="例如: 学会骑自行车" class="w-full px-4 py-2.5 rounded-xl border border-border">
            </div>
            <div>
              <label class="block text-sm text-text-secondary mb-1">描述</label>
              <textarea id="milestone-description" placeholder="描述这个里程碑..." class="w-full px-4 py-3 rounded-xl border border-border" rows="3"></textarea>
            </div>
            <input type="hidden" id="milestone-request-id" value="${newClientRequestId()}">
            <button id="milestone-save-button" data-ui-call="saveMilestone" class="w-full py-3 rounded-xl bg-primary text-white font-medium disabled:opacity-60">保存</button>
            <p id="milestone-save-status" class="text-xs text-text-muted" role="status">尚未保存</p>
          </div>
        </div>
      `;
      document.body.appendChild(modal);
    }

    async function saveMilestone() {
      const childId = currentChildId();
      const milestoneId = parseInt(document.getElementById('milestone-stage').value, 10);
      const title = document.getElementById('milestone-title').value;
      const description = document.getElementById('milestone-description').value;
      const button = document.getElementById('milestone-save-button');
      const status = document.getElementById('milestone-save-status');
      if (button.disabled) return;

      if (!childId) {
        showToast('请先选择儿童档案');
        return;
      }
      if (!milestoneId || !title) {
        showToast('请填写完整信息');
        return;
      }
      if (navigator.onLine === false) { status.textContent = '未保存：当前网络已断开，内容仍保留。'; return showToast('当前离线，里程碑尚未保存'); }

      button.disabled = true; button.textContent = '正在保存…'; status.textContent = '正在保存，请勿重复点击。';
      try {
        const result = await apiRequest(`/career/milestones/${childId}`, 'POST', {
          client_request_id: document.getElementById('milestone-request-id').value,
          milestone_id: milestoneId,
          title,
          description
        });

        if (result.success) {
          showToast(result.replayed ? '里程碑此前已保存，未重复创建' : '里程碑添加成功');
          closeTopModal();
          renderCareerTimelineContent();
        } else {
          showToast(result.error || '添加失败');
        }
      } catch (error) {
        status.textContent = '保存状态未确认，内容仍保留；可使用同一页面重试。'; showToast('里程碑尚未确认保存');
      } finally {
        if (document.body.contains(button)) { button.disabled = false; button.textContent = '保存'; }
      }
    }

    function showNewCareerGoal() {
      const modal = document.createElement('div');
      modal.className = 'fixed inset-0 bg-black/50 flex items-end justify-center z-50';
      modal.innerHTML = `
        <div class="bg-white w-full max-w-md rounded-t-3xl p-6 modal-slide safe-area-bottom">
          <div class="flex justify-between items-center mb-4">
            <h2 class="text-lg font-bold">添加生涯目标</h2>
            <button data-ui-action="remove-overlay" class="text-text-muted">✕</button>
          </div>
          <div class="space-y-4">
            <div>
              <label class="block text-sm text-text-secondary mb-1">目标名称</label>
              <input type="text" id="career-goal-title" placeholder="例如：在孩子愿意的前提下尝试两种兴趣活动" class="w-full px-4 py-2.5 rounded-xl border border-border">
            </div>
            <div>
              <label class="block text-sm text-text-secondary mb-1">目标类型</label>
              <select id="career-goal-type" class="w-full px-4 py-2.5 rounded-xl border border-border">
                <option value="skill">技能培养</option>
                <option value="social">社交能力</option>
                <option value="career">职业探索</option>
                <option value="education">教育规划</option>
                <option value="life">生活能力</option>
              </select>
            </div>
            <div>
              <label class="block text-sm text-text-secondary mb-1">描述</label>
              <textarea id="career-goal-description" placeholder="描述这个目标..." class="w-full px-4 py-3 rounded-xl border border-border" rows="3"></textarea>
            </div>
            <div>
              <label class="block text-sm text-text-secondary mb-1">截止日期</label>
              <input type="date" id="career-goal-deadline" class="w-full px-4 py-2.5 rounded-xl border border-border">
            </div>
            <input type="hidden" id="career-goal-request-id" value="${newClientRequestId()}">
            <button id="career-goal-save-button" data-ui-call="saveCareerGoal" class="w-full py-3 rounded-xl bg-primary text-white font-medium disabled:opacity-60">保存</button>
            <p id="career-goal-save-status" class="text-xs text-text-muted" role="status">尚未保存</p>
          </div>
        </div>
      `;
      document.body.appendChild(modal);
    }

    async function saveCareerGoal() {
      const childId = currentChildId();
      const title = document.getElementById('career-goal-title').value.trim();
      const type = document.getElementById('career-goal-type').value;
      const description = document.getElementById('career-goal-description').value.trim();
      const deadline = document.getElementById('career-goal-deadline').value;
      const button = document.getElementById('career-goal-save-button');
      const status = document.getElementById('career-goal-save-status');
      if (button.disabled) return;

      if (!childId) {
        showToast('请先选择儿童档案');
        return;
      }
      if (!title || !deadline) {
        showToast('请填写完整信息');
        return;
      }
      if (navigator.onLine === false) { status.textContent = '未保存：当前网络已断开，内容仍保留。'; return showToast('当前离线，目标尚未保存'); }

      button.disabled = true; button.textContent = '正在保存…'; status.textContent = '正在保存，请勿重复点击。';
      try {
        const result = await apiRequest(`/career/goals/${childId}`, 'POST', {
          client_request_id: document.getElementById('career-goal-request-id').value,
          title,
          category: type,
          description,
          target_date: deadline
        });

        if (result.success) {
          showToast(result.replayed ? '目标此前已保存，未重复创建' : '目标添加成功');
          closeTopModal();
        } else {
          showToast(result.error || '添加失败');
        }
      } catch (error) {
        status.textContent = '保存状态未确认，内容仍保留；可使用同一页面重试。'; showToast('目标尚未确认保存');
      } finally {
        if (document.body.contains(button)) { button.disabled = false; button.textContent = '保存'; }
      }
    }

    async function updateGoalStatus(goalId, status) {
      const childId = currentChildId();
      if (!childId) return showToast('请先选择儿童档案');
      try {
        const result = await apiRequest(`/career/goals/${childId}/${goalId}`, 'PUT', { progress: status === 'completed' ? 100 : 0 });

        if (result.success) {
          showToast('目标状态已更新');
          renderCareer(document.getElementById('main-content'));
        } else {
          showToast(result.error || '更新失败');
        }
      } catch (error) {
        showToast('网络错误');
      }
    }

    async function runCareerSimulation() {
      const childId = currentChildId();
      if (!childId) return showToast('请先选择儿童档案');
      const domains = Array.from(document.querySelectorAll('input[name="career-support-domain"]:checked')).map(input => input.value);
      if (!domains.length) return showToast('请至少选择一个支持方向');
      const button = document.getElementById('career-support-plan-button');
      const status = document.getElementById('career-support-plan-status');
      button.disabled = true;
      status.textContent = '正在整理讨论清单…';
      try {
        const result = await apiRequest('/career/simulator', 'POST', {
          childId,
          focus_domains: domains,
          support_level: document.getElementById('career-support-level').value
        });
        if (!result.success) throw new Error(result.error || '生成失败');
        const plan = result.support_plan;
        document.getElementById('career-support-plan-result').innerHTML = `
          <section class="bg-white rounded-xl p-4 card-shadow space-y-3" aria-label="未来支持讨论清单">
            <div><h4 class="font-bold text-text-primary">下一步讨论清单</h4><p class="text-xs text-text-muted mt-1">${escapeText(result.disclaimer)}</p></div>
            ${plan.domains.map(domain => `<div class="rounded-xl bg-primary/5 p-3"><div class="font-medium text-text-primary">${escapeText(domain.title)}</div><ul class="mt-2 space-y-1 text-sm text-text-secondary">${domain.questions.map(q => `<li>• ${escapeText(q)}</li>`).join('')}</ul></div>`).join('')}
            <div class="rounded-xl border border-border p-3 text-sm text-text-secondary"><strong class="text-text-primary">复核方式：</strong>${escapeText(plan.review_rule)}</div>
          </section>`;
        status.textContent = '已生成。请和孩子一起选择愿意尝试的一小步。';
      } catch (error) {
        status.textContent = navigator.onLine ? (error.message || '暂时无法生成，请稍后重试') : '当前离线，尚未生成或保存任何清单。';
      } finally {
        button.disabled = false;
      }
    }

    function buildLocalCareerSupportPlan(focusDomains, supportLevel) {
      const map = {
        communication: ['沟通与表达', ['孩子最容易使用哪种表达方式？', '哪些环境会让表达更困难？', '怎样让孩子能明确表示同意、拒绝或暂停？']],
        daily_living: ['日常生活参与', ['孩子希望参与哪一项日常活动？', '任务可以拆成哪一个最小步骤？', '需要视觉提示、示范、陪同还是环境调整？']],
        learning: ['学习与环境适配', ['孩子当前感兴趣并愿意尝试什么？', '噪声、光线、时间或任务长度需要怎样调整？', '怎样记录舒适度和参与意愿，而不只看完成率？']],
        community: ['社区与成年过渡', ['孩子希望接触哪些场所、活动或角色？', '出行、安全、决策和求助需要哪些支持？', '哪些当地资源仍需向主管部门或专业人员核验？']]
      };
      return {
        support_level: supportLevel,
        domains: (focusDomains || []).filter(key => map[key]).map(key => ({ key, title: map[key][0], questions: map[key][1] })),
        review_rule: '先征求孩子意见，只选择一项可逆、低风险的小步骤；记录舒适度和拒绝信号，1至2周后共同复核，出现明显痛苦立即暂停。'
      };
    }

    function editCareerGoal(goalId) {
      const goal = MOCK_DATA.careerGoals.find(g => g.id === goalId);
      if (!goal) return;
      const modal = document.createElement('div');
      modal.className = 'fixed inset-0 bg-black/50 flex items-end justify-center z-50';
      modal.innerHTML = `
        <div class="bg-white w-full max-w-md rounded-t-3xl p-6 modal-slide safe-area-bottom">
          <div class="flex justify-between items-center mb-4">
            <h2 class="text-lg font-bold">编辑生涯目标</h2>
            <button data-ui-action="remove-overlay" class="text-text-muted">✕</button>
          </div>
          <div class="space-y-4">
            <div>
              <label class="block text-sm text-text-secondary mb-1">目标名称</label>
              <input type="text" id="edit-goal-title" value="${escapeText(goal.title)}" class="w-full px-4 py-2.5 rounded-xl border border-border">
            </div>
            <div>
              <label class="block text-sm text-text-secondary mb-1">目标类型</label>
              <select id="edit-goal-type" class="w-full px-4 py-2.5 rounded-xl border border-border">
                <option value="skill" ${goal.type === 'skill' ? 'selected' : ''}>技能培养</option>
                <option value="social" ${goal.type === 'social' ? 'selected' : ''}>社交能力</option>
                <option value="career" ${goal.type === 'career' ? 'selected' : ''}>职业探索</option>
                <option value="education" ${goal.type === 'education' ? 'selected' : ''}>教育规划</option>
                <option value="life" ${goal.type === 'life' ? 'selected' : ''}>生活能力</option>
              </select>
            </div>
            <div>
              <label class="block text-sm text-text-secondary mb-1">描述</label>
              <textarea id="edit-goal-description" class="w-full px-4 py-3 rounded-xl border border-border" rows="3">${escapeText(goal.description)}</textarea>
            </div>
            <div>
              <label class="block text-sm text-text-secondary mb-1">截止日期</label>
              <input type="date" id="edit-goal-deadline" value="${escapeText(goal.deadline)}" class="w-full px-4 py-2.5 rounded-xl border border-border">
            </div>
            <button data-ui-call="saveEditCareerGoal" data-ui-args="[${Number(goalId)}]" class="w-full py-3 rounded-xl bg-primary text-white font-medium">保存修改</button>
          </div>
        </div>
      `;
      document.body.appendChild(modal);
    }

    async function saveEditCareerGoal(goalId) {
      const childId = currentChildId();
      const title = document.getElementById('edit-goal-title').value.trim();
      const type = document.getElementById('edit-goal-type').value;
      const description = document.getElementById('edit-goal-description').value.trim();
      const deadline = document.getElementById('edit-goal-deadline').value;

      if (!childId) {
        showToast('请先选择儿童档案');
        return;
      }
      if (!title) {
        showToast('请填写目标名称');
        return;
      }

      try {
        const result = await apiRequest(`/career/goals/${childId}/${goalId}`, 'PUT', { title, category: type, description, target_date: deadline });
        if (result.success) {
          showToast('目标已更新');
          closeTopModal();
          renderCareer(document.getElementById('main-content'));
        } else {
          showToast(result.error || '更新失败');
        }
      } catch (error) {
        showToast('网络错误');
      }
    }

    function renderFinance(container) {
      document.getElementById('page-title').textContent = '财务规划';
      document.getElementById('page-subtitle').textContent = '记账与防骗指南';

      container.innerHTML = `
        <div class="p-4 space-y-4 animate-fade-in">
          <div class="flex bg-white rounded-xl p-1 card-shadow">
            <button data-ui-call="renderFinanceRecords" data-ui-pass-this="true" class="flex-1 py-2 rounded-lg bg-primary text-white font-medium">记账记录</button>
            <button data-ui-call="renderFinanceSubsidies" data-ui-pass-this="true" class="flex-1 py-2 rounded-lg text-text-secondary">补贴核验</button>
            <button data-ui-call="renderFinanceFraud" data-ui-pass-this="true" class="flex-1 py-2 rounded-lg text-text-secondary">防骗指南</button>
          </div>

          <div id="finance-content">
            ${renderFinanceRecordsContent()}
          </div>
        </div>
      `;
    }

    function renderFinanceRecordsContent() {
      const records = MOCK_DATA.financialRecords;
      const totalIncome = records.filter(r => r.amount < 0).reduce((sum, r) => sum + Math.abs(r.amount), 0);
      const totalExpense = records.filter(r => r.amount > 0).reduce((sum, r) => sum + r.amount, 0);

      return `
        <div>
          <div class="grid grid-cols-2 gap-3 mb-4">
            <div class="bg-success/10 rounded-xl p-4">
              <div class="text-xs text-text-muted mb-1">本月收入</div>
              <div class="text-xl font-bold text-success">¥${totalIncome}</div>
            </div>
            <div class="bg-danger/10 rounded-xl p-4">
              <div class="text-xs text-text-muted mb-1">本月支出</div>
              <div class="text-xl font-bold text-danger">¥${totalExpense}</div>
            </div>
          </div>

          <h3 class="font-bold text-text-primary mb-3">消费记录</h3>
          <div class="space-y-3">
            ${records.map(r => `
              <div class="bg-white rounded-xl p-4 card-shadow">
                <div class="flex items-center justify-between mb-1">
                  <span class="font-medium text-text-primary">${escapeText(r.category)}</span>
                  <span class="font-bold ${r.amount > 0 ? 'text-danger' : 'text-success'}">${r.amount > 0 ? '-' : '+'}¥${Math.abs(r.amount)}</span>
                </div>
                <p class="text-sm text-text-secondary">${escapeText(r.note)}</p>
                <p class="text-xs text-text-muted mt-1">${escapeText(r.date)}</p>
              </div>
            `).join('')}
          </div>
          <button data-ui-call="showNewExpense" class="w-full mt-4 py-3 rounded-xl border-2 border-dashed border-border text-text-secondary hover:border-primary hover:text-primary transition-colors">
            + 添加记录
          </button>
        </div>
      `;
    }

    function renderFinanceRecords(btn) {
      btn.classList.add('bg-primary', 'text-white');
      btn.classList.remove('text-text-secondary');
      btn.nextElementSibling.classList.remove('bg-primary', 'text-white');
      btn.nextElementSibling.classList.add('text-text-secondary');
      btn.nextElementSibling.nextElementSibling.classList.remove('bg-primary', 'text-white');
      btn.nextElementSibling.nextElementSibling.classList.add('text-text-secondary');
      document.getElementById('finance-content').innerHTML = renderFinanceRecordsContent();
    }

    function renderFinanceSubsidies(btn) {
      btn.classList.add('bg-primary', 'text-white');
      btn.classList.remove('text-text-secondary');
      btn.previousElementSibling.classList.remove('bg-primary', 'text-white');
      btn.previousElementSibling.classList.add('text-text-secondary');
      btn.nextElementSibling.classList.remove('bg-primary', 'text-white');
      btn.nextElementSibling.classList.add('text-text-secondary');

      const subsidies = MOCK_DATA.subsidies;

      document.getElementById('finance-content').innerHTML = `
        <div>
          <h3 class="font-bold text-text-primary mb-1">补贴信息核验</h3><p class="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-xl p-3 mb-3">以下金额、条件和日期均为界面示例，未按您的地区核验，不能作为申领依据。请向当地残联、民政、医保、教育或政务平台确认政策名称、资格、材料、办理入口和更新时间。</p>
          <div class="space-y-3">
            ${subsidies.map(s => `
              <div class="bg-white rounded-xl p-4 card-shadow">
                <div class="flex items-start justify-between mb-2">
                  <div>
                    <span class="font-bold text-text-primary">${escapeText(s.name)}</span>
                    <span class="text-xs px-2 py-0.5 bg-yellow-100 text-yellow-700 rounded-full ml-2">${s.type === 'monthly' ? '每月' : '每年'}</span>
                  </div>
                  <span class="text-text-secondary font-bold">示例 ${escapeText(s.amount)}</span>
                </div>
                <p class="text-sm text-text-secondary mb-2">示例条件: ${escapeText(s.requirement)}</p>
                <div class="flex items-center justify-between text-xs">
                  <span class="text-text-muted">示例日期: ${escapeText(s.deadline)}</span>
                  <button data-ui-call="toggleSubsidyFollow" data-ui-args="[${Number(s.id)}]" class="px-3 py-1 rounded-lg ${s.status === '关注中' ? 'bg-primary text-white' : 'bg-secondary/50 text-text-secondary'}">
                    ${s.status === '关注中' ? '已关注' : '+ 关注'}
                  </button>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      `;
    }

    function renderFinanceFraud(btn) {
      btn.classList.add('bg-primary', 'text-white');
      btn.classList.remove('text-text-secondary');
      btn.previousElementSibling.classList.remove('bg-primary', 'text-white');
      btn.previousElementSibling.classList.add('text-text-secondary');
      btn.previousElementSibling.previousElementSibling.classList.remove('bg-primary', 'text-white');
      btn.previousElementSibling.previousElementSibling.classList.add('text-text-secondary');

      const alerts = MOCK_DATA.fraudAlerts;

      document.getElementById('finance-content').innerHTML = `
        <div>
          <h3 class="font-bold text-text-primary mb-3">防骗预警</h3>
          <div class="space-y-3">
            ${alerts.map(a => `
              <div class="rounded-xl p-4 card-shadow ${getFraudSeverityColor(a.severity)}">
                <div class="flex items-start justify-between mb-2">
                  <div class="flex items-center gap-2">
                    <span>${getFraudIcon(a.type)}</span>
                    <span class="font-bold text-text-primary">${escapeText(a.title)}</span>
                  </div>
                  <span class="text-xs px-2 py-0.5 ${getFraudSeverityBadge(a.severity)} rounded-full">${getFraudSeverityText(a.severity)}</span>
                </div>
                <p class="text-sm text-text-secondary">${escapeText(a.description)}</p>
                <p class="text-xs text-text-muted mt-2">${escapeText(a.date)}</p>
              </div>
            `).join('')}
          </div>

          <div class="bg-white rounded-xl p-4 card-shadow mt-4">
            <h4 class="font-medium text-text-primary">保存可疑线索</h4>
            <p class="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-xl p-3 my-3">此功能只帮助您整理线索，当前没有连接监管、警方或人工审核。已经转账、泄露验证码或面临威胁时，请立即联系银行和110，不要等待本页面反馈。</p>
            <input id="fraud-report-title" placeholder="简短标题，如：机构要求私下转账" maxlength="100" class="w-full px-4 py-3 rounded-xl border border-border mb-3">
            <select id="fraud-report-type" class="w-full px-4 py-3 rounded-xl border border-border mb-3"><option value="institution">机构</option><option value="product">产品</option><option value="course">课程</option><option value="insurance">保险</option><option value="donation">捐款</option><option value="other">其他</option></select>
            <input id="fraud-report-location" placeholder="地区（可选，不填写详细住址）" maxlength="100" class="w-full px-4 py-3 rounded-xl border border-border mb-3">
            <textarea id="fraud-report-content" placeholder="描述可疑行为；不要填写身份证号、银行卡号、验证码或完整联系方式" maxlength="1000" class="w-full px-4 py-3 rounded-xl border border-border mb-3" rows="3"></textarea>
            <input type="hidden" id="fraud-report-request-id" value="${newClientRequestId()}">
            <button id="fraud-report-button" data-ui-call="submitFraudReport" class="w-full py-3 rounded-xl bg-danger text-white font-medium disabled:opacity-60">保存线索</button>
            <p id="fraud-report-status" class="text-xs text-text-muted mt-2" role="status">尚未保存；不会自动发送给任何外部机构。</p>
          </div>
        </div>
      `;
    }

    function getFraudIcon(type) {
      const icons = {
        '诈骗': '🚨',
        '虚假信息': '⚠️',
        '风险提示': '🔒'
      };
      return icons[type] || '📢';
    }

    function getFraudSeverityColor(severity) {
      switch(severity) {
        case 'high': return 'bg-red-50 border border-red-200';
        case 'medium': return 'bg-yellow-50 border border-yellow-200';
        case 'low': return 'bg-blue-50 border border-blue-200';
        default: return 'bg-white';
      }
    }

    function getFraudSeverityBadge(severity) {
      switch(severity) {
        case 'high': return 'bg-red-100 text-red-600';
        case 'medium': return 'bg-yellow-100 text-yellow-600';
        case 'low': return 'bg-blue-100 text-blue-600';
        default: return 'bg-gray-100 text-gray-600';
      }
    }

    function getFraudSeverityText(severity) {
      switch(severity) {
        case 'high': return '高风险';
        case 'medium': return '中风险';
        case 'low': return '低风险';
        default: return severity;
      }
    }

    function showNewExpense() {
      const modal = document.createElement('div');
      modal.className = 'fixed inset-0 bg-black/50 flex items-end justify-center z-50';
      modal.innerHTML = `
        <div class="bg-white w-full max-w-md rounded-t-3xl p-6 modal-slide safe-area-bottom">
          <div class="flex justify-between items-center mb-4">
            <h2 class="text-lg font-bold">添加记账记录</h2>
            <button data-ui-action="remove-overlay" class="text-text-muted">✕</button>
          </div>
          <div class="space-y-4">
            <div>
              <label class="block text-sm text-text-secondary mb-1">类型</label>
              <div class="flex gap-2" id="expense-type-group">
                <button data-ui-call="setExpenseType" data-ui-args='["expense"]' data-ui-pass-this="true" class="flex-1 py-2 rounded-lg bg-primary text-white text-sm">支出</button>
                <button data-ui-call="setExpenseType" data-ui-args='["income"]' data-ui-pass-this="true" class="flex-1 py-2 rounded-lg border border-border text-text-secondary text-sm">收入</button>
              </div>
              <input type="hidden" id="expense-type" value="expense">
            </div>
            <div>
              <label class="block text-sm text-text-secondary mb-1">分类</label>
              <select id="expense-category" class="w-full px-4 py-2.5 rounded-xl border border-border">
                <option value="康复训练">康复训练</option>
                <option value="医疗检查">医疗检查</option>
                <option value="教育用品">教育用品</option>
                <option value="日常生活">日常生活</option>
                <option value="政府补贴">政府补贴</option>
                <option value="其他">其他</option>
              </select>
            </div>
            <div>
              <label class="block text-sm text-text-secondary mb-1">金额</label>
              <input type="number" id="expense-amount" placeholder="0.00" min="0.01" max="100000000" step="0.01" inputmode="decimal" class="w-full px-4 py-2.5 rounded-xl border border-border">
            </div>
            <div>
              <label class="block text-sm text-text-secondary mb-1">备注</label>
              <input type="text" id="expense-note" placeholder="不填写身份证号、银行卡号或完整票据号码" maxlength="300" class="w-full px-4 py-2.5 rounded-xl border border-border">
            </div>
            <input type="hidden" id="expense-request-id" value="${newClientRequestId()}">
            <button id="expense-save-button" data-ui-call="saveExpense" class="w-full py-3 rounded-xl bg-primary text-white font-medium disabled:opacity-60">保存</button>
            <p id="expense-save-status" class="text-xs text-text-muted" role="status">尚未保存</p>
          </div>
        </div>
      `;
      document.body.appendChild(modal);
    }

    function setExpenseType(type, btn) {
      document.getElementById('expense-type').value = type;
      document.querySelectorAll('#expense-type-group button').forEach(b => {
        b.className = 'flex-1 py-2 rounded-lg border border-border text-text-secondary text-sm';
      });
      btn.className = 'flex-1 py-2 rounded-lg bg-primary text-white text-sm';
    }

    async function saveExpense() {
      const childId = currentChildId();
      const type = document.getElementById('expense-type').value;
      const category = document.getElementById('expense-category').value;
      const amount = parseFloat(document.getElementById('expense-amount').value);
      const note = document.getElementById('expense-note').value;
      const button = document.getElementById('expense-save-button');
      const status = document.getElementById('expense-save-status');
      if (button.disabled) return;

      if (!childId) {
        showToast('请先选择儿童档案');
        return;
      }
      if (!amount) {
        showToast('请填写金额');
        return;
      }
      if (navigator.onLine === false) { status.textContent = '未保存：当前网络已断开，金额和备注仍保留。'; return showToast('当前离线，记录尚未保存'); }

      const finalAmount = type === 'income' ? -amount : amount;

      button.disabled = true; button.textContent = '正在保存…'; status.textContent = '正在保存，请勿重复点击。';
      try {
        const result = await apiRequest(`/finance/expenses/${childId}`, 'POST', {
          client_request_id: document.getElementById('expense-request-id').value,
          category,
          amount: finalAmount,
          description: note
        });

        if (result.success) {
          showToast(result.replayed ? '该记录此前已保存，未重复记账' : '记录添加成功');
          closeTopModal();
          renderFinanceRecordsContent();
        } else {
          showToast(result.error || '添加失败');
        }
      } catch (error) {
        status.textContent = '保存状态未确认，金额和备注仍保留；可使用同一页面重试。'; showToast('记账尚未确认保存');
      } finally {
        if (document.body.contains(button)) { button.disabled = false; button.textContent = '保存'; }
      }
    }

    async function toggleSubsidyFollow(subsidyId) {
      const isFollowing = MOCK_DATA.subsidies.find(s => s.id === subsidyId)?.status === '关注中';
      const endpoint = isFollowing ? 'unfollow' : 'follow';

      try {
        const result = await apiRequest(`/finance/subsidies/${endpoint}/${subsidyId}`, isFollowing ? 'DELETE' : 'POST');

        if (result.success) {
          showToast(isFollowing ? '已取消示例关注' : '已关注示例；请自行核验当地政策');
          renderFinance(document.getElementById('main-content'));
        } else {
          showToast(result.error || '操作失败');
        }
      } catch (error) {
        showToast('网络错误');
      }
    }

    async function submitFraudReport() {
      const title = document.getElementById('fraud-report-title').value.trim();
      const description = document.getElementById('fraud-report-content').value.trim();
      const type = document.getElementById('fraud-report-type').value;
      const location = document.getElementById('fraud-report-location').value.trim();
      const button = document.getElementById('fraud-report-button');
      const status = document.getElementById('fraud-report-status');
      if (button.disabled) return;

      if (!title || !description) {
        showToast('请填写标题和线索描述');
        return;
      }
      if (navigator.onLine === false) { status.textContent = '未保存：当前网络已断开，内容仍保留。'; return showToast('当前离线，线索尚未保存'); }

      button.disabled = true; button.textContent = '正在保存…'; status.textContent = '正在保存个人线索，请勿重复点击。';
      try {
        const result = await apiRequest('/finance/fraud-report', 'POST', { title, type, description, location, client_request_id: document.getElementById('fraud-report-request-id').value });

        if (result.success) {
          status.textContent = result.message || '已保存为个人线索，未发送给外部机构。';
          showToast(result.replayed ? '线索此前已保存，未重复创建' : '线索已保存，未发送给外部机构');
        } else {
          showToast(result.error || '提交失败');
        }
      } catch (error) {
        status.textContent = '保存状态未确认，内容仍保留；可使用同一页面重试。'; showToast('线索尚未确认保存');
      } finally {
        button.disabled = false; button.textContent = '保存线索';
      }
    }

    function closeTopAndShowStrategyDetail(id) { closeTopModal(); showStrategyDetail(id); }
    function closeTopAndStartEmergency(level) { closeTopModal(); startEmergency(level); }
    function removeOverlayThenShowNewRecord(id, trigger) { trigger.closest('.fixed')?.remove(); showNewRecord(id); }
    function removeOverlayThenOpenChildRecords(id, trigger) { trigger.closest('.fixed')?.remove(); openChildRecords(id); }
    function removeOverlayThenShareReport(id, trigger) { trigger.closest('.fixed')?.remove(); showShareToTherapistModal(id); }
    function removeOverlayThenNavigate(page, trigger) { trigger.closest('.fixed')?.remove(); navigateTo(page); }
    function openPeerMessages(groupId, trigger) { trigger.closest('.fixed')?.remove(); currentPeerTab='messages'; currentGroupId=groupId; navigateTo('peer'); }
    function submitCurrentLonelinessScore() { submitLonelinessScore(Number.parseInt(document.getElementById('loneliness-slider')?.value,10)); }

    // === 初始化 ===
    document.addEventListener('DOMContentLoaded', () => {
      window.addEventListener('offline',()=>showToast('网络已断开；未完成的保存不会自动假装成功'));
      window.addEventListener('online',()=>showToast('网络已恢复，可重试刚才未完成的保存'));
      document.addEventListener('click', event => {
        const trigger = event.target.closest('[data-ui-action],[data-ui-call],[data-nav]');
        if (!trigger) return;
        const action = trigger.dataset.uiAction;
        if (action === 'close-top-modal') closeTopModal();
        else if (action === 'remove-overlay') trigger.closest('.fixed')?.remove();
        else if (action === 'print') window.print();
        else if (action === 'close-and-navigate') { closeTopModal(); navigateTo(trigger.dataset.nav); }
        else if (trigger.dataset.uiCall) {
          const calls={acceptCaregiverInvitation,addEmergencyContact,askKnowledge,callEmergencyContact,changePassword,checkIn,clearCache,clearKnowledge,clearProfessionalBrief,closeStoryReader,closeTopAndShowStrategyDetail,closeTopAndStartEmergency,confirmClearCache,confirmExportFromModal,copyProfessionalBrief,createCaregiverInvitation,createPost,createStory,exportData,filterAchievements,filterCommunityByCategory,filterDialogues,filterGrowthCourses,filterRecordsByChild,filterStrategiesByCategory,finishEmergencySession,finishStrategyNavigator,generateProfessionalBrief,generateReport,handleLogout,handleRegister,hideRegister,loadDialogues,loadWorksheets,markAllRead,openPeerMessages,recordMood,removeOverlayThenNavigate,removeOverlayThenOpenChildRecords,removeOverlayThenShareReport,removeOverlayThenShowNewRecord,renderCareerGoals,renderCareerSimulator,renderCareerTimeline,renderFamilyGratitude,renderFamilyMood,renderFinanceFraud,renderFinanceRecords,renderFinanceSubsidies,renderPeerTab,runAIAnalysis,runCareerSimulation,runSecurityAlertScan,runWeeklyReportJobs,saveCareerGoal,saveChild,saveEmergencyOutcome,saveExpense,saveFamilyTool,saveGoal,saveGratitude,saveManualProfessionalPlan,saveMentalHealthProfile,saveMilestone,saveProfile,saveRecord,saveSafetyPlan,saveWanderingPlan,saveWeeklyReportPreferences,sendKbFeedback,sendPeerMessage,setExpenseType,setRecordType,setReportWeek,showAbout,showAdminResolution,showAuthorizationCenter,showCaregiverAccessCenter,showChangePassword,showDataDeletionCenter,showDataDeletionRequestForm,showEditProfile,showEmergencyContactManager,showEmergencyStrategies,showFamilyTool,showFeedback,showImmediateDangerHelp,showLonelinessAssessModal,showManualProfessionalPlanEditor,showMentalHealthProfileEditor,showMentalHealthTriage,showMoreStrategies,showMyCommunityReports,showNewCareerGoal,showNewChild,showNewExpense,showNewGoal,showNewGratitude,showNewMilestone,showNewPost,showNewRecord,showNewReport,showNewStory,showPrivacyPolicy,showProfessionalIntake,showRegister,showSafetyPlan,showSafetyProfile,showSafetySkills,showSecurityOperations,showStrategyNavigator,showWanderingPlan,showWeeklyReportPreferences,showWanderingPlan,startEmergency,startMissingChildMode,storyNextParagraph,storyPrevParagraph,submitAdminResolution,submitCurrentLonelinessScore,submitDataDeletionRequest,submitFeedback,submitFraudReport,submitPlanReview,submitStrategyFeedback,switchDialogueTab,toggleVoiceRecording,updateGoalStatus,updateProfessionalPlan};
          Object.assign(calls,{addComment,blockCommunityContent,cancelDataDeletionRequest,completeSuggestion,confirmDeleteRecord,confirmShareReport,deleteRecord,downloadCredentialEvidence,editCareerGoal,editRecord,filterRecordsByChild,joinGroup,likePeerMessage,likePost,markNotificationRead,navigateTo,openChildRecords,openDialogue,openKnowledgeSource,openWorksheet,playStory,practiceSkill,registerActivity,removeEmergencyContact,reportCommunityContent,replyPeerMessage,retryWeeklyReportJob,revokeCaregiverAccess,revokeReportShare,saveEditCareerGoal,saveEditRecord,saveProfessionalAction,showAchievementDetail,showCaregiverResource,showChildDetail,showCourseDetail,showCredentialEvidenceForm,showCredentialReview,showGroupDetail,showNewRecord,showPlanReviewModal,showPostDetail,showProfessionalPlanEditor,showRecordDetail,showReportDetail,showShareToTherapistModal,showStoryDetail,showStrategyDetail,speakStrategy,startLearning,submitCommunityReport,submitCredentialEvidence,submitCredentialReview,switchPeerGroup,toggleStoryAutoPlay,toggleSubsidyFollow});
          let args=[];try{args=JSON.parse(trigger.dataset.uiArgs||'[]')}catch(_){return}if(trigger.dataset.uiPassThis==='true')args.push(trigger);calls[trigger.dataset.uiCall]?.(...args);
        }
        else if (trigger.dataset.nav) navigateTo(trigger.dataset.nav);
      });
      document.addEventListener('input',event=>{const el=event.target.closest('[data-ui-input]');if(!el)return;const actions={records:()=>onRecordsSearch(el.value),strategies:()=>onStrategiesSearch(el.value),community:()=>onCommunitySearch(el.value),intensity:()=>updateIntensity(el.value),editIntensity:()=>{document.getElementById('edit-intensity-value').textContent=el.value<=3?'低':el.value<=6?'中等':'高'},loneliness:()=>{document.getElementById('loneliness-score-display').textContent=el.value}};actions[el.dataset.uiInput]?.()});
      document.addEventListener('change',event=>{const el=event.target.closest('[data-ui-change]');if(!el)return;const actions={photo:()=>handlePhotoSelect(event),risk:()=>handleRiskCategory(el.value),diagnosis:()=>document.getElementById('child-other-diagnosis').classList.toggle('hidden',el.value!=='OTHER'),deletion:()=>toggleDeletionChildField(el.value),setting:()=>toggleSetting(el.dataset.setting,el.checked),strategyStep:()=>toggleStrategyStep(Number(el.dataset.strategy),Number(el.dataset.step),el.checked)};actions[el.dataset.uiChange]?.()});
      document.addEventListener('keydown',event=>{if(event.target.closest('[data-ui-enter="send-peer"]')&&event.key==='Enter')sendPeerMessage()});
      document.addEventListener('submit',event=>{if(event.target.matches('[data-ui-submit="login"]')){event.preventDefault();handleLogin()}});
      // 恢复全局应用状态
      loadAppState();

      // 从localStorage恢复行为记录
      const savedBehaviors = mayUsePrototypeStorage() ? localStorage.getItem('xingban_behaviors') : null;
      if (savedBehaviors) {
        try {
          const parsed = JSON.parse(savedBehaviors);
          if (Array.isArray(parsed) && parsed.length > 0) {
            MOCK_DATA.behaviors = parsed;
          }
        } catch(e) {}
      }
      const savedChildren = mayUsePrototypeStorage() ? localStorage.getItem('xingban_children') : null;
      if (savedChildren) { try { const parsed=JSON.parse(savedChildren); if(Array.isArray(parsed)&&parsed.length) MOCK_DATA.children=parsed; } catch(e) {} }
      try { strategyFeedbackHistory = JSON.parse(localStorage.getItem('xingban_strategy_feedback') || '[]'); } catch (_) { strategyFeedbackHistory = []; }
      try { professionalActions = JSON.parse(sessionStorage.getItem('xingban_professional_actions') || '[]'); } catch (_) { professionalActions = []; }

      // 恢复设置
      const savedSettings = localStorage.getItem('xingban_settings');
      if (savedSettings) {
        try { settingsState = { ...settingsState, ...JSON.parse(savedSettings) }; } catch(e) {}
      }
      document.body.classList.toggle('low-burden-mode', !!settingsState.lowBurdenMode);
      document.body.classList.toggle('no-gamification', !settingsState.gamification);

      // 令牌仅驻留内存，刷新页面后按安全策略回到登录页。
      localStorage.removeItem('xingban_token');
      localStorage.removeItem('xingban_user');
    });

    // 保存行为记录到localStorage
    function persistBehaviors() {
      if (mayUsePrototypeStorage() && useMockMode && sessionDataMode === 'demo') {
        localStorage.setItem('xingban_behaviors', JSON.stringify(MOCK_DATA.behaviors));
      } else {
        localStorage.removeItem('xingban_behaviors');
      }
    }

    // === 设置页面 ===
    let settingsState = {
      notifyBehavior: true,
      notifyReport: true,
      notifyCommunity: true,
      notifyTraining: true,
      lowBurdenMode: false,
      gamification: true,
      quietNight: true,
      dataExported: false,
    };

    function renderSettings(container) {
      document.getElementById('page-title').textContent = '设置';
      document.getElementById('page-subtitle').textContent = '个性化配置';

      container.innerHTML = `
        <div class="p-4 space-y-4 animate-fade-in">
          <div><h3 class="font-bold text-text-primary mb-3">照护减负</h3><div class="bg-white rounded-xl card-shadow overflow-hidden">
            <label class="p-4 flex items-center justify-between border-b border-border"><span><span class="block font-medium">低负担模式</span><span class="text-xs text-text-muted">隐藏连续天数与非必要任务，只保留安全、记录和联系人</span></span><input type="checkbox" ${settingsState.lowBurdenMode?'checked':''} data-ui-change="setting" data-setting="lowBurdenMode" class="w-5 h-5 accent-primary"></label>
            <label class="p-4 flex items-center justify-between border-b border-border"><span><span class="block font-medium">积分与成就</span><span class="text-xs text-text-muted">可关闭游戏化，不影响任何核心功能</span></span><input type="checkbox" ${settingsState.gamification?'checked':''} data-ui-change="setting" data-setting="gamification" class="w-5 h-5 accent-primary"></label>
            <label class="p-4 flex items-center justify-between"><span><span class="block font-medium">夜间免打扰</span><span class="text-xs text-text-muted">22:00—08:00 仅保留安全类通知</span></span><input type="checkbox" ${settingsState.quietNight?'checked':''} data-ui-change="setting" data-setting="quietNight" class="w-5 h-5 accent-primary"></label>
          </div></div>
          <!-- 通知偏好 -->
          <div>
            <h3 class="font-bold text-text-primary mb-1">通知偏好</h3><p class="text-xs text-text-muted mb-3">普通开关只保存界面偏好；家庭周报可在连接正式后端后单独设置后台生成时间</p>
            <div class="bg-white rounded-xl card-shadow overflow-hidden">
              <div class="p-4 flex items-center justify-between border-b border-border">
                <div>
                  <div class="font-medium text-text-primary">行为记录提醒</div>
                  <div class="text-xs text-text-muted">偏好开启；体验版不会自动发送每日提醒</div>
                </div>
                <label class="relative inline-flex items-center cursor-pointer">
                  <input type="checkbox" ${settingsState.notifyBehavior ? 'checked' : ''} data-ui-change="setting" data-setting="notifyBehavior" class="sr-only peer">
                  <div class="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
                </label>
              </div>
              <div class="p-4 flex items-center justify-between border-b border-border">
                <div>
                  <div class="font-medium text-text-primary">周报生成通知</div>
                  <div class="text-xs text-text-muted">偏好开启；体验版不会在后台自动生成或推送</div>
                </div>
                <label class="relative inline-flex items-center cursor-pointer">
                  <input type="checkbox" ${settingsState.notifyReport ? 'checked' : ''} data-ui-change="setting" data-setting="notifyReport" class="sr-only peer">
                  <div class="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
                </label>
              </div>
              <div class="p-4 flex items-center justify-between border-b border-border">
                <div>
                  <div class="font-medium text-text-primary">社区互动通知</div>
                  <div class="text-xs text-text-muted">真实社区接入后才会产生；当前为界面偏好</div>
                </div>
                <label class="relative inline-flex items-center cursor-pointer">
                  <input type="checkbox" ${settingsState.notifyCommunity ? 'checked' : ''} data-ui-change="setting" data-setting="notifyCommunity" class="sr-only peer">
                  <div class="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
                </label>
              </div>
              <div class="p-4 flex items-center justify-between">
                <div>
                  <div class="font-medium text-text-primary">训练提醒</div>
                  <div class="text-xs text-text-muted">偏好开启；不会把学习任务作为必须完成的照护考核</div>
                </div>
                <label class="relative inline-flex items-center cursor-pointer">
                  <input type="checkbox" ${settingsState.notifyTraining ? 'checked' : ''} data-ui-change="setting" data-setting="notifyTraining" class="sr-only peer">
                  <div class="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
                </label>
              </div>
            </div>
            <button data-ui-call="showWeeklyReportPreferences" class="w-full mt-3 p-4 rounded-xl bg-white card-shadow flex items-center justify-between text-left"><span><strong class="block text-text-primary">家庭周报自动生成</strong><span class="text-xs text-text-muted">设置每周生成时间，或暂停后台生成</span></span><span class="text-primary">设置 →</span></button>
          </div>

          <!-- 账号管理 -->
          <div>
            <h3 class="font-bold text-text-primary mb-3">账号管理</h3>
            <div class="bg-white rounded-xl card-shadow overflow-hidden">
              <button data-ui-call="showEditProfile" class="w-full p-4 flex items-center gap-4 hover:bg-gray-50 transition-colors border-b border-border">
                <div class="w-10 h-10 bg-primary-light/50 rounded-xl flex items-center justify-center">
                  <svg class="w-5 h-5 text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                    <circle cx="12" cy="7" r="4"/>
                  </svg>
                </div>
                <div class="flex-1 text-left">
                  <div class="font-medium text-text-primary">修改个人信息</div>
                  <div class="text-xs text-text-muted">昵称、头像等</div>
                </div>
                <svg class="w-5 h-5 text-text-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M9 18l6-6-6-6"/>
                </svg>
              </button>
              <button data-ui-call="showChangePassword" class="w-full p-4 flex items-center gap-4 hover:bg-gray-50 transition-colors border-b border-border">
                <div class="w-10 h-10 bg-yellow-100 rounded-xl flex items-center justify-center">
                  <svg class="w-5 h-5 text-yellow-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                    <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                  </svg>
                </div>
                <div class="flex-1 text-left">
                  <div class="font-medium text-text-primary">修改密码</div>
                  <div class="text-xs text-text-muted">更新登录密码</div>
                </div>
                <svg class="w-5 h-5 text-text-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M9 18l6-6-6-6"/>
                </svg>
              </button>
              <button data-ui-call="exportData" class="w-full p-4 flex items-center gap-4 hover:bg-gray-50 transition-colors">
                <div class="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center">
                  <svg class="w-5 h-5 text-blue-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                    <polyline points="7 10 12 15 17 10"/>
                    <line x1="12" y1="15" x2="12" y2="3"/>
                  </svg>
                </div>
                <div class="flex-1 text-left">
                  <div class="font-medium text-text-primary">导出当前体验数据</div>
                  <div class="text-xs text-text-muted">明文JSON，仅含当前页面可见及本机体验数据</div>
                </div>
                <svg class="w-5 h-5 text-text-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M9 18l6-6-6-6"/>
                </svg>
              </button>
            </div>
          </div>

          <!-- 隐私与安全 -->
          <div>
            <h3 class="font-bold text-text-primary mb-3">隐私与安全</h3>
            <div class="bg-white rounded-xl card-shadow overflow-hidden">
              <div class="p-4 flex items-center justify-between border-b border-border">
                <div>
                  <div class="font-medium text-text-primary">匿名社区发帖</div>
                  <div class="text-xs text-text-muted">仅控制前台昵称显示，不等于不可识别</div>
                </div>
                <label class="relative inline-flex items-center cursor-pointer">
                  <input type="checkbox" class="sr-only peer">
                  <div class="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
                </label>
              </div>
              <button data-ui-call="showPrivacyPolicy" class="w-full p-4 flex items-center gap-4 hover:bg-gray-50 transition-colors border-b border-border">
                <div class="flex-1 text-left">
                  <div class="font-medium text-text-primary">隐私政策</div>
                  <div class="text-xs text-text-muted">了解我们如何保护您的数据</div>
                </div>
                <svg class="w-5 h-5 text-text-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M9 18l6-6-6-6"/>
                </svg>
              </button>
              <button data-ui-call="showAuthorizationCenter" class="w-full p-4 flex items-center gap-4 hover:bg-gray-50 transition-colors border-b border-border">
                <div class="flex-1 text-left">
                  <div class="font-medium text-text-primary">授权与访问记录</div>
                  <div class="text-xs text-text-muted">查看分享、有效期、撤销状态和访问审计</div>
                </div>
                <svg class="w-5 h-5 text-text-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18l6-6-6-6"/></svg>
              </button>
              ${currentUser?.role==='admin'?`<button data-ui-call="showSecurityOperations" class="w-full p-4 flex items-center gap-4 hover:bg-gray-50 transition-colors border-b border-border"><div class="flex-1 text-left"><div class="font-medium text-text-primary">安全与服务运营台</div><div class="text-xs text-text-muted">仅管理员：社区、专业资质、删除、告警与周报任务</div></div><svg class="w-5 h-5 text-text-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18l6-6-6-6"/></svg></button>`:''}
              <button data-ui-call="showDataDeletionCenter" class="w-full p-4 flex items-center gap-4 hover:bg-gray-50 transition-colors border-b border-border">
                <div class="flex-1 text-left">
                  <div class="font-medium text-red-700">数据删除申请</div>
                  <div class="text-xs text-text-muted">申请删除某个孩子或整个账号数据，并查看处理状态</div>
                </div>
                <svg class="w-5 h-5 text-text-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18l6-6-6-6"/></svg>
              </button>
              <button data-ui-call="clearCache" class="w-full p-4 flex items-center gap-4 hover:bg-gray-50 transition-colors">
                <div class="flex-1 text-left">
                  <div class="font-medium text-text-primary">清除缓存</div>
                  <div class="text-xs text-text-muted">清除本地缓存数据</div>
                </div>
                <span class="text-xs text-text-muted">实际大小由浏览器决定</span>
              </button>
            </div>
          </div>

          <!-- 关于 -->
          <div>
            <h3 class="font-bold text-text-primary mb-3">关于</h3>
            <div class="bg-white rounded-xl card-shadow overflow-hidden">
              <div class="p-4 flex items-center justify-between border-b border-border">
                <div class="font-medium text-text-primary">版本号</div>
                <span class="text-sm text-text-muted">4.0.0 受监督测试版</span>
              </div>
              <button data-ui-call="showAbout" class="w-full p-4 flex items-center gap-4 hover:bg-gray-50 transition-colors border-b border-border">
                <div class="flex-1 text-left">
                  <div class="font-medium text-text-primary">关于星伴</div>
                </div>
                <svg class="w-5 h-5 text-text-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M9 18l6-6-6-6"/>
                </svg>
              </button>
              <button data-ui-call="showFeedback" class="w-full p-4 flex items-center gap-4 hover:bg-gray-50 transition-colors">
                <div class="flex-1 text-left">
                  <div class="font-medium text-text-primary">意见反馈</div>
                </div>
                <svg class="w-5 h-5 text-text-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M9 18l6-6-6-6"/>
                </svg>
              </button>
            </div>
          </div>

          <p class="text-center text-xs text-text-muted py-4">星伴 v4.0.0 受监督体验版 · 安全与现实支持优先</p>
        </div>
      `;
    }

    function toggleSetting(key, value) {
      settingsState[key] = value;
      localStorage.setItem('xingban_settings', JSON.stringify(settingsState));
      if (key === 'lowBurdenMode') document.body.classList.toggle('low-burden-mode', value);
      if (key === 'gamification') document.body.classList.toggle('no-gamification', !value);
      showToast(value ? '已开启' : '已关闭');
    }

    async function showWeeklyReportPreferences(){
      const modal=document.createElement('div');modal.className='modal-backdrop';modal.dataset.modal='true';
      if(useMockMode){modal.innerHTML='<div class="modal-content max-w-lg p-5"><div class="flex justify-between"><h2 class="text-lg font-bold">家庭周报自动生成</h2><button data-ui-action="close-top-modal" aria-label="关闭">✕</button></div><div class="mt-4 rounded-xl bg-amber-50 border border-amber-200 p-4 text-sm text-amber-900">公开体验版没有后台家庭任务，不会伪装成已经开启自动周报。连接正式后端后，可选择星期、小时和暂停状态。</div></div>';document.body.appendChild(modal);return}
      modal.innerHTML='<div class="modal-content max-w-lg p-5"><div class="flex justify-between"><h2 class="text-lg font-bold">家庭周报自动生成</h2><button data-ui-action="close-top-modal" aria-label="关闭">✕</button></div><div class="py-10 text-center text-text-muted">正在读取设置…</div></div>';document.body.appendChild(modal);
      try{const result=await apiRequest('/report/preferences','GET');if(!result.success)throw new Error(result.error||'读取失败');const p=result.preference||{};modal.firstElementChild.innerHTML=`<div class="flex justify-between"><div><h2 class="text-lg font-bold">家庭周报自动生成</h2><p class="text-xs text-text-muted mt-1">只汇总已经完成的上一自然周，不生成诊断结论</p></div><button data-ui-action="close-top-modal" aria-label="关闭">✕</button></div><label class="flex items-center justify-between mt-5 p-3 rounded-xl bg-background"><span><strong class="block text-sm">启用自动生成</strong><span class="text-xs text-text-muted">关闭后不会创建新的后台周报任务</span></span><input id="weekly-pref-enabled" type="checkbox" ${p.enabled?'checked':''} class="w-5 h-5 accent-primary"></label><div class="grid grid-cols-2 gap-3 mt-4"><label class="text-sm font-medium">每周哪天<select id="weekly-pref-weekday" class="mt-1 w-full p-3 rounded-xl border border-border bg-white">${['周一','周二','周三','周四','周五','周六','周日'].map((label,index)=>`<option value="${index+1}" ${Number(p.delivery_weekday)===index+1?'selected':''}>${label}</option>`).join('')}</select></label><label class="text-sm font-medium">当地小时<select id="weekly-pref-hour" class="mt-1 w-full p-3 rounded-xl border border-border bg-white">${Array.from({length:24},(_,hour)=>`<option value="${hour}" ${Number(p.delivery_hour)===hour?'selected':''}>${String(hour).padStart(2,'0')}:00</option>`).join('')}</select></label></div><label class="block mt-3 text-sm font-medium">时区<select id="weekly-pref-timezone" class="mt-1 w-full p-3 rounded-xl border border-border bg-white"><option value="Asia/Shanghai" ${p.timezone==='Asia/Shanghai'?'selected':''}>中国标准时间（Asia/Shanghai）</option><option value="Asia/Hong_Kong" ${p.timezone==='Asia/Hong_Kong'?'selected':''}>香港时间（Asia/Hong_Kong）</option><option value="Asia/Taipei" ${p.timezone==='Asia/Taipei'?'selected':''}>台北时间（Asia/Taipei）</option></select></label><p class="text-xs text-text-muted mt-3">任务可能因服务器调度稍后执行；站内通知只在周报和通知记录均成功写入后显示。</p><p id="weekly-pref-status" class="text-xs text-text-muted mt-3" role="status">当前显示已保存设置；修改后需点击保存。</p><button id="weekly-pref-save" data-ui-call="saveWeeklyReportPreferences" class="w-full mt-4 py-3 rounded-xl bg-primary text-white font-bold disabled:opacity-60">保存设置</button>`}catch(error){modal.firstElementChild.innerHTML=`<div class="p-5 text-center text-text-muted">${escapeText(error.message||'读取失败')}</div>`}
    }
    let weeklyPreferenceInFlight=false;
    async function saveWeeklyReportPreferences(){if(weeklyPreferenceInFlight)return;const data={enabled:!!document.getElementById('weekly-pref-enabled')?.checked,delivery_weekday:Number(document.getElementById('weekly-pref-weekday')?.value),delivery_hour:Number(document.getElementById('weekly-pref-hour')?.value),timezone:document.getElementById('weekly-pref-timezone')?.value},status=document.getElementById('weekly-pref-status'),button=document.getElementById('weekly-pref-save');if(navigator.onLine===false){status.textContent='未保存：当前网络已断开；选择仍保留在本页，联网后可重试。';showToast('当前网络已断开，周报设置尚未保存');return}weeklyPreferenceInFlight=true;button.disabled=true;button.textContent='正在保存…';status.textContent='正在保存，请勿重复点击。';try{const result=await apiRequest('/report/preferences','PUT',data);if(!result.success)throw new Error(result.error||'保存失败');closeTopModal();showToast(data.enabled?'自动周报设置已保存':'自动周报已暂停')}catch(error){status.textContent=`未确认保存：${error.message||'网络连接中断'}。选择仍保留在本页，可重试。`;showToast('周报设置尚未确认保存')}finally{weeklyPreferenceInFlight=false;const current=document.getElementById('weekly-pref-save');if(current){current.disabled=false;current.textContent='保存设置'}}}

    const deletionStatusLabel = value => ({pending:'待处理',processing:'处理中',completed:'已完成',rejected:'未批准',cancelled:'已撤销'}[value] || value);
    async function showDataDeletionCenter() {
      const modal=document.createElement('div');modal.className='fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-[70] p-0 sm:p-4';modal.dataset.modal='true';
      if(useMockMode){modal.innerHTML='<div class="modal-content max-w-lg p-5"><div class="flex justify-between"><h2 class="text-lg font-bold">数据删除申请</h2><button data-ui-action="close-top-modal" aria-label="关闭">✕</button></div><div class="mt-4 rounded-xl bg-amber-50 border border-amber-200 p-4 text-sm text-amber-900">公开体验版没有真实云端账号数据，因此不会生成虚假的删除工单。连接正式后端后，可申请删除某个孩子或整个账号数据。</div><button data-ui-action="close-top-modal" class="w-full mt-4 py-3 rounded-xl bg-primary text-white">知道了</button></div>';document.body.appendChild(modal);return;}
      modal.innerHTML='<div class="modal-content max-w-xl p-5"><div class="flex justify-between"><h2 class="text-lg font-bold">数据删除申请</h2><button data-ui-action="close-top-modal" aria-label="关闭">✕</button></div><div class="py-10 text-center text-text-muted">正在读取申请记录…</div></div>';document.body.appendChild(modal);
      try{const result=await apiRequest('/sensitive/deletion-requests/mine','GET');if(!result.success)throw new Error(result.error||'读取失败');renderDataDeletionCenter(modal,result.requests||[])}catch(error){modal.firstElementChild.innerHTML=`<div class="p-5 text-center text-text-muted">${escapeText(error.message||'读取失败')}</div><button data-ui-action="close-top-modal" class="w-full py-3 bg-primary text-white">关闭</button>`}
    }
    function renderDataDeletionCenter(modal,requests){
      const cards=requests.length?requests.map(item=>`<div class="p-3 rounded-xl bg-background text-sm"><div class="flex justify-between gap-2"><strong>${item.scope==='account'?'整个账号':'儿童档案 #'+Number(item.child_id)}</strong><span class="text-primary">${escapeText(deletionStatusLabel(item.status))}</span></div><div class="text-xs text-text-muted mt-1">工单：${escapeText(item.id)} · 申请于 ${formatDate(item.created_at)}</div><div class="text-xs text-text-muted mt-1">目标处理日期：${formatDate(item.due_at)}</div>${item.resolution_note?`<div class="mt-2">处理说明：${escapeText(item.resolution_note)}</div>`:''}${item.status==='pending'?`<button data-ui-call="cancelDataDeletionRequest" data-ui-args='["${escapeText(item.id)}"]' class="mt-2 px-3 py-1.5 rounded-lg border border-border">撤销申请</button>`:''}</div>`).join(''):'<div class="py-6 text-center text-text-muted">暂无删除申请</div>';
      modal.firstElementChild.innerHTML=`<div class="flex justify-between gap-3"><div><h2 class="text-lg font-bold">数据删除申请</h2><p class="text-xs text-text-muted mt-1">处理前可撤销；申请创建后现有分享会立即撤销</p></div><button data-ui-action="close-top-modal" aria-label="关闭">✕</button></div><div class="mt-4 space-y-3 max-h-[48vh] overflow-y-auto">${cards}</div><button data-ui-call="showDataDeletionRequestForm" class="w-full mt-4 py-3 rounded-xl bg-red-700 text-white font-bold">新建删除申请</button>`;
    }
    function showDataDeletionRequestForm(){
      const options=MOCK_DATA.children.map(child=>`<option value="${Number(child.id)}">${escapeText(child.name||child.nickname||'未命名儿童')}</option>`).join('');
      const modal=document.createElement('div');modal.className='fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-[80] p-0 sm:p-4';modal.dataset.modal='true';modal.innerHTML=`<div class="modal-content max-w-lg p-5"><div class="flex justify-between"><h2 class="text-lg font-bold">新建删除申请</h2><button data-ui-action="close-top-modal" aria-label="关闭">✕</button></div><div class="mt-4 rounded-xl bg-red-50 border border-red-200 p-3 text-sm text-red-900"><strong>删除完成后不能恢复。</strong>账号级删除会移除账号及其儿童、记录和业务数据；为防止继续扩散，提交申请后现有分享会立即撤销。</div><label class="block mt-4 text-sm font-medium">删除范围<select id="deletion-scope" data-ui-change="deletion" class="mt-1 w-full p-3 rounded-xl border border-border bg-white"><option value="child">某个儿童及关联数据</option><option value="account">整个账号及全部数据</option></select></label><label id="deletion-child-field" class="block mt-3 text-sm font-medium">选择儿童<select id="deletion-child" class="mt-1 w-full p-3 rounded-xl border border-border bg-white">${options}</select></label><label class="block mt-3 text-sm font-medium">原因（可选）<textarea id="deletion-reason" maxlength="500" rows="2" class="mt-1 w-full p-3 rounded-xl border border-border" placeholder="帮助处理人员确认范围，不要重复填写隐私详情"></textarea></label><label class="block mt-3 text-sm font-medium">输入 DELETE 确认<input id="deletion-confirmation" autocomplete="off" class="mt-1 w-full p-3 rounded-xl border border-red-300"></label><input id="deletion-request-id" type="hidden" value="${newClientRequestId()}"><p id="deletion-save-status" class="mt-3 text-xs text-text-muted" role="status">尚未提交。工单与现有分享撤销会一起成功或一起回滚。</p><button id="deletion-save-button" data-ui-call="submitDataDeletionRequest" class="w-full mt-4 py-3 rounded-xl bg-red-700 text-white font-bold disabled:opacity-60">提交删除申请</button></div>`;document.body.appendChild(modal);
    }
    function toggleDeletionChildField(scope){document.getElementById('deletion-child-field')?.classList.toggle('hidden',scope==='account')}
    let deletionRequestInFlight=false;
    async function submitDataDeletionRequest(){
      if(deletionRequestInFlight)return;const scope=document.getElementById('deletion-scope')?.value;const confirmation=document.getElementById('deletion-confirmation')?.value.trim();const reason=document.getElementById('deletion-reason')?.value.trim()||'';const childId=Number(document.getElementById('deletion-child')?.value);const client_request_id=document.getElementById('deletion-request-id')?.value;const status=document.getElementById('deletion-save-status'),button=document.getElementById('deletion-save-button');
      if(confirmation!=='DELETE'){showToast('请输入大写 DELETE 确认');return} if(scope==='child'&&!childId){showToast('请选择要删除的儿童档案');return}
      if(navigator.onLine===false){status.textContent='未提交：当前网络已断开，联网后可直接重试。';showToast('当前网络已断开，删除申请尚未提交');return}deletionRequestInFlight=true;button.disabled=true;button.textContent='正在提交并撤销分享…';status.textContent='正在原子创建工单并撤销现有分享，请勿重复点击。';try{const result=await apiRequest('/sensitive/deletion-requests','POST',{scope,child_id:scope==='child'?childId:null,reason,confirmation,client_request_id});if(!result.success)throw new Error(result.error||'提交失败');closeTopModal();closeTopModal();showToast(result.replayed?'删除申请此前已提交，未重复创建':'删除申请已提交，现有分享已撤销');showDataDeletionCenter()}catch(error){status.textContent=`未提交：${error.message||'网络连接中断'}。申请与撤销没有被确认为完成，可重试。`;showToast(error.message||'删除申请尚未提交')}finally{deletionRequestInFlight=false;const current=document.getElementById('deletion-save-button');if(current){current.disabled=false;current.textContent='提交删除申请'}}
    }
    async function cancelDataDeletionRequest(id){try{const result=await apiRequest(`/sensitive/deletion-requests/${encodeURIComponent(id)}`,'DELETE');if(!result.success)throw new Error(result.error||'撤销失败');closeTopModal();showToast('删除申请已撤销');showDataDeletionCenter()}catch(error){showToast(error.message||'撤销失败')}}

    async function showSecurityOperations(view='active',page=1){
      if(currentUser?.role!=='admin'){showToast('当前账号无权访问安全运营台');return}
      view=view==='history'?'history':'active';page=Math.max(1,Number(page)||1);const limit=8;
      document.querySelector('[data-admin-ops="true"]')?.remove();
      const modal=document.createElement('div');modal.className='fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-[80] p-0 sm:p-4';modal.dataset.modal='true';modal.dataset.adminOps='true';modal.innerHTML='<div class="modal-content max-w-3xl p-5 max-h-[94vh] overflow-y-auto"><div class="flex justify-between"><div><h2 class="text-lg font-bold">安全运营台</h2><p class="text-xs text-text-muted mt-1">仅显示最小工单标识与聚合证据，不展示儿童内容</p></div><button data-ui-action="close-top-modal" aria-label="关闭">✕</button></div><div class="py-10 text-center text-text-muted">正在读取安全队列…</div></div>';document.body.appendChild(modal);
      try{
        const query=`view=${view}&page=${page}&limit=${limit}`;
        const [deletions,alerts,weeklyJobs,communityCases,professionalProfiles,credentials]=await Promise.all([apiRequest(`/sensitive/admin/deletion-requests?${query}`,'GET'),apiRequest(`/sensitive/admin/security-alerts?${query}`,'GET'),apiRequest(`/report/admin/jobs?${query}`,'GET'),apiRequest(`/community/moderation/reports?${query}`,'GET'),apiRequest(`/therapist/admin/profiles?page=${page}&limit=${limit}`,'GET'),apiRequest(`/therapist/admin/credentials?${query}`,'GET')]);
        if(!deletions.success||!alerts.success||!weeklyJobs.success||!communityCases.success||!professionalProfiles.success||!credentials.success)throw new Error('运营队列读取失败');
        renderSecurityOperations(modal,deletions.requests||[],alerts.alerts||[],weeklyJobs.jobs||[],communityCases.reports||[],professionalProfiles.profiles||[],credentials.credentials||[],{view,page,limit,totals:{deletions:Number(deletions.total||0),alerts:Number(alerts.total||0),weekly:Number(weeklyJobs.total||0),community:Number(communityCases.total||0),profiles:Number(professionalProfiles.total||0),credentials:Number(credentials.total||0)}});
      }catch(error){modal.firstElementChild.innerHTML=`<div class="p-6 text-center text-text-muted">${escapeText(error.message||'读取失败')}</div><button data-ui-action="close-top-modal" class="w-full py-3 bg-primary text-white">关闭</button>`}
    }
    function renderSecurityOperations(modal,deletions,alerts,weeklyJobs,communityCases,professionalProfiles,credentials,meta){
      const history=meta.view==='history';const emptyLabel=history?'这一页没有处理历史':'没有待处理项目';
      const deletionCards=deletions.length?deletions.map(item=>`<div class="p-3 rounded-xl bg-background text-sm"><div class="flex justify-between gap-2"><strong>${item.scope==='account'?'账号级':'儿童级'}删除 · 用户 #${Number(item.requester_user_id)}</strong><span>${escapeText(deletionStatusLabel(item.status))}</span></div><div class="text-xs text-text-muted mt-1">${escapeText(item.id)} · ${history?'处理于 '+formatDate(item.processed_at||item.updated_at):'截止 '+formatDate(item.due_at)}</div>${item.resolution_note?`<div class="mt-2 text-xs">处理说明：${escapeText(item.resolution_note)}</div>`:''}${history?'':`<div class="flex flex-wrap gap-2 mt-2">${item.status==='pending'?`<button data-ui-call="showAdminResolution" data-ui-args="${uiArgsAttr('deletion',item.id,'processing')}" class="px-3 py-1.5 rounded-lg bg-primary text-white">开始处理</button>`:`<button data-ui-call="showAdminResolution" data-ui-args="${uiArgsAttr('deletion',item.id,'completed')}" class="px-3 py-1.5 rounded-lg bg-success text-white">确认完成删除</button>`}<button data-ui-call="showAdminResolution" data-ui-args="${uiArgsAttr('deletion',item.id,'rejected')}" class="px-3 py-1.5 rounded-lg border border-border">拒绝并说明</button></div>`}</div>`).join(''):`<div class="py-5 text-center text-text-muted">${emptyLabel}</div>`;
      const alertCards=alerts.length?alerts.map(item=>`<div class="p-3 rounded-xl bg-background text-sm"><div class="flex justify-between gap-2"><strong>${escapeText(item.summary)}</strong><span class="${item.severity==='critical'?'text-red-700':'text-amber-700'}">${escapeText(item.severity)} · ${Number(item.occurrence_count)}次</span></div><div class="text-xs text-text-muted mt-1">${escapeText(item.rule)} · ${escapeText(item.status)} · 最后 ${formatDate(item.last_seen_at)}</div>${item.resolution_note?`<div class="mt-2 text-xs">处理说明：${escapeText(item.resolution_note)}</div>`:''}${history?'':`<div class="flex gap-2 mt-2">${item.status==='open'?`<button data-ui-call="showAdminResolution" data-ui-args="${uiArgsAttr('alert',item.id,'acknowledged')}" class="px-3 py-1.5 rounded-lg bg-primary text-white">确认接手</button>`:''}<button data-ui-call="showAdminResolution" data-ui-args="${uiArgsAttr('alert',item.id,'resolved')}" class="px-3 py-1.5 rounded-lg border border-border">标记解决</button></div>`}</div>`).join(''):`<div class="py-5 text-center text-text-muted">${emptyLabel}</div>`;
      const weeklyCards=weeklyJobs.length?weeklyJobs.map(item=>`<div class="p-3 rounded-xl bg-background text-sm"><div class="flex justify-between gap-2"><strong>儿童 #${Number(item.child_id)} · ${escapeText(String(item.week_start).slice(0,10))}</strong><span class="${item.status==='failed'?'text-red-700':'text-success'}">${escapeText(item.status)} · ${Number(item.attempt_count)}次</span></div><div class="text-xs text-text-muted mt-1">通知：${escapeText(item.notification_status)} · ${escapeText(item.last_error||'没有错误')}</div>${!history&&item.status==='failed'?`<button data-ui-call="retryWeeklyReportJob" data-ui-args="[${Number(Number(item.id))}]" class="mt-2 px-3 py-1.5 rounded-lg border border-border">重新排队</button>`:''}</div>`).join(''):`<div class="py-5 text-center text-text-muted">${emptyLabel}</div>`;
      const communityCards=communityCases.length?communityCases.map(item=>`<div class="p-3 rounded-xl bg-background text-sm"><div class="flex justify-between gap-2"><strong>${item.risk_level==='urgent'?'紧急优先':'普通审核'} · ${escapeText(item.reason)}</strong><span>${escapeText(item.status)}</span></div><div class="text-xs text-text-muted mt-1">工单 ${escapeText(item.case_ref)} · ${formatDate(item.created_at)}</div><div class="text-xs mt-1">${escapeText(item.details||'未填写补充说明')}</div>${item.resolution_note?`<div class="mt-2 text-xs">处理说明：${escapeText(item.resolution_note)}</div>`:''}${history?'':`<div class="flex gap-2 mt-2">${item.status==='open'?`<button data-ui-call="showAdminResolution" data-ui-args="${uiArgsAttr('community',item.case_ref,'reviewing')}" class="px-3 py-1.5 rounded-lg bg-primary text-white">开始审核</button>`:''}<button data-ui-call="showAdminResolution" data-ui-args="${uiArgsAttr('community',item.case_ref,'resolved')}" class="px-3 py-1.5 rounded-lg border border-success text-success">标记解决</button><button data-ui-call="showAdminResolution" data-ui-args="${uiArgsAttr('community',item.case_ref,'dismissed')}" class="px-3 py-1.5 rounded-lg border border-border">不成立</button></div>`}</div>`).join(''):`<div class="py-5 text-center text-text-muted">${emptyLabel}</div>`;
      const profileCards=professionalProfiles.length?professionalProfiles.map(item=>`<div class="p-3 rounded-xl bg-background text-sm"><div class="flex justify-between gap-2"><strong>${escapeText(item.name)}</strong><span class="${item.is_certified?'text-success':'text-amber-700'}">${item.is_certified?'双人复核有效':'尚未双人通过'}</span></div><div class="text-xs text-text-secondary mt-1">${escapeText(item.professional_title||'未填写职称')} · ${escapeText(item.specialty||'未填写服务范围')}</div><div class="text-xs text-text-muted mt-1">账号 #${Number(item.user_id)} · ${escapeText(item.phone||'无手机号')} ${item.email?'· '+escapeText(item.email):''}</div>${history?'':`<button data-ui-call="showCredentialEvidenceForm" data-ui-args="${uiArgsAttr(Number(item.id),item.name)}" class="mt-2 px-3 py-1.5 rounded-lg border border-primary text-primary font-medium">提交新证据</button>`}</div>`).join(''):'<div class="py-5 text-center text-text-muted">没有专业资质档案</div>';
      const credentialLabels={pending:'等待第一人复核',first_approved:'等待第二人复核',approved:'双人复核通过',rejected:'已拒绝',expired:'已过期'};
      const credentialCards=credentials.length?credentials.map(item=>{const ownSubmission=Number(item.submitted_by_user_id)===Number(currentUser?.id);const alreadyReviewed=Number(item.first_reviewer_user_id)===Number(currentUser?.id);const canReview=!history&&!ownSubmission&&!alreadyReviewed;return `<div class="p-3 rounded-xl border ${item.status==='approved'?'border-success/40 bg-success/5':item.status==='rejected'||item.status==='expired'?'border-red-200 bg-red-50':'border-amber-200 bg-amber-50'} text-sm"><div class="flex justify-between gap-2"><strong>${escapeText(item.therapist_name)}</strong><span>${escapeText(credentialLabels[item.status]||item.status)}</span></div><div class="text-xs text-text-secondary mt-1">${escapeText(item.issuing_authority)} · 有效至 ${formatDate(item.expires_on)}</div><div class="text-xs text-text-muted mt-1">${escapeText(item.evidence_filename)} · 摘要 ${escapeText(String(item.evidence_sha256||'').slice(0,12))}…</div>${item.review_note?`<div class="text-xs mt-2">复核说明：${escapeText(item.review_note)}</div>`:''}<div class="flex flex-wrap gap-2 mt-2"><button data-ui-call="downloadCredentialEvidence" data-ui-args="${uiArgsAttr(item.id)}" class="px-3 py-1.5 rounded-lg border border-border bg-white">下载证据</button>${canReview?`<button data-ui-call="showCredentialReview" data-ui-args="${uiArgsAttr(item.id,'approve')}" class="px-3 py-1.5 rounded-lg bg-primary text-white">${item.status==='pending'?'第一人通过':'第二人通过'}</button><button data-ui-call="showCredentialReview" data-ui-args="${uiArgsAttr(item.id,'reject')}" class="px-3 py-1.5 rounded-lg border border-red-300 text-red-700 bg-white">拒绝</button>`:`${!history?`<span class="text-xs text-text-muted self-center">${ownSubmission?'提交人不能复核':alreadyReviewed?'需另一名管理员复核':'不可复核'}</span>`:''}`}</div></div>`}).join(''):`<div class="py-5 text-center text-text-muted">${history?'没有资质复核历史':'没有待复核资质'}</div>`;
      const hasNext=Object.values(meta.totals).some(total=>total>meta.page*meta.limit);
      modal.firstElementChild.innerHTML=`<div class="flex justify-between gap-3"><div><h2 class="text-lg font-bold">安全与服务运营台</h2><p class="text-xs text-text-muted mt-1">操作均记录管理员账号、时间和说明；敏感标识按最小范围展示</p></div><button data-ui-action="close-top-modal" aria-label="关闭">✕</button></div><div class="mt-4 grid grid-cols-2 rounded-xl bg-background p-1"><button data-ui-call="showSecurityOperations" data-ui-args='["active",1]' class="py-2 rounded-lg text-sm font-bold ${history?'text-text-secondary':'bg-white text-primary shadow-sm'}">待处理</button><button data-ui-call="showSecurityOperations" data-ui-args='["history",1]' class="py-2 rounded-lg text-sm font-bold ${history?'bg-white text-primary shadow-sm':'text-text-secondary'}">处理历史</button></div>${history?'':`<div class="mt-3 flex flex-wrap gap-2"><button data-ui-call="runSecurityAlertScan" class="px-4 py-2 rounded-xl border border-border bg-white text-sm font-medium">扫描安全告警</button><button data-ui-call="runWeeklyReportJobs" class="px-4 py-2 rounded-xl border border-border bg-white text-sm font-medium">执行周报任务</button></div>`}<section class="mt-5"><h3 class="font-bold">资质复核（共${meta.totals.credentials}）</h3><p class="text-xs text-text-muted mt-1">证据加密保存；提交人与两名复核人必须互不相同</p><div class="mt-2 space-y-2">${credentialCards}</div></section><section class="mt-5"><h3 class="font-bold">专业人员档案（共${meta.totals.profiles}）</h3><p class="text-xs text-text-muted mt-1">联系方式已脱敏；只有有效证据完成双人复核才进入家长目录</p><div class="mt-2 space-y-2">${profileCards}</div></section><section class="mt-5"><h3 class="font-bold">社区审核工单（共${meta.totals.community}）</h3><div class="mt-2 space-y-2">${communityCards}</div></section><section class="mt-5"><h3 class="font-bold">数据删除工单（共${meta.totals.deletions}）</h3><div class="mt-2 space-y-2">${deletionCards}</div></section><section class="mt-5"><h3 class="font-bold">安全告警（共${meta.totals.alerts}）</h3><div class="mt-2 space-y-2">${alertCards}</div></section><section class="mt-5"><h3 class="font-bold">周报任务（共${meta.totals.weekly}）</h3><div class="mt-2 space-y-2">${weeklyCards}</div></section><div class="sticky bottom-0 mt-5 flex items-center justify-between bg-white py-3 border-t border-border"><button data-ui-call="showSecurityOperations" data-ui-args='["${meta.view}",${meta.page-1}]' class="px-4 py-2 rounded-xl border border-border ${meta.page<=1?'invisible':''}">上一页</button><span class="text-sm text-text-muted">第 ${meta.page} 页</span><button data-ui-call="showSecurityOperations" data-ui-args='["${meta.view}",${meta.page+1}]' class="px-4 py-2 rounded-xl border border-border ${hasNext?'':'invisible'}">下一页</button></div>`;
    }
    function showCredentialEvidenceForm(therapistId,name){const modal=document.createElement('div');modal.className='fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-[90] p-0 sm:p-4';modal.dataset.modal='true';modal.innerHTML=`<div class="modal-content max-w-lg p-5"><div class="flex justify-between gap-3"><div><h2 class="text-lg font-bold">提交资质证据</h2><p class="text-xs text-text-muted mt-1">${escapeText(name)} · 文件将加密保存</p></div><button data-ui-action="close-top-modal" aria-label="关闭">✕</button></div><div class="mt-4 space-y-3"><label class="block text-sm font-medium">资质类型<select id="credential-type" class="mt-1 w-full p-3 rounded-xl border border-border bg-white"><option value="license">执业证照</option><option value="certificate">专业证书</option><option value="employment">机构任职证明</option><option value="identity">身份核验材料</option><option value="other">其他</option></select></label><label class="block text-sm font-medium">签发机构<input id="credential-authority" maxlength="200" class="mt-1 w-full p-3 rounded-xl border border-border"></label><div class="grid grid-cols-2 gap-3"><label class="text-sm font-medium">签发日期<input id="credential-issued" type="date" class="mt-1 w-full p-3 rounded-xl border border-border"></label><label class="text-sm font-medium">有效期至<input id="credential-expires" type="date" class="mt-1 w-full p-3 rounded-xl border border-border"></label></div><label class="block text-sm font-medium">编号末4位（可选）<input id="credential-last4" maxlength="4" pattern="[A-Za-z0-9]{4}" class="mt-1 w-full p-3 rounded-xl border border-border" placeholder="不要录入完整证件号"></label><label class="block text-sm font-medium">证据文件<input id="credential-file" type="file" accept="application/pdf,image/jpeg,image/png" class="mt-1 block w-full text-sm"></label><p class="text-xs text-text-muted">仅PDF、JPG或PNG，最大2MB。提交人不能参与后续两次复核。</p></div><button data-ui-call="submitCredentialEvidence" data-ui-args="[${Number(therapistId)}]" class="w-full mt-4 py-3 rounded-xl bg-primary text-white font-bold">加密保存并进入复核</button></div>`;document.body.appendChild(modal)}
    async function submitCredentialEvidence(therapistId){const file=document.getElementById('credential-file')?.files?.[0];const authority=document.getElementById('credential-authority')?.value.trim()||'';const expires=document.getElementById('credential-expires')?.value||'';if(!file||!authority||!expires){showToast('请填写签发机构、有效期并选择证据文件');return}if(file.size>2*1024*1024){showToast('证据文件不能超过2MB');return}const form=new FormData();form.append('credential_type',document.getElementById('credential-type')?.value||'other');form.append('issuing_authority',authority);form.append('issued_on',document.getElementById('credential-issued')?.value||'');form.append('expires_on',expires);form.append('reference_last4',document.getElementById('credential-last4')?.value.trim()||'');form.append('evidence',file);try{const headers={};if(getToken())headers.Authorization=`Bearer ${getToken()}`;const csrf=getCookie('xingban_csrf');if(csrf)headers['X-CSRF-Token']=csrf;const response=await fetch(`${API_BASE}/therapist/admin/profiles/${encodeURIComponent(therapistId)}/credentials`,{method:'POST',credentials:'include',headers,body:form});const result=await response.json();if(!response.ok)throw new Error(result.error||'提交失败');closeTopModal();closeTopModal();showToast('证据已加密保存，等待两名其他管理员复核');showSecurityOperations('active',1)}catch(error){showToast(error.message||'提交失败')}}
    function showCredentialReview(id,decision){const modal=document.createElement('div');modal.className='fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-[95] p-0 sm:p-4';modal.dataset.modal='true';modal.innerHTML=`<div class="modal-content max-w-lg p-5"><div class="flex justify-between"><h2 class="text-lg font-bold">${decision==='approve'?'确认本次复核通过':'拒绝资质证据'}</h2><button data-ui-action="close-top-modal" aria-label="关闭">✕</button></div><p class="mt-3 text-sm text-text-secondary">请先下载并核对原文件、签发机构、姓名和有效期。系统会记录你的账号和时间。</p><label class="block mt-4 text-sm font-medium">复核依据<textarea id="credential-review-note" maxlength="1000" rows="3" class="mt-1 w-full p-3 rounded-xl border border-border" placeholder="至少5个字，不复制不必要的证件内容"></textarea></label><button data-ui-call="submitCredentialReview" data-ui-args="${uiArgsAttr(id,decision)}" class="w-full mt-4 py-3 rounded-xl ${decision==='approve'?'bg-primary':'bg-red-700'} text-white font-bold">确认${decision==='approve'?'通过':'拒绝'}</button></div>`;document.body.appendChild(modal)}
    async function submitCredentialReview(id,decision){const note=document.getElementById('credential-review-note')?.value.trim()||'';if(note.length<5){showToast('请填写至少5字复核依据');return}try{const result=await apiRequest(`/therapist/admin/credentials/${encodeURIComponent(id)}/review`,'POST',{decision,note});if(!result.success)throw new Error(result.error||'复核失败');closeTopModal();closeTopModal();showToast(result.status==='approved'?'第二人复核完成，资质已生效':result.status==='first_approved'?'第一人复核完成，等待另一名管理员':'资质证据已拒绝');showSecurityOperations(result.status==='rejected'?'history':'active',1)}catch(error){showToast(error.message||'复核失败')}}
    async function downloadCredentialEvidence(id){try{const headers={};if(getToken())headers.Authorization=`Bearer ${getToken()}`;const response=await fetch(`${API_BASE}/therapist/admin/credentials/${encodeURIComponent(id)}/evidence`,{credentials:'include',headers});if(!response.ok){const error=await response.json().catch(()=>({}));throw new Error(error.error||'下载失败')}const blob=await response.blob();const url=URL.createObjectURL(blob);const anchor=document.createElement('a');anchor.href=url;anchor.download='credential-evidence';document.body.appendChild(anchor);anchor.click();anchor.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);showToast('证据文件已下载，请在受控设备中核对')}catch(error){showToast(error.message||'下载失败')}}
    async function runSecurityAlertScan(){try{const result=await apiRequest('/sensitive/admin/security-alerts/scan','POST',{window_minutes:15});if(!result.success)throw new Error(result.error||'扫描失败');closeTopModal();showToast(`扫描完成，命中${Number(result.matched_rules||0)}条规则`);showSecurityOperations()}catch(error){showToast(error.message||'扫描失败')}}
    async function runWeeklyReportJobs(){try{const result=await apiRequest('/report/admin/jobs/run','POST',{});if(!result.success)throw new Error(result.error||'执行失败');closeTopModal();showToast(`周报任务完成：尝试${Number(result.attempted||0)}，成功${Number(result.succeeded||0)}`);showSecurityOperations()}catch(error){showToast(error.message||'执行失败')}}
    async function retryWeeklyReportJob(id){try{const result=await apiRequest(`/report/admin/jobs/${encodeURIComponent(id)}/retry`,'PATCH',{});if(!result.success)throw new Error(result.error||'重试失败');closeTopModal();showToast('周报任务已重新排队');showSecurityOperations()}catch(error){showToast(error.message||'重试失败')}}
    function showAdminResolution(kind,id,status){const labels={processing:'开始处理',completed:'确认完成删除',rejected:'拒绝申请',acknowledged:'确认接手',reviewing:'开始审核',resolved:'标记解决',dismissed:'判定不成立'};const modal=document.createElement('div');modal.className='fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-[90] p-0 sm:p-4';modal.dataset.modal='true';modal.innerHTML=`<div class="modal-content max-w-lg p-5"><div class="flex justify-between"><h2 class="text-lg font-bold">${escapeText(labels[status]||'处理')}</h2><button data-ui-action="close-top-modal" aria-label="关闭">✕</button></div><label class="block mt-4 text-sm font-medium">核查或处理说明<textarea id="admin-resolution-note" maxlength="1000" rows="3" class="mt-1 w-full p-3 rounded-xl border border-border" placeholder="至少5个字，不粘贴不必要的儿童隐私"></textarea></label><button data-ui-call="submitAdminResolution" data-ui-args="${uiArgsAttr(kind,id,status)}" class="w-full mt-4 py-3 rounded-xl bg-primary text-white font-bold">确认提交</button></div>`;document.body.appendChild(modal)}
    async function submitAdminResolution(kind,id,status){const note=document.getElementById('admin-resolution-note')?.value.trim()||'';if(note.length<5){showToast('请填写至少5字处理说明');return}const path=kind==='alert'?`/sensitive/admin/security-alerts/${encodeURIComponent(id)}`:kind==='community'?`/community/moderation/reports/${encodeURIComponent(id)}`:`/sensitive/admin/deletion-requests/${encodeURIComponent(id)}`;try{const result=await apiRequest(path,'PATCH',{status,resolution_note:note});if(!result.success)throw new Error(result.error||'处理失败');closeTopModal();closeTopModal();showToast('处理状态已更新并记录管理员账号');showSecurityOperations()}catch(error){showToast(error.message||'处理失败')}}

    function showEditProfile() {
      const modal = document.createElement('div');
      modal.className = 'fixed inset-0 bg-black/50 flex items-end justify-center z-50';
      modal.innerHTML = `
        <div class="bg-white w-full max-w-md rounded-t-3xl p-6 modal-slide safe-area-bottom">
          <div class="flex justify-between items-center mb-4">
            <h2 class="text-lg font-bold">修改个人信息</h2>
            <button data-ui-action="remove-overlay" class="text-text-muted">✕</button>
          </div>
          <div class="space-y-4">
            <div>
              <label class="block text-sm text-text-secondary mb-1">昵称</label>
              <input type="text" id="edit-nickname" value="${escapeText(currentUser?.name || '')}" maxlength="40" class="w-full px-4 py-2.5 rounded-xl border border-border">
            </div>
            <div>
              <label class="block text-sm text-text-secondary mb-1">手机号</label>
              <input type="tel" id="edit-phone" value="${escapeText(currentUser?.phone || '')}" class="w-full px-4 py-2.5 rounded-xl border border-border bg-gray-50" readonly>
              <p class="text-xs text-text-muted mt-1">手机号不可修改</p>
            </div>
            <button data-ui-call="saveProfile" class="w-full py-3 rounded-xl bg-primary text-white font-medium">保存</button>
          </div>
        </div>
      `;
      document.body.appendChild(modal);
    }

    async function saveProfile() {
      const nickname = document.getElementById('edit-nickname').value.trim();
      if (!nickname || nickname.length > 40) {
        showToast('请输入1至40字昵称');
        return;
      }
      currentUser = { ...currentUser, name: nickname, nickname: nickname };
      saveUser(currentUser);
      showToast('个人信息已更新');
      closeTopModal();
    }

    function showChangePassword() {
      const modal = document.createElement('div');
      modal.className = 'fixed inset-0 bg-black/50 flex items-end justify-center z-50';
      modal.innerHTML = `
        <div class="bg-white w-full max-w-md rounded-t-3xl p-6 modal-slide safe-area-bottom">
          <div class="flex justify-between items-center mb-4">
            <h2 class="text-lg font-bold">修改密码</h2>
            <button data-ui-action="remove-overlay" class="text-text-muted">✕</button>
          </div>
          <div class="space-y-4">
            <div>
              <label class="block text-sm text-text-secondary mb-1">当前密码</label>
              <input type="password" id="old-password" autocomplete="current-password" placeholder="请输入当前密码" class="w-full px-4 py-2.5 rounded-xl border border-border">
            </div>
            <div>
              <label class="block text-sm text-text-secondary mb-1">新密码</label>
              <input type="password" id="new-password" autocomplete="new-password" placeholder="请输入新密码" class="w-full px-4 py-2.5 rounded-xl border border-border">
            </div>
            <div>
              <label class="block text-sm text-text-secondary mb-1">确认新密码</label>
              <input type="password" id="confirm-password" autocomplete="new-password" placeholder="请再次输入新密码" class="w-full px-4 py-2.5 rounded-xl border border-border">
            </div>
            <button data-ui-call="changePassword" class="w-full py-3 rounded-xl bg-primary text-white font-medium">确认修改</button>
          </div>
        </div>
      `;
      document.body.appendChild(modal);
    }

    async function changePassword() {
      const oldPw = document.getElementById('old-password').value;
      const newPw = document.getElementById('new-password').value;
      const confirmPw = document.getElementById('confirm-password').value;
      if (!oldPw || !newPw || !confirmPw) { showToast('请填写完整'); return; }
      if (newPw !== confirmPw) { showToast('两次密码不一致'); return; }
      if (newPw.length < 6) { showToast('密码至少6位'); return; }
      try {
        const result = await apiRequest('/auth/reset-password', 'POST', { oldPassword: oldPw, newPassword: newPw });
        if (result.success) { showToast('密码修改成功'); closeTopModal(); }
        else { showToast(result.error || '修改失败'); }
      } catch (e) { showToast('网络错误'); }
    }

    function readLocalJson(key, fallback = null) { try { const value=localStorage.getItem(key); return value ? JSON.parse(value) : fallback; } catch (_) { return fallback; } }

    function exportData() {
      const modal = document.createElement('div');
      modal.className = 'fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4';
      modal.innerHTML = `<div class="bg-white w-full max-w-sm rounded-2xl p-6"><h3 class="text-lg font-bold">导出前确认</h3><p class="text-sm text-text-secondary leading-6 mt-2">文件是未加密的 JSON，可能包含儿童昵称、观察记录、安全计划、家庭状态和账号资料。只保存到受控设备，不要通过公共群聊或不明网盘传输。</p><label class="flex items-start gap-2 mt-4 text-sm"><input id="export-risk-confirm" type="checkbox" class="mt-1"><span>我了解这是明文体验数据，并会自行保护导出文件</span></label><div class="flex gap-2 mt-4"><button data-ui-action="close-top-modal" class="flex-1 py-2.5 border border-border rounded-xl">取消</button><button data-ui-call="confirmExportFromModal" class="flex-1 py-2.5 bg-primary text-white rounded-xl">确认导出</button></div></div>`;
      document.body.appendChild(modal);
    }

    function confirmExportFromModal() {
      if (!document.getElementById('export-risk-confirm')?.checked) { showToast('请先确认明文文件风险'); return; }
      closeTopModal();
      confirmExportData();
    }
    function confirmExportData() {
      const data = {
        user: currentUser,
        behaviors: MOCK_DATA.behaviors,
        children: MOCK_DATA.children,
        strategies: MOCK_DATA.strategies,
        safetyPlan: readLocalJson('xingban_safety_plan'),
        wanderingPlan: readLocalJson('xingban_wandering_plan'),
        mentalHealthProfile: readLocalJson('xingban_mental_health_profile'),
        emergencySessions: readLocalJson('xingban_emergency_sessions', []),
        familySupport: ['caregiver','grandparent','sibling','cbt'].reduce((all,key)=>{all[key]=readLocalJson(`xingban_family_${key}`);return all;},{}),
        settings: settingsState,
        schemaVersion: '4.0.0',
        exportDate: new Date().toISOString()
      };
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `星伴数据导出_${new Date().toLocaleDateString('zh-CN')}.json`;
      a.click();
      URL.revokeObjectURL(url);
      showToast('明文体验数据已导出，请妥善保管');
    }

    function showPrivacyPolicy() {
      const modal = document.createElement('div');
      modal.className = 'fixed inset-0 bg-black/50 flex items-end justify-center z-50';
      modal.innerHTML = `
        <div class="bg-white w-full max-w-md rounded-t-3xl p-6 modal-slide safe-area-bottom max-h-[80vh] overflow-y-auto">
          <div class="flex justify-between items-center mb-4">
            <h2 class="text-lg font-bold">隐私政策</h2>
            <button data-ui-action="remove-overlay" class="text-text-muted">✕</button>
          </div>
          <div class="space-y-4 text-sm text-text-secondary leading-relaxed">
            <p><strong class="text-text-primary">数据收集：</strong>星伴仅收集您主动提供的孩子信息、行为记录等必要数据，用于提供个性化服务。</p>
            <p><strong class="text-text-primary">当前体验版存储：</strong>已登录且服务可用时，安全计划、照护档案和防走失预案由服务端加密保存；仅在 localhost、127.0.0.1 或本地文件演示时允许明文暂存本机浏览器。正式域名不会静默降级。体验版仍不是医疗病历系统，请勿填写身份证号、详细住址或完整处方照片等不必要信息。</p>
            <p><strong class="text-text-primary">登录安全：</strong>访问令牌仅保存在当前页面内存，刷新或关闭页面后需要重新登录；旧版浏览器中遗留的登录凭证会自动清理。</p>
            <p><strong class="text-text-primary">监护人责任：</strong>应由具备合法监护/授权关系的成年人使用，并以适龄方式告知孩子记录目的；涉及孩子隐私的分享应尽量征得孩子理解与同意。</p>
            <p><strong class="text-text-primary">数据共享：</strong>仅在您勾选具体范围、接收者和有效期并确认后分享。社区内容默认匿名，但匿名不等于无法识别，请勿发布真实姓名、学校、住址、联系方式、病历照片。</p>
            <p><strong class="text-text-primary">导出、撤销与删除：</strong>您可在设置中导出数据；专业协作分享应支持到期与撤销。删除本机数据后可能无法恢复，云端副本及审计留痕仍须依据正式服务政策处理。</p>
            <p><strong class="text-text-primary">保留期限：</strong>正式上线前须公布各类数据的保留期限、删除响应时间、未成年人保护负责人和投诉渠道；当前体验版尚不承诺医疗数据托管能力。</p>
          </div>
        </div>
      `;
      document.body.appendChild(modal);
    }

    function clearCache() {
      const modal = document.createElement('div');
      modal.className = 'fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4';
      modal.innerHTML = `
        <div class="bg-white w-full max-w-xs rounded-2xl p-6 animate-fade-in text-center">
          <h3 class="text-lg font-bold text-text-primary mb-2">清除缓存</h3>
          <p class="text-sm text-text-secondary mb-4">确定要清除所有本地缓存数据吗？登录状态不会受影响。</p>
          <div class="flex gap-3">
            <button data-ui-action="remove-overlay" class="flex-1 py-2.5 rounded-xl border border-border text-text-secondary">取消</button>
            <button data-ui-call="confirmClearCache" class="flex-1 py-2.5 rounded-xl bg-primary text-white">确认</button>
          </div>
        </div>
      `;
      document.body.appendChild(modal);
    }

    async function showAuthorizationCenter() {
      const modal = document.createElement('div');
      modal.className = 'modal-backdrop';
      modal.innerHTML = `<div class="modal-content max-w-xl"><div class="p-5 border-b border-border flex items-center justify-between"><div><h2 class="text-lg font-bold">授权与访问记录</h2><p class="text-xs text-text-muted mt-1">服务端记录，不展示分享密钥或敏感正文</p></div><button data-ui-action="close-top-modal" class="text-2xl text-text-muted" aria-label="关闭">×</button></div><div id="authorization-center-body" class="p-5 text-sm text-text-secondary"><p>正在读取安全记录…</p></div></div>`;
      document.body.appendChild(modal);
      const body = modal.querySelector('#authorization-center-body');
      try {
        const [sharesResult, auditResult] = await Promise.all([
          apiRequest('/sensitive/share/mine'),
          apiRequest('/sensitive/audit/mine')
        ]);
        body.textContent = '';
        const sharesTitle = document.createElement('h3');
        sharesTitle.className = 'font-bold text-text-primary mb-2';
        sharesTitle.textContent = '我的授权';
        body.appendChild(sharesTitle);
        const shares = sharesResult.shares || [];
        if (!shares.length) body.appendChild(Object.assign(document.createElement('p'), { textContent: '暂无服务端授权记录。' }));
        shares.forEach(share => {
          const row = document.createElement('div');
          row.className = 'border border-border rounded-xl p-3 mb-2';
          const info = document.createElement('p');
          info.textContent = `接收者 #${share.recipient_user_id} · 状态：${share.status} · 到期：${new Date(share.expires_at).toLocaleString('zh-CN')}`;
          row.appendChild(info);
          if (share.status === 'active') {
            const button = document.createElement('button');
            button.className = 'mt-2 px-3 py-1.5 rounded-lg bg-red-50 text-red-700';
            button.textContent = '立即撤销';
            button.onclick = async () => { await apiRequest(`/sensitive/share/${encodeURIComponent(share.id)}`, 'DELETE'); closeTopModal(); showToast('授权已撤销'); };
            row.appendChild(button);
          }
          body.appendChild(row);
        });
        const auditTitle = document.createElement('h3');
        auditTitle.className = 'font-bold text-text-primary mt-5 mb-2';
        auditTitle.textContent = '最近访问审计';
        body.appendChild(auditTitle);
        const logs = (auditResult.audit_logs || []).slice(0, 20);
        if (!logs.length) body.appendChild(Object.assign(document.createElement('p'), { textContent: '暂无服务端访问记录。' }));
        logs.forEach(log => {
          const row = document.createElement('p');
          row.className = 'py-2 border-b border-border last:border-0';
          row.textContent = `${new Date(log.created_at).toLocaleString('zh-CN')} · ${log.action} · ${log.outcome}`;
          body.appendChild(row);
        });
      } catch (_) {
        body.textContent = '尚未连接正式安全服务，无法读取授权与审计记录。';
      }
    }

    function confirmClearCache() {
      // 当前登录会话驻留内存，清缓存不会把令牌重新写回持久存储。
      localStorage.clear();
      closeTopModal();
      showToast('缓存已清除');
    }

    function showAbout() {
      const modal = document.createElement('div');
      modal.className = 'fixed inset-0 bg-black/50 flex items-end justify-center z-50';
      modal.innerHTML = `
        <div class="bg-white w-full max-w-md rounded-t-3xl p-6 modal-slide safe-area-bottom text-center">
          <div class="w-16 h-16 bg-gradient-to-br from-primary to-primary-light rounded-2xl flex items-center justify-center mx-auto mb-4">
            <svg class="w-8 h-8 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M12 2L2 7l10 5 10-5-10-5z"/>
              <path d="M2 17l10 5 10-5"/>
              <path d="M2 12l10 5 10-5"/>
            </svg>
          </div>
          <h2 class="text-xl font-bold text-text-primary mb-1">星伴</h2>
          <p class="text-sm text-text-muted mb-4">孤独症儿童成长陪伴平台</p>
          <p class="text-sm text-text-secondary leading-relaxed mb-4">
            星伴致力于为孤独症儿童家庭提供科学、温暖、专业的成长支持。
            通过行为记录、策略推荐、AI分析等功能，帮助家长更好地了解和陪伴孩子成长。
          </p>
          <p class="text-xs text-text-muted mb-6">版本 2.5.0 | 体验模式</p>
          <button data-ui-action="remove-overlay" class="w-full py-3 rounded-xl bg-primary text-white font-medium">知道了</button>
        </div>
      `;
      document.body.appendChild(modal);
    }

    function showFeedback() {
      const modal = document.createElement('div');
      modal.className = 'fixed inset-0 bg-black/50 flex items-end justify-center z-50';
      modal.innerHTML = `
        <div class="bg-white w-full max-w-md rounded-t-3xl p-6 modal-slide safe-area-bottom">
          <div class="flex justify-between items-center mb-4">
            <h2 class="text-lg font-bold">意见反馈</h2>
            <button data-ui-action="remove-overlay" class="text-text-muted">✕</button>
          </div>
          <div class="space-y-4">
            <div>
              <label class="block text-sm text-text-secondary mb-1">反馈类型</label>
              <select id="feedback-type" class="w-full px-4 py-2.5 rounded-xl border border-border">
                <option value="bug">Bug反馈</option>
                <option value="feature">功能建议</option>
                <option value="experience">使用体验</option>
                <option value="other">其他</option>
              </select>
            </div>
            <div>
              <label class="block text-sm text-text-secondary mb-1">详细描述</label>
              <textarea id="feedback-content" placeholder="请详细描述您的反馈..." class="w-full px-4 py-3 rounded-xl border border-border" rows="4"></textarea>
            </div>
            <button data-ui-call="submitFeedback" class="w-full py-3 rounded-xl bg-primary text-white font-medium">提交反馈</button>
          </div>
        </div>
      `;
      document.body.appendChild(modal);
    }

    async function submitFeedback() {
      const type = document.getElementById('feedback-type').value;
      const content = document.getElementById('feedback-content').value;
      if (!content) { showToast('请填写反馈内容'); return; }
      try {
        const result = await apiRequest('/feedback', 'POST', { type, content });
        if (result.success) { showToast('感谢您的反馈！'); closeTopModal(); }
        else { showToast(result.error || '提交失败'); }
      } catch (e) { showToast('网络错误'); }
    }

    // === 每日签到功能 ===
    function getTodayStr() {
      const d = new Date();
      return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    }

    function isCheckedInToday() {
      return appState.lastCheckIn === getTodayStr();
    }

    function checkIn() {
      if (isCheckedInToday()) {
        showToast('今天已经签到过了');
        return;
      }

      const today = getTodayStr();
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = yesterday.getFullYear() + '-' + String(yesterday.getMonth() + 1).padStart(2, '0') + '-' + String(yesterday.getDate()).padStart(2, '0');

      // 计算连续签到
      if (appState.lastCheckIn === yesterdayStr) {
        appState.checkInStreak += 1;
      } else {
        appState.checkInStreak = 1;
      }

      appState.lastCheckIn = today;
      appState.totalCheckIns += 1;

      // 基础签到积分
      let points = 3;
      let bonusMsg = '';

      // 连续签到奖励
      if (appState.checkInStreak === 7) {
        points += 20;
        bonusMsg = ' 连续签到7天奖励+20分！';
      } else if (appState.checkInStreak === 30) {
        points += 50;
        bonusMsg = ' 连续签到30天奖励+50分！';
      }

      addGrowthRecord('每日签到', points, 'checkin');
      saveAppState();

      showToast('签到成功！获得' + points + '成长积分' + bonusMsg);

      // 刷新首页签到卡片
      navigateTo('home');
    }
