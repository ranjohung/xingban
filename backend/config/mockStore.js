let users = [];
let children = [];
let behaviors = [];
let strategies = [
  { id: 1, name: '深呼吸引导法', category: '情绪安抚', description: '通过深呼吸帮助孩子平静下来', difficulty: '简单', effectiveness_rate: 85, usage_count: 128 },
  { id: 2, name: '感官安抚法', category: '情绪安抚', description: '使用触觉、视觉等感官刺激帮助孩子放松', difficulty: '中等', effectiveness_rate: 78, usage_count: 96 },
  { id: 3, name: '视觉提示卡', category: '沟通辅助', description: '通过图片卡片帮助孩子理解指令', difficulty: '简单', effectiveness_rate: 92, usage_count: 215 },
  { id: 4, name: '正向强化', category: '行为引导', description: '及时表扬孩子的正向行为', difficulty: '简单', effectiveness_rate: 88, usage_count: 342 },
  { id: 5, name: '社交故事', category: '社交技能', description: '通过故事帮助孩子理解社交情境', difficulty: '中等', effectiveness_rate: 75, usage_count: 89 },
  { id: 6, name: '结构化教学', category: '学习支持', description: '使用视觉日程表帮助孩子理解日常流程', difficulty: '中等', effectiveness_rate: 82, usage_count: 156 },
  { id: 7, name: '替代沟通', category: '沟通辅助', description: '使用图片交换沟通系统(PECS)', difficulty: '困难', effectiveness_rate: 70, usage_count: 45 },
  { id: 8, name: '自我管理', category: '情绪调节', description: '帮助孩子学会识别和管理自己的情绪', difficulty: '困难', effectiveness_rate: 68, usage_count: 32 },
  { id: 9, name: '情境模拟', category: '社交技能', description: '模拟真实社交场景进行练习', difficulty: '中等', effectiveness_rate: 76, usage_count: 67 },
  { id: 10, name: '代币系统', category: '行为引导', description: '使用代币奖励系统激励正向行为', difficulty: '简单', effectiveness_rate: 86, usage_count: 278 }
];
let reports = [];
let emergencySessions = [];

let familyMoods = [];
let gratitudeCards = [];
let growthProfiles = [];
let growthRecords = [];
let safetyProfiles = [];
let safetySkills = [
  { id: 1, name: '认识红绿灯', category: '交通安全', description: '学习红绿灯信号，知道红灯停绿灯行', difficulty: '简单' },
  { id: 2, name: '记住家庭住址', category: '防走失', description: '记住家庭住址和父母电话号码', difficulty: '简单' },
  { id: 3, name: '拒绝陌生人', category: '防拐骗', description: '学习如何拒绝陌生人的邀请', difficulty: '中等' },
  { id: 4, name: '拨打紧急电话', category: '应急能力', description: '学习拨打110、120、119等紧急电话', difficulty: '中等' },
  { id: 5, name: '寻找安全场所', category: '防走失', description: '知道在商场、公园走失时去哪里求助', difficulty: '中等' },
  { id: 6, name: '识别危险物品', category: '居家安全', description: '识别家中危险物品并学会远离', difficulty: '困难' }
];
let safetyPracticeRecords = [];
let storyLibrary = [
  { id: 1, title: '小明的一天', category: '日常生活', content: '早上，小明起床后自己穿衣服。他先穿袜子，再穿裤子，最后穿上衣。吃完早饭，小明背上书包去上学。在学校里，小明认真听讲，和同学们一起玩耍。下午放学回家，小明先完成作业，然后帮妈妈做家务。晚上，小明洗完澡后上床睡觉。他睡得很香，因为今天过得很充实。', cover_image: '📚' },
  { id: 2, title: '交朋友', category: '社交技能', content: '小红来到新学校，她有点紧张，不知道怎么交朋友。老师告诉她："试着和同学打招呼，问问他们喜欢什么。"小红鼓起勇气，走到小刚面前说："你好，我是小红，你喜欢玩什么？"小刚说："我喜欢玩积木。"小红说："我也喜欢！我们一起玩吧。"于是，小红和小刚成为了好朋友。', cover_image: '👫' },
  { id: 3, title: '分享快乐', category: '情绪管理', content: '小华有一盒漂亮的彩笔，他很喜欢。小明看到了，也想玩。小华有点舍不得，但妈妈告诉他："分享会让快乐加倍。"小华想了想，把彩笔递给小明说："我们一起画画吧。"两个人画了很多漂亮的画，他们都很开心。小华明白了，分享真的能让快乐变多。', cover_image: '🎨' },
  { id: 4, title: '排队的规则', category: '社会规范', content: '幼儿园里，小朋友们在排队滑滑梯。小强想插队，老师说："排队是一种礼貌，每个人都要遵守。"小强站到了队伍的最后面。轮到他的时候，他开心地滑了下去。从那以后，小强每次都会自觉排队，他知道这是大家都要遵守的规则。', cover_image: '🎢' },
  { id: 5, title: '勇敢说不', category: '自我保护', content: '小美在公园里玩，一个陌生人走过来给她糖果，说："跟我走吧，我带你去买更多好吃的。"小美想起妈妈说过："陌生人给的东西不能要，不能跟陌生人走。"她大声说："不，我不跟你走！"然后跑到附近的保安叔叔身边。保安叔叔表扬小美做得对。', cover_image: '🛡️' }
];
let customStories = [];
let storyPlayRecords = [];
let storyFeedback = [];

