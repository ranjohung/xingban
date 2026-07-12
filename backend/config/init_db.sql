CREATE DATABASE IF NOT EXISTS xingban DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

USE xingban;

CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  phone VARCHAR(20) NOT NULL UNIQUE,
  password VARCHAR(255) NOT NULL,
  nickname VARCHAR(50),
  role ENUM('parent', 'therapist', 'admin') DEFAULT 'parent',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS children (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  nickname VARCHAR(50) NOT NULL,
  birth_date DATE NOT NULL,
  diagnosis_type ENUM('ASD', 'ADHD', 'DD', 'OTHER') NOT NULL,
  diagnosis_other VARCHAR(200),
  communication_level ENUM('none', 'single_word', 'phrase', 'sentence', 'fluent') DEFAULT 'none',
  social_level INT DEFAULT 1,
  self_care_level INT DEFAULT 1,
  cognitive_level INT DEFAULT 1,
  sensory_hearing ENUM('sensitive', 'dull', 'seeking', 'avoiding', 'normal') DEFAULT 'normal',
  sensory_visual ENUM('sensitive', 'dull', 'seeking', 'avoiding', 'normal') DEFAULT 'normal',
  sensory_tactile ENUM('sensitive', 'dull', 'seeking', 'avoiding', 'normal') DEFAULT 'normal',
  sensory_vestibular ENUM('sensitive', 'dull', 'seeking', 'avoiding', 'normal') DEFAULT 'normal',
  reinforcers JSON DEFAULT '[]',
  medical_info TEXT,
  avatar VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS intervention_goals (
  id INT AUTO_INCREMENT PRIMARY KEY,
  child_id INT NOT NULL,
  goal_type VARCHAR(50) NOT NULL,
  description TEXT NOT NULL,
  target_date DATE,
  status ENUM('active', 'completed', 'paused') DEFAULT 'active',
  progress INT DEFAULT 0,
  ai_generated BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (child_id) REFERENCES children(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS behavior_records (
  id INT AUTO_INCREMENT PRIMARY KEY,
  child_id INT NOT NULL,
  user_id INT NOT NULL,
  input_type ENUM('voice', 'text', 'photo') NOT NULL,
  content TEXT,
  audio_url VARCHAR(255),
  photo_url VARCHAR(255),
  behavior_category VARCHAR(50),
  behavior_subtype VARCHAR(50),
  emotion_state VARCHAR(50),
  trigger_factor VARCHAR(200),
  behavior_function VARCHAR(50),
  intensity_level ENUM('low', 'medium', 'high') DEFAULT 'medium',
  location VARCHAR(100),
  duration INT,
  ai_analysis JSON,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (child_id) REFERENCES children(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS strategies (
  id INT AUTO_INCREMENT PRIMARY KEY,
  category VARCHAR(50) NOT NULL,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  steps TEXT,
  scripts TEXT,
  principles TEXT,
  applicable_scenarios TEXT,
  icon VARCHAR(50),
  difficulty_level ENUM('easy', 'medium', 'advanced') DEFAULT 'medium',
  effectiveness_rate DECIMAL(5,2) DEFAULT 0,
  usage_count INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS strategy_feedback (
  id INT AUTO_INCREMENT PRIMARY KEY,
  child_id INT NOT NULL,
  strategy_id INT NOT NULL,
  user_id INT NOT NULL,
  behavior_record_id INT,
  effectiveness ENUM('effective', 'neutral', 'ineffective') NOT NULL,
  note TEXT,
  scene VARCHAR(100),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (child_id) REFERENCES children(id) ON DELETE CASCADE,
  FOREIGN KEY (strategy_id) REFERENCES strategies(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (behavior_record_id) REFERENCES behavior_records(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS emergency_sessions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  child_id INT NOT NULL,
  user_id INT NOT NULL,
  level ENUM('green', 'yellow', 'red') NOT NULL,
  started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  ended_at TIMESTAMP NULL,
  strategies_used TEXT,
  outcome VARCHAR(200),
  energy_station BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (child_id) REFERENCES children(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS weekly_reports (
  id INT AUTO_INCREMENT PRIMARY KEY,
  child_id INT NOT NULL,
  user_id INT NOT NULL,
  week_start DATE NOT NULL,
  week_end DATE NOT NULL,
  content JSON,
  share_token VARCHAR(100) UNIQUE,
  share_expires_at TIMESTAMP NULL,
  generated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (child_id) REFERENCES children(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS report_comments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  report_id INT NOT NULL,
  user_id INT NULL,
  therapist_id INT NULL,
  content TEXT NOT NULL,
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (report_id) REFERENCES weekly_reports(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS therapists (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(50) NOT NULL,
  phone VARCHAR(20) UNIQUE,
  email VARCHAR(100),
  professional_title VARCHAR(50),
  specialty VARCHAR(200),
  years_of_experience INT DEFAULT 0,
  profile_photo VARCHAR(255),
  rating DECIMAL(3,2) DEFAULT 0,
  review_count INT DEFAULT 0,
  professional_score INT DEFAULT 100,
  is_certified BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS energy_station (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  type ENUM('milestone', 'feedback', 'achievement', 'thanks_card') NOT NULL,
  content TEXT NOT NULL,
  child_id INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (child_id) REFERENCES children(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS skill_generalization (
  id INT AUTO_INCREMENT PRIMARY KEY,
  child_id INT NOT NULL,
  strategy_id INT NOT NULL,
  original_scene VARCHAR(100) NOT NULL,
  target_scene VARCHAR(100) NOT NULL,
  attempts INT DEFAULT 0,
  success_count INT DEFAULT 0,
  status ENUM('pending', 'trying', 'generalized') DEFAULT 'pending',
  FOREIGN KEY (child_id) REFERENCES children(id) ON DELETE CASCADE,
  FOREIGN KEY (strategy_id) REFERENCES strategies(id) ON DELETE CASCADE
);

INSERT INTO strategies (category, name, description, steps, scripts, principles, applicable_scenarios, icon, difficulty_level) VALUES
('情绪调节', '深呼吸法', '通过深呼吸帮助孩子平静情绪', '1. 引导孩子坐下或站立\\n2. 示范用鼻子深吸气4秒\\n3. 屏住呼吸2秒\\n4. 用嘴巴慢慢呼气6秒\\n5. 重复3-5次', '\"来，跟着我一起深呼吸，吸气...呼气...\"', '利用腹式呼吸激活副交感神经系统，降低心率，缓解焦虑', '情绪爆发初期、焦虑情绪、等待时', 'wind', 'easy'),
('情绪调节', '感官安抚', '使用感官物品帮助孩子自我调节', '1. 准备孩子喜欢的感官物品（如泡泡水、压力球）\\n2. 引导孩子使用感官物品\\n3. 观察孩子情绪变化\\n4. 逐渐减少辅助', '\"我们来玩泡泡水吧，看泡泡飞得多高\"', '通过提供适当的感官刺激，帮助孩子自我调节情绪状态', '情绪爆发、感官过载、烦躁时', 'sparkles', 'easy'),
('行为管理', '视觉时间表', '使用视觉图片帮助孩子理解日常流程', '1. 准备日常活动的图片卡片\\n2. 按顺序排列卡片\\n3. 每完成一项打勾或取下卡片\\n4. 完成后给予表扬', '\"看，我们接下来要做什么？\"', '视觉支持帮助自闭症孩子理解时间概念和活动顺序', '日常活动转换、作息安排、任务完成', 'calendar', 'medium'),
('行为管理', '社交故事', '通过故事帮助孩子学习社交技能', '1. 选择适合的社交故事\\n2. 与孩子一起阅读故事\\n3. 讨论故事中的情节\\n4. 在实际场景中练习', '\"让我们看看小朋朋是怎么和朋友打招呼的\"', '社交故事帮助孩子学习社交规则和期望行为', '社交场合、新环境适应、行为教学', 'book', 'medium'),
('沟通支持', '图片交换沟通', '使用图片帮助孩子表达需求', '1. 准备需求图片卡\\n2. 引导孩子用图片交换表达需求\\n3. 及时回应孩子的沟通\\n4. 逐渐减少辅助', '\"想要什么？用卡片告诉我\"', 'PECS方法帮助无口语或语言能力弱的孩子表达需求', '需求表达、情绪表达、社交沟通', 'image', 'easy'),
('行为减少', '替代行为训练', '教孩子用适当行为替代问题行为', '1. 识别问题行为的功能\\n2. 选择合适的替代行为\\n3. 在问题行为发生前提前干预\\n4. 强化替代行为', '\"如果你想要玩具，可以用手告诉我\"', '通过教授替代行为，帮助孩子以更合适的方式获得相同功能', '攻击行为、自伤行为、情绪爆发', 'refresh-cw', 'medium'),
('行为减少', '消退法', '在安全前提下，忽视问题行为以减少其发生', '1. 确保孩子安全\\n2. 在问题行为发生时不予关注\\n3. 在行为停止后给予关注\\n4. 记录行为变化', '（保持冷静，不回应问题行为）', '消退法通过移除强化物（关注）来减少问题行为的发生频率', '求关注行为、情绪爆发、刻板行为', 'eye-slash', 'advanced'),
('社交技能', '同伴互动训练', '帮助孩子学习与同伴互动', '1. 选择合适的同伴\\n2. 设定简单的互动目标\\n3. 提供结构化的互动活动\\n4. 及时给予反馈和强化', '\"我们和小朋友一起玩积木吧\"', '通过结构化的同伴互动，帮助孩子学习社交技能', '社交场合、幼儿园、游戏时间', 'users', 'medium'),
('生活自理', '任务分解', '将复杂任务分解为小步骤', '1. 将任务分解为3-5个小步骤\\n2. 逐一教授每个步骤\\n3. 使用视觉提示辅助\\n4. 逐步减少辅助', '\"第一步，我们先洗手\"', '任务分解帮助孩子逐步掌握复杂的生活自理技能', '穿衣、洗漱、吃饭、如厕', 'list-checks', 'easy'),
('情绪认知', '情绪识别卡片', '帮助孩子识别和理解情绪', '1. 展示情绪卡片\\n2. 讨论每种情绪的表现\\n3. 引导孩子识别自己的情绪\\n4. 练习表达情绪', '\"你现在感觉怎么样？是开心还是生气？\"', '通过视觉卡片帮助孩子学习识别和表达情绪', '情绪识别、情绪表达、社交理解', 'smile', 'easy');