let communityPosts = [
  { id: 1, user_id: 1, title: '分享我的训练心得', content: '最近开始使用星伴进行社交训练，感觉进步很大。特别是咖啡厅破冰那个场景，让我学会了如何自然地开启话题。推荐给所有有社交焦虑的朋友！', category: 'training', likes: 24, comments_count: 5, liked_user_ids: JSON.stringify([2, 3]), created_at: new Date('2026-07-10') },
  { id: 2, user_id: 2, title: '深夜emo求助', content: '今天工作不顺利，感觉很挫败。有没有人可以聊聊？', category: 'emotion', likes: 12, comments_count: 8, liked_user_ids: JSON.stringify([1]), created_at: new Date('2026-07-11') },
  { id: 3, user_id: 3, title: '推荐一个好方法', content: '试试NVC非暴力沟通，真的很有效。当你感觉被误解时，试着用"观察-感受-需要-请求"的方式表达自己。', category: 'resource', likes: 38, comments_count: 12, liked_user_ids: JSON.stringify([1, 2, 4]), created_at: new Date('2026-07-09') },
  { id: 4, user_id: 4, title: '第一次训练很紧张', content: '第一次进行场景训练，紧张到说不出话来。但是伴侣很耐心地引导我，让我慢慢放松下来。', category: 'question', likes: 15, comments_count: 6, liked_user_ids: JSON.stringify([]), created_at: new Date('2026-07-12') },
  { id: 5, user_id: 1, title: '日常打卡', content: '今日训练完成！继续加油！', category: 'general', likes: 8, comments_count: 2, liked_user_ids: JSON.stringify([2]), created_at: new Date('2026-07-12') }
];
let communityComments = [
  { id: 1, user_id: 2, post_id: 1, content: '恭喜！一起加油！', created_at: new Date('2026-07-10') },
  { id: 2, user_id: 3, post_id: 1, content: '确实很有用，我也在练', created_at: new Date('2026-07-10') },
  { id: 3, user_id: 1, post_id: 2, content: '抱抱你，明天会更好', created_at: new Date('2026-07-11') },
  { id: 4, user_id: 4, post_id: 2, content: '我也有过类似的经历', created_at: new Date('2026-07-11') },
  { id: 5, user_id: 1, post_id: 3, content: '学习了！谢谢分享', created_at: new Date('2026-07-09') }
];
let notifications = [
  { id: 1, user_id: 1, title: '新评论', content: '有人评论了你的帖子', type: 'comment', is_read: false, created_at: new Date('2026-07-12') },
  { id: 2, user_id: 1, title: '点赞通知', content: '有人点赞了你的帖子', type: 'like', is_read: false, created_at: new Date('2026-07-12') },
  { id: 3, user_id: 1, title: '系统通知', content: '本周报告已生成，请查收', type: 'system', is_read: true, created_at: new Date('2026-07-11') },
  { id: 4, user_id: 1, title: '训练提醒', content: '今天还没有完成训练哦', type: 'training', is_read: true, created_at: new Date('2026-07-10') }
];

let userIdCounter = 1;
let childIdCounter = 1;
let behaviorIdCounter = 1;
let reportIdCounter = 1;
let moodIdCounter = 1;
let gratitudeIdCounter = 1;
let growthIdCounter = 1;
let safetyIdCounter = 1;
let practiceIdCounter = 1;
let customStoryIdCounter = 1;
let playRecordIdCounter = 1;
let feedbackIdCounter = 1;
let postIdCounter = 6;
let commentIdCounter = 6;
let notificationIdCounter = 5;

function query(sql, params, callback) {
  try {
    if (typeof params === 'function') {
      callback = params;
      params = [];
    }
    if (sql.includes('SELECT * FROM users WHERE phone')) {
      const phone = params[0];
      const results = users.filter(u => u.phone === phone);
      callback(null, results);
    } else if (sql.includes('INSERT INTO users')) {
      const user = {
        id: userIdCounter++,
        phone: params[0],
        password: params[1],
        nickname: params[2],
        role: 'parent',
        created_at: new Date()
      };
      users.push(user);
      callback(null, { insertId: user.id });
    } else if (sql.includes('SELECT * FROM users WHERE id')) {
      const id = params[0];
      const results = users.filter(u => u.id === id);
      callback(null, results);
    } else if (sql.includes('UPDATE users SET password')) {
      const hash = params[0];
      const id = params[1];
      const user = users.find(u => u.id === id);
      if (user) user.password = hash;
      callback(null, { affectedRows: 1 });
    } else if (sql.includes('SELECT id, phone, nickname, role FROM users')) {
      const id = params[0];
      const results = users.filter(u => u.id === id).map(u => ({ id: u.id, phone: u.phone, nickname: u.nickname, role: u.role }));
      callback(null, results);
    } else if (sql.includes('SELECT * FROM children WHERE parent_id')) {
      const parentId = params[0];
      const results = children.filter(c => c.parent_id === parentId);
      callback(null, results);
    } else if (sql.includes('INSERT INTO children')) {
      const child = {
        id: childIdCounter++,
        parent_id: params[0],
        nickname: params[1],
        birth_date: params[2],
        diagnosis_type: params[3],
        avatar: ['👦', '👧', '🧒'][Math.floor(Math.random() * 3)],
        created_at: new Date()
      };
      children.push(child);
      callback(null, { insertId: child.id });
    } else if (sql.includes('SELECT * FROM children WHERE id')) {
      const id = params[0];
      const results = children.filter(c => c.id === id);
      callback(null, results);
    } else if (sql.includes('UPDATE children')) {
      const updates = {};
      const id = params[params.length - 1];
      const child = children.find(c => c.id === id);
      if (child) {
        const fields = ['nickname', 'birth_date', 'diagnosis_type', 'avatar', 'notes'];
        params.slice(0, -1).forEach((val, i) => { updates[fields[i]] = val; });
        Object.assign(child, updates);
      }
      callback(null, { affectedRows: 1 });
    } else if (sql.includes('DELETE FROM children')) {
      const id = params[0];
      children = children.filter(c => c.id !== id);
      callback(null, { affectedRows: 1 });
    } else if (sql.includes('SELECT * FROM behavior_records')) {
      const childId = params[0];
      const results = behaviors.filter(b => b.child_id === childId).reverse();
      callback(null, results);
    } else if (sql.includes('INSERT INTO behavior_records')) {
      const behavior = {
        id: behaviorIdCounter++,
        child_id: params[0],
        input_type: params[1],
        content: params[2],
        behavior_category: params[3],
        emotion_state: params[4],
        intensity_level: params[5],
        created_at: new Date()
      };
      behaviors.push(behavior);
      callback(null, { insertId: behavior.id });
    } else if (sql.includes('SELECT * FROM strategies')) {
      callback(null, strategies);
    } else if (sql.includes('SELECT * FROM strategies WHERE category')) {
      const category = params[0];
      const results = strategies.filter(s => s.category === category);
      callback(null, results);
    } else if (sql.includes('INSERT INTO strategy_feedback')) {
      callback(null, { insertId: 1 });
    } else if (sql.includes('INSERT INTO emergency_sessions')) {
      const session = {
        id: Date.now(),
        child_id: params[0] || 0,
        level: params[1],
        start_time: new Date(),
        status: 'active'
      };
      emergencySessions.push(session);
      callback(null, { insertId: session.id });
    } else if (sql.includes('UPDATE emergency_sessions')) {
      const id = params[0];
      const session = emergencySessions.find(s => s.id === id);
      if (session) session.status = 'ended';
      callback(null, { affectedRows: 1 });
    } else if (sql.includes('INSERT INTO weekly_reports')) {
      const report = {
        id: reportIdCounter++,
        child_id: params[0],
        week_start: params[1],
        week_end: params[2],
        record_count: params[3],
        emotion_summary: params[4],
        ai_comment: params[5],
        recommendations: params[6],
        is_shared: false,
        created_at: new Date()
      };
      reports.push(report);
      callback(null, { insertId: report.id });
    } else if (sql.includes('SELECT * FROM weekly_reports')) {
      const childId = params[0];
      const results = reports.filter(r => r.child_id === childId).reverse();
      callback(null, results);
    } else if (sql.includes('UPDATE weekly_reports SET is_shared')) {
      const id = params[0];
      const report = reports.find(r => r.id === id);
      if (report) report.is_shared = true;
      callback(null, { affectedRows: 1 });
    } else if (sql.includes('INSERT INTO family_moods')) {
      const mood = {
        id: moodIdCounter++,
        user_id: params[0],
        mood: params[1],
        emoji: params[2],
        note: params[3] || '',
        created_at: new Date()
      };
      familyMoods.push(mood);
      callback(null, { insertId: mood.id });
    } else if (sql.includes('SELECT * FROM family_moods WHERE user_id')) {
      const userId = params[0];
      const results = familyMoods.filter(m => m.user_id === userId).reverse().slice(0, 20);
      callback(null, results);
    } else if (sql.includes('INSERT INTO gratitude_cards')) {
      const card = {
        id: gratitudeIdCounter++,
        user_id: params[0],
        partner: params[1],
        content: params[2],
        sent: false,
        created_at: new Date()
      };
      gratitudeCards.push(card);
      callback(null, { insertId: card.id });
    } else if (sql.includes('SELECT * FROM gratitude_cards WHERE user_id')) {
      const userId = params[0];
      const results = gratitudeCards.filter(c => c.user_id === userId).reverse();
      callback(null, results);
    } else if (sql.includes('UPDATE gratitude_cards SET sent')) {
      const id = params[0];
      const card = gratitudeCards.find(c => c.id === id);
      if (card) card.sent = true;
      callback(null, { affectedRows: 1 });
    } else if (sql.includes('SELECT * FROM growth_profile WHERE user_id')) {
      const userId = params[0];
      const results = growthProfiles.filter(g => g.user_id === userId);
      callback(null, results);
    } else if (sql.includes('UPDATE growth_profile SET')) {
      const points = params[0];
      const level = params[1];
      const userId = params[2];
      const profile = growthProfiles.find(g => g.user_id === userId);
      if (profile) {
        profile.points = points;
        profile.level = level;
      }
      callback(null, { affectedRows: 1 });
    } else if (sql.includes('INSERT INTO growth_profile')) {
      const profile = {
        id: growthIdCounter++,
        user_id: params[0],
        points: params[1],
        level: params[2],
        dimensions: params[3] || JSON.stringify({ knowledge: 0, practice: 0, emotion: 0, communication: 0 }),
        created_at: new Date()
      };
      growthProfiles.push(profile);
      callback(null, { insertId: profile.id });
    } else if (sql.includes('SELECT * FROM growth_records WHERE user_id')) {
      const userId = params[0];
      const results = growthRecords.filter(g => g.user_id === userId).reverse().slice(0, 20);
      callback(null, results);
    } else if (sql.includes('INSERT INTO growth_records')) {
      const record = {
        id: growthIdCounter++,
        user_id: params[0],
        action: params[1],
        points: params[2],
        description: params[3] || '',
        created_at: new Date()
      };
      growthRecords.push(record);
      callback(null, { insertId: record.id });
    } else if (sql.includes('INSERT INTO safety_profiles')) {
      const profile = {
        id: safetyIdCounter++,
        user_id: params[0],
        child_id: params[1],
        emergency_contact: params[2] || '',
        medical_info: params[3] || '',
        allergies: params[4] || '',
        special_notes: params[5] || '',
        created_at: new Date()
      };
      safetyProfiles.push(profile);
      callback(null, { insertId: profile.id });
    } else if (sql.includes('SELECT * FROM safety_profiles WHERE user_id')) {
      const userId = params[0];
      const childId = params[1];
      const results = safetyProfiles.filter(s => s.user_id === userId && s.child_id === childId);
      callback(null, results);
    } else if (sql.includes('UPDATE safety_profiles SET')) {
      const id = params[4];
      const profile = safetyProfiles.find(s => s.id === id);
      if (profile) {
        profile.emergency_contact = params[0];
        profile.medical_info = params[1];
        profile.allergies = params[2];
        profile.special_notes = params[3];
      }
      callback(null, { affectedRows: 1 });
    } else if (sql.includes('SELECT * FROM safety_skills ORDER BY')) {
      callback(null, safetySkills);
    } else if (sql.includes('SELECT * FROM safety_skills WHERE id')) {
      const id = params[0];
      const results = safetySkills.filter(s => s.id === id);
      callback(null, results);
    } else if (sql.includes('INSERT INTO safety_practice_records')) {
      const record = {
        id: practiceIdCounter++,
        user_id: params[0],
        child_id: params[1],
        skill_id: params[2],
        completed: params[3] || false,
        created_at: new Date()
      };
      safetyPracticeRecords.push(record);
      callback(null, { insertId: record.id });
    } else if (sql.includes('SELECT spr.* FROM safety_practice_records')) {
      const userId = params[0];
      const childId = params[1];
      const results = safetyPracticeRecords.filter(r => r.user_id === userId && r.child_id === childId)
        .reverse()
        .map(r => {
          const skill = safetySkills.find(s => s.id === r.skill_id);
          return { ...r, name: skill?.name || '', description: skill?.description || '' };
        });
      callback(null, results);
    } else if (sql.includes('SELECT * FROM story_library WHERE category')) {
      const category = params[0];
      const results = storyLibrary.filter(s => s.category === category).reverse();
      callback(null, results);
    } else if (sql.includes('SELECT * FROM story_library ORDER BY')) {
      callback(null, [...storyLibrary].reverse());
    } else if (sql.includes('SELECT * FROM story_library WHERE id')) {
      const id = params[0];
      const results = storyLibrary.filter(s => s.id === id);
      callback(null, results);
    } else if (sql.includes('INSERT INTO custom_stories')) {
      const story = {
        id: customStoryIdCounter++,
        user_id: params[0],
        child_id: params[1],
        title: params[2],
        content: params[3],
        category: params[4] || '自定义',
        created_at: new Date()
      };
      customStories.push(story);
      callback(null, { insertId: story.id });
    } else if (sql.includes('SELECT * FROM custom_stories WHERE user_id')) {
      const userId = params[0];
      const results = customStories.filter(s => s.user_id === userId).reverse();
      callback(null, results);
    } else if (sql.includes('DELETE FROM custom_stories')) {
      const id = params[0];
      customStories = customStories.filter(s => s.id !== id);
      callback(null, { affectedRows: 1 });
    } else if (sql.includes('INSERT INTO story_play_records')) {
      const record = {
        id: playRecordIdCounter++,
        user_id: params[0],
        child_id: params[1],
        story_id: params[2],
        story_type: params[3] || 'library',
        created_at: new Date()
      };
      storyPlayRecords.push(record);
      callback(null, { insertId: record.id });
    } else if (sql.includes('INSERT INTO story_feedback')) {
      const feedback = {
        id: feedbackIdCounter++,
        user_id: params[0],
        story_id: params[1],
        rating: params[2],
        feedback: params[3] || '',
        created_at: new Date()
      };
      storyFeedback.push(feedback);
      callback(null, { insertId: feedback.id });
    } else if (sql.includes('community_posts') && sql.includes('ORDER BY created_at DESC') && !sql.includes('WHERE')) {
      const limit = params[0];
      const offset = params[1];
      const results = [...communityPosts].reverse().slice(offset, offset + limit);
      callback(null, results);
    } else if (sql.includes('community_posts') && sql.includes('WHERE category')) {
      const category = params[0];
      const limit = params[1];
      const offset = params[2];
      const results = communityPosts.filter(p => p.category === category).reverse().slice(offset, offset + limit);
      callback(null, results);
    } else if (sql.includes('COUNT(*) as total') && sql.includes('community_posts')) {
      callback(null, [{ total: communityPosts.length }]);
    } else if (sql.includes('INSERT INTO community_posts')) {
      const post = {
        id: postIdCounter++,
        user_id: params[0],
        title: params[1],
        content: params[2],
        category: params[3] || 'general',
        likes: 0,
        comments_count: 0,
        liked_user_ids: JSON.stringify([]),
        created_at: new Date()
      };
      communityPosts.push(post);
      callback(null, { insertId: post.id });
    } else if (sql.includes('SELECT * FROM community_posts WHERE id')) {
      const id = params[0];
      const results = communityPosts.filter(p => p.id === id);
      callback(null, results);
    } else if (sql.includes('UPDATE community_posts SET likes')) {
      const likes = params[0];
      const likedUserIds = params[1];
      const id = params[2];
      const post = communityPosts.find(p => p.id === id);
      if (post) {
        post.likes = likes;
        post.liked_user_ids = likedUserIds;
      }
      callback(null, { affectedRows: 1 });
    } else if (sql.includes('UPDATE community_posts SET comments_count')) {
      const id = params[0];
      const post = communityPosts.find(p => p.id === id);
      if (post) post.comments_count++;
      callback(null, { affectedRows: 1 });
    } else if (sql.includes('SELECT * FROM community_comments WHERE post_id')) {
      const postId = params[0];
      const results = communityComments.filter(c => c.post_id === postId).sort((a, b) => a.id - b.id);
      callback(null, results);
    } else if (sql.includes('INSERT INTO community_comments')) {
      const comment = {
        id: commentIdCounter++,
        user_id: params[0],
        post_id: params[1],
        content: params[2],
        created_at: new Date()
      };
      communityComments.push(comment);
      callback(null, { insertId: comment.id });
    } else if (sql.includes('SELECT * FROM notifications WHERE user_id')) {
      const userId = params[0];
      const limit = params[1];
      const offset = params[2];
      const results = notifications.filter(n => n.user_id === userId).reverse().slice(offset, offset + limit);
      callback(null, results);
    } else if (sql.includes('SELECT * FROM notifications WHERE user_id = ? AND type')) {
      const userId = params[0];
      const type = params[1];
      const limit = params[2];
      const offset = params[3];
      const results = notifications.filter(n => n.user_id === userId && n.type === type).reverse().slice(offset, offset + limit);
      callback(null, results);
    } else if (sql.includes('SELECT COUNT(*) as total FROM notifications WHERE user_id')) {
      const userId = params[0];
      const total = notifications.filter(n => n.user_id === userId).length;
      callback(null, [{ total }]);
    } else if (sql.includes('SELECT COUNT(*) as unread FROM notifications WHERE user_id')) {
      const userId = params[0];
      const unread = notifications.filter(n => n.user_id === userId && !n.is_read).length;
      callback(null, [{ unread }]);
    } else if (sql.includes('UPDATE notifications SET is_read = TRUE WHERE user_id')) {
      const userId = params[0];
      notifications.forEach(n => { if (n.user_id === userId) n.is_read = true; });
      callback(null, { affectedRows: notifications.filter(n => n.user_id === userId).length });
    } else if (sql.includes('UPDATE notifications SET is_read = TRUE WHERE id')) {
      const id = params[0];
      const userId = params[1];
      const notification = notifications.find(n => n.id === id && n.user_id === userId);
      if (notification) notification.is_read = true;
      callback(null, { affectedRows: notification ? 1 : 0 });
    } else if (sql.includes('DELETE FROM notifications WHERE id')) {
      const id = params[0];
      const userId = params[1];
      const initialLength = notifications.length;
      notifications = notifications.filter(n => !(n.id === id && n.user_id === userId));
      callback(null, { affectedRows: initialLength - notifications.length });
    } else if (sql.includes('INSERT INTO notifications')) {
      const notification = {
        id: notificationIdCounter++,
        user_id: params[0],
        title: params[1],
        content: params[2],
        type: params[3] || 'system',
        is_read: false,
        created_at: new Date()
      };
      notifications.push(notification);
      callback(null, { insertId: notification.id });
    } else {
      callback(null, []);
    }
  } catch (error) {
    callback(error);
  }
}

module.exports = {
  query
};