-- Express API 使用独立数据库，避免与历史 Prisma/Next.js 的 xingban 库混用。
CREATE DATABASE IF NOT EXISTS xingban_api DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

USE xingban_api;

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
  client_request_id CHAR(36) NULL,
  nickname VARCHAR(50) NOT NULL,
  birth_date DATE NOT NULL,
  diagnosis_type ENUM('UNCONFIRMED', 'ASD', 'ADHD', 'DD', 'OTHER') NOT NULL,
  diagnosis_other VARCHAR(200),
  communication_level ENUM('none', 'single_word', 'phrase', 'sentence', 'fluent') DEFAULT 'none',
  social_level INT DEFAULT 1,
  self_care_level INT DEFAULT 1,
  cognitive_level INT DEFAULT 1,
  sensory_hearing ENUM('unknown', 'sensitive', 'dull', 'seeking', 'avoiding', 'normal') DEFAULT 'unknown',
  sensory_visual ENUM('unknown', 'sensitive', 'dull', 'seeking', 'avoiding', 'normal') DEFAULT 'unknown',
  sensory_tactile ENUM('unknown', 'sensitive', 'dull', 'seeking', 'avoiding', 'normal') DEFAULT 'unknown',
  sensory_vestibular ENUM('unknown', 'sensitive', 'dull', 'seeking', 'avoiding', 'normal') DEFAULT 'unknown',
  -- MySQL 9.x forbids defaults on JSON columns; application code treats NULL as an empty list.
  reinforcers JSON NULL,
  medical_info TEXT,
  avatar VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_child_user_request (user_id, client_request_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 兼容早期初始化过的数据库：建档接口允许“尚未确诊”。
ALTER TABLE children MODIFY diagnosis_type ENUM('UNCONFIRMED', 'ASD', 'ADHD', 'DD', 'OTHER') NOT NULL;

CREATE TABLE IF NOT EXISTS caregiver_invitations (
  id BIGINT AUTO_INCREMENT PRIMARY KEY, public_id CHAR(36) NOT NULL UNIQUE, owner_user_id INT NOT NULL, client_request_id CHAR(36) NULL, child_id INT NOT NULL,
  invitee_phone VARCHAR(20) NOT NULL, token_hash CHAR(64) NOT NULL UNIQUE, token_ciphertext TEXT NULL, token_iv VARCHAR(64) NULL, token_auth_tag VARCHAR(64) NULL, permissions JSON NOT NULL,
  status ENUM('pending','accepted','revoked','expired') NOT NULL DEFAULT 'pending', expires_at TIMESTAMP NOT NULL,
  accepted_by_user_id INT NULL, accepted_at TIMESTAMP NULL, revoked_at TIMESTAMP NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_caregiver_invite_phone (invitee_phone,status,expires_at), UNIQUE KEY uq_caregiver_invitation_request (owner_user_id,client_request_id), FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (child_id) REFERENCES children(id) ON DELETE CASCADE, FOREIGN KEY (accepted_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);
CREATE TABLE IF NOT EXISTS child_caregivers (
  id BIGINT AUTO_INCREMENT PRIMARY KEY, child_id INT NOT NULL, owner_user_id INT NOT NULL, caregiver_user_id INT NOT NULL,
  permissions JSON NOT NULL, status ENUM('active','revoked') NOT NULL DEFAULT 'active', accepted_at TIMESTAMP NOT NULL,
  revoked_at TIMESTAMP NULL, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_child_caregiver (child_id,caregiver_user_id), INDEX idx_caregiver_active (caregiver_user_id,status),
  FOREIGN KEY (child_id) REFERENCES children(id) ON DELETE CASCADE, FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (caregiver_user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS intervention_goals (
  id INT AUTO_INCREMENT PRIMARY KEY,
  child_id INT NOT NULL,
  client_request_id CHAR(36) NULL,
  goal_type VARCHAR(50) NOT NULL,
  description TEXT NOT NULL,
  target_date DATE,
  status ENUM('active', 'completed', 'paused') DEFAULT 'active',
  progress INT DEFAULT 0,
  ai_generated BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_intervention_goal_request (child_id, client_request_id),
  FOREIGN KEY (child_id) REFERENCES children(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS behavior_records (
  id INT AUTO_INCREMENT PRIMARY KEY,
  child_id INT NOT NULL,
  user_id INT NOT NULL,
  client_request_id CHAR(36) NULL,
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
  UNIQUE KEY uq_behavior_user_request (user_id, client_request_id),
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
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_strategy_name (name)
);

CREATE TABLE IF NOT EXISTS strategy_feedback (
  id INT AUTO_INCREMENT PRIMARY KEY,
  child_id INT NOT NULL,
  strategy_id INT NOT NULL,
  user_id INT NOT NULL,
  client_request_id CHAR(36) NULL,
  behavior_record_id INT,
  effectiveness ENUM('effective', 'neutral', 'ineffective') NOT NULL,
  note TEXT,
  scene VARCHAR(100),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_strategy_feedback_request (user_id, client_request_id),
  FOREIGN KEY (child_id) REFERENCES children(id) ON DELETE CASCADE,
  FOREIGN KEY (strategy_id) REFERENCES strategies(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (behavior_record_id) REFERENCES behavior_records(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS emergency_sessions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  client_request_id CHAR(36) NULL,
  child_id INT NOT NULL,
  user_id INT NOT NULL,
  level ENUM('green', 'yellow', 'red') NOT NULL,
  started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  ended_at TIMESTAMP NULL,
  strategies_used TEXT,
  outcome VARCHAR(200),
  energy_station BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_emergency_session_request (user_id, client_request_id),
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
  UNIQUE KEY uq_weekly_report_child_week (child_id, week_start),
  FOREIGN KEY (child_id) REFERENCES children(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS weekly_report_jobs (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  child_id INT NOT NULL, user_id INT NOT NULL, week_start DATE NOT NULL, week_end DATE NOT NULL,
  status ENUM('pending','processing','retry','succeeded','failed') NOT NULL DEFAULT 'pending',
  attempt_count INT NOT NULL DEFAULT 0, next_attempt_at TIMESTAMP NULL, report_id INT NULL,
  notification_status ENUM('pending','delivered','failed') NOT NULL DEFAULT 'pending', last_error VARCHAR(500) NULL,
  started_at TIMESTAMP NULL, completed_at TIMESTAMP NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_weekly_job_child_week (child_id, week_start), INDEX idx_weekly_job_due (status, next_attempt_at),
  FOREIGN KEY (child_id) REFERENCES children(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (report_id) REFERENCES weekly_reports(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS weekly_report_preferences (
  user_id INT PRIMARY KEY,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  delivery_weekday TINYINT NOT NULL DEFAULT 1,
  delivery_hour TINYINT NOT NULL DEFAULT 8,
  timezone VARCHAR(64) NOT NULL DEFAULT 'Asia/Shanghai',
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT chk_weekly_delivery_weekday CHECK (delivery_weekday BETWEEN 1 AND 7),
  CONSTRAINT chk_weekly_delivery_hour CHECK (delivery_hour BETWEEN 0 AND 23),
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
  user_id INT NULL UNIQUE,
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
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS professional_credentials (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  public_id CHAR(36) NOT NULL UNIQUE,
  therapist_id INT NOT NULL,
  credential_type ENUM('license','certificate','employment','identity','other') NOT NULL,
  reference_last4 CHAR(4) NULL,
  issuing_authority VARCHAR(200) NOT NULL,
  issued_on DATE NULL,
  expires_on DATE NOT NULL,
  evidence_filename VARCHAR(180) NOT NULL,
  evidence_mime ENUM('application/pdf','image/jpeg','image/png') NOT NULL,
  evidence_ciphertext MEDIUMTEXT NOT NULL,
  evidence_iv VARCHAR(64) NOT NULL,
  evidence_auth_tag VARCHAR(64) NOT NULL,
  evidence_sha256 CHAR(64) NOT NULL,
  status ENUM('pending','first_approved','approved','rejected','expired') NOT NULL DEFAULT 'pending',
  submitted_by_user_id INT NOT NULL,
  first_reviewer_user_id INT NULL,
  second_reviewer_user_id INT NULL,
  first_reviewed_at TIMESTAMP NULL,
  second_reviewed_at TIMESTAMP NULL,
  review_note VARCHAR(1000) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_professional_credential_queue (status, expires_on, created_at),
  INDEX idx_professional_credential_therapist (therapist_id, status, expires_on),
  FOREIGN KEY (therapist_id) REFERENCES therapists(id) ON DELETE CASCADE,
  FOREIGN KEY (submitted_by_user_id) REFERENCES users(id) ON DELETE RESTRICT,
  FOREIGN KEY (first_reviewer_user_id) REFERENCES users(id) ON DELETE RESTRICT,
  FOREIGN KEY (second_reviewer_user_id) REFERENCES users(id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS report_shares (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  report_id INT NOT NULL,
  owner_user_id INT NOT NULL,
  client_request_id CHAR(36) NULL,
  therapist_id INT NOT NULL,
  scope JSON NOT NULL,
  note VARCHAR(500) NOT NULL DEFAULT '',
  expires_at TIMESTAMP NOT NULL,
  revoked_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_report_share_therapist (therapist_id, expires_at),
  INDEX idx_report_share_owner (owner_user_id, created_at),
  UNIQUE KEY uq_report_share_request (owner_user_id, client_request_id),
  FOREIGN KEY (report_id) REFERENCES weekly_reports(id) ON DELETE CASCADE,
  FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (therapist_id) REFERENCES therapists(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS professional_plans (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  owner_user_id INT NOT NULL,
  client_request_id CHAR(36) NULL,
  therapist_id INT NULL,
  source_feedback_id BIGINT NULL,
  title VARCHAR(200) NOT NULL,
  goal VARCHAR(500) NULL,
  frequency VARCHAR(200) NULL,
  responsible_person VARCHAR(100) NULL,
  stop_conditions VARCHAR(500) NULL,
  review_date DATE NULL,
  status ENUM('pending_confirmation','active','paused','completed','escalated') NOT NULL DEFAULT 'pending_confirmation',
  confirmation_status ENUM('not_requested','pending','confirmed','returned') NOT NULL DEFAULT 'not_requested',
  professional_note VARCHAR(1000) NULL,
  reviewed_at TIMESTAMP NULL,
  reviewed_by_user_id INT NULL,
  version INT NOT NULL DEFAULT 1,
  notes VARCHAR(1000) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_professional_plan_owner_status (owner_user_id, status, updated_at),
  UNIQUE KEY uq_professional_plan_request (owner_user_id, client_request_id),
  INDEX idx_professional_plan_therapist_review (therapist_id, confirmation_status, updated_at),
  FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (therapist_id) REFERENCES therapists(id) ON DELETE SET NULL,
  FOREIGN KEY (reviewed_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS professional_plan_events (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  plan_id BIGINT NOT NULL,
  actor_user_id INT NOT NULL,
  actor_role ENUM('parent','therapist','admin') NOT NULL,
  action ENUM('created','updated','submitted','confirmed','returned','status_changed') NOT NULL,
  from_status VARCHAR(40) NULL,
  to_status VARCHAR(40) NULL,
  note VARCHAR(1000) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_professional_plan_event_plan_time (plan_id, created_at),
  FOREIGN KEY (plan_id) REFERENCES professional_plans(id) ON DELETE CASCADE,
  FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS therapist_ratings (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  therapist_id INT NOT NULL,
  parent_user_id INT NOT NULL,
  rating TINYINT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_therapist_rating_parent (therapist_id, parent_user_id),
  CONSTRAINT chk_therapist_rating_range CHECK (rating BETWEEN 1 AND 5),
  FOREIGN KEY (therapist_id) REFERENCES therapists(id) ON DELETE CASCADE,
  FOREIGN KEY (parent_user_id) REFERENCES users(id) ON DELETE CASCADE
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

-- P0敏感数据：业务字段只保存AES-256-GCM密文，公开接口使用不可枚举UUID。
CREATE TABLE IF NOT EXISTS sensitive_records (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  public_id CHAR(36) NOT NULL UNIQUE,
  user_id INT NOT NULL,
  child_id INT NOT NULL,
  kind ENUM('safety_plan','mental_health_profile','wandering_plan','medical_event','medical_profile','emergency_contacts') NOT NULL,
  ciphertext MEDIUMTEXT NOT NULL,
  iv VARCHAR(64) NOT NULL,
  auth_tag VARCHAR(64) NOT NULL,
  version INT NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_sensitive_owner_child_kind (user_id, child_id, kind),
  INDEX idx_sensitive_child (child_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (child_id) REFERENCES children(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS data_shares (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  public_id CHAR(36) NOT NULL UNIQUE,
  owner_user_id INT NOT NULL,
  recipient_user_id INT NOT NULL,
  resource_public_id CHAR(36) NOT NULL,
  token_hash CHAR(64) NOT NULL UNIQUE,
  scopes JSON NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  revoked_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_share_owner (owner_user_id),
  INDEX idx_share_recipient (recipient_user_id),
  INDEX idx_share_resource (resource_public_id),
  FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (recipient_user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  actor_user_id INT NULL,
  actor_role VARCHAR(30) NOT NULL,
  action VARCHAR(50) NOT NULL,
  resource_type VARCHAR(50) NOT NULL,
  resource_public_id VARCHAR(100) NOT NULL,
  outcome VARCHAR(30) NOT NULL,
  request_id CHAR(36) NULL,
  metadata JSON NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_audit_actor_time (actor_user_id, created_at),
  INDEX idx_audit_resource (resource_type, resource_public_id),
  FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS data_deletion_requests (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  public_id CHAR(36) NOT NULL UNIQUE,
  requester_user_id INT NULL,
  client_request_id CHAR(36) NULL,
  scope ENUM('child','account') NOT NULL,
  child_id INT NULL,
  reason VARCHAR(500) NULL,
  status ENUM('pending','processing','completed','rejected','cancelled') NOT NULL DEFAULT 'pending',
  due_at TIMESTAMP NOT NULL,
  processed_by_user_id INT NULL,
  processed_at TIMESTAMP NULL,
  resolution_note VARCHAR(1000) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_deletion_request_owner_time (requester_user_id, created_at),
  UNIQUE KEY uq_deletion_request_client (requester_user_id, client_request_id),
  INDEX idx_deletion_request_queue (status, due_at, created_at),
  FOREIGN KEY (requester_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (child_id) REFERENCES children(id) ON DELETE SET NULL,
  FOREIGN KEY (processed_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS security_alerts (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  public_id CHAR(36) NOT NULL UNIQUE,
  active_key VARCHAR(191) NULL UNIQUE,
  rule_key ENUM('repeated_denied','decrypt_failure','share_revoke_failure') NOT NULL,
  subject_user_id INT NULL,
  severity ENUM('medium','high','critical') NOT NULL,
  status ENUM('open','acknowledged','resolved') NOT NULL DEFAULT 'open',
  occurrence_count INT NOT NULL DEFAULT 1,
  window_started_at TIMESTAMP NOT NULL,
  last_seen_at TIMESTAMP NOT NULL,
  summary VARCHAR(300) NOT NULL,
  evidence JSON NOT NULL,
  handled_by_user_id INT NULL,
  handled_at TIMESTAMP NULL,
  resolution_note VARCHAR(1000) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_security_alert_queue (status, severity, last_seen_at),
  INDEX idx_security_alert_subject (subject_user_id, last_seen_at),
  FOREIGN KEY (subject_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (handled_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS product_feedback (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  type ENUM('bug','feature','content','experience','other') NOT NULL DEFAULT 'other',
  content TEXT NOT NULL,
  status ENUM('open','reviewing','resolved','closed') NOT NULL DEFAULT 'open',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_feedback_user_time (user_id, created_at),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 下列业务表与现有 API 一一对应，避免模拟存储通过、真实 MySQL 却缺表。
CREATE TABLE IF NOT EXISTS child_profile_drafts (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  step TINYINT NOT NULL DEFAULT 1,
  data JSON NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_draft_user_time (user_id, updated_at),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS family_moods (
  id BIGINT AUTO_INCREMENT PRIMARY KEY, user_id INT NOT NULL, client_request_id CHAR(36) NULL,
  mood VARCHAR(50) NOT NULL, emoji VARCHAR(20) NOT NULL, note VARCHAR(500) NOT NULL DEFAULT '',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_family_mood_request (user_id, client_request_id), INDEX idx_mood_user_time (user_id, created_at), FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS gratitude_cards (
  id BIGINT AUTO_INCREMENT PRIMARY KEY, user_id INT NOT NULL, client_request_id CHAR(36) NULL,
  partner VARCHAR(80) NOT NULL, content TEXT NOT NULL, sent BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_gratitude_request (user_id, client_request_id), INDEX idx_gratitude_user_time (user_id, created_at), FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS growth_profile (
  id BIGINT AUTO_INCREMENT PRIMARY KEY, user_id INT NOT NULL UNIQUE,
  points INT NOT NULL DEFAULT 0, level VARCHAR(10) NOT NULL DEFAULT 'L1', dimensions JSON NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS growth_records (
  id BIGINT AUTO_INCREMENT PRIMARY KEY, user_id INT NOT NULL, client_request_id CHAR(36) NULL, activity_key VARCHAR(100) NULL,
  action VARCHAR(50) NOT NULL, points INT NOT NULL, description VARCHAR(200) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_growth_request (user_id, client_request_id), UNIQUE KEY uq_growth_activity (user_id, action, activity_key),
  INDEX idx_growth_user_time (user_id, created_at), FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS safety_profiles (
  id BIGINT AUTO_INCREMENT PRIMARY KEY, user_id INT NOT NULL, child_id INT NOT NULL,
  emergency_contact VARCHAR(300), medical_info TEXT, allergies VARCHAR(500), special_notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_safety_user_child (user_id, child_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE, FOREIGN KEY (child_id) REFERENCES children(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS safety_skills (
  id INT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(100) NOT NULL UNIQUE,
  description TEXT NOT NULL, difficulty TINYINT NOT NULL DEFAULT 1, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS safety_practice_records (
  id BIGINT AUTO_INCREMENT PRIMARY KEY, user_id INT NOT NULL, client_request_id CHAR(36) NULL, child_id INT NOT NULL, skill_id INT NOT NULL,
  completed BOOLEAN NOT NULL DEFAULT FALSE, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_safety_practice_request (user_id, client_request_id),
  INDEX idx_safety_practice_child_time (child_id, created_at),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE, FOREIGN KEY (child_id) REFERENCES children(id) ON DELETE CASCADE,
  FOREIGN KEY (skill_id) REFERENCES safety_skills(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS story_library (
  id INT AUTO_INCREMENT PRIMARY KEY, title VARCHAR(80) NOT NULL UNIQUE, content TEXT NOT NULL,
  category ENUM('emotion','social','daily','safety') NOT NULL DEFAULT 'daily', cover_image VARCHAR(500),
  play_count INT NOT NULL DEFAULT 0, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS custom_stories (
  id BIGINT AUTO_INCREMENT PRIMARY KEY, user_id INT NOT NULL, child_id INT NULL, client_request_id CHAR(36) NULL,
  title VARCHAR(80) NOT NULL, content TEXT NOT NULL, category ENUM('emotion','social','daily','safety') NOT NULL DEFAULT 'daily',
  cover_image VARCHAR(500), play_count INT NOT NULL DEFAULT 0, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_custom_story_request (user_id, client_request_id), INDEX idx_custom_story_user_time (user_id, created_at), FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (child_id) REFERENCES children(id) ON DELETE SET NULL
);
CREATE TABLE IF NOT EXISTS story_play_records (
  id BIGINT AUTO_INCREMENT PRIMARY KEY, user_id INT NOT NULL, child_id INT NULL, story_id BIGINT NOT NULL,
  story_type ENUM('library','custom') NOT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_story_play_user_time (user_id, created_at), FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (child_id) REFERENCES children(id) ON DELETE SET NULL
);
CREATE TABLE IF NOT EXISTS story_feedback (
  id BIGINT AUTO_INCREMENT PRIMARY KEY, user_id INT NOT NULL, story_id BIGINT NOT NULL,
  rating TINYINT NOT NULL, feedback VARCHAR(500), created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_story_feedback_story (story_id), FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS community_posts (
  id BIGINT AUTO_INCREMENT PRIMARY KEY, user_id INT NOT NULL, client_request_id CHAR(36) NULL, title VARCHAR(80) NOT NULL, content TEXT NOT NULL,
  category ENUM('general','training','emotion','resource','question') NOT NULL DEFAULT 'general',
  likes INT NOT NULL DEFAULT 0, comments_count INT NOT NULL DEFAULT 0, liked_user_ids JSON NULL,
  moderation_status ENUM('visible','held','removed') NOT NULL DEFAULT 'visible',
  risk_level ENUM('none','review','urgent') NOT NULL DEFAULT 'none',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_community_post_request (user_id, client_request_id),
  INDEX idx_community_category_time (category, created_at), FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS community_comments (
  id BIGINT AUTO_INCREMENT PRIMARY KEY, user_id INT NOT NULL, client_request_id CHAR(36) NULL, post_id BIGINT NOT NULL, content VARCHAR(500) NOT NULL,
  moderation_status ENUM('visible','held','removed') NOT NULL DEFAULT 'visible',
  risk_level ENUM('none','review','urgent') NOT NULL DEFAULT 'none',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, UNIQUE KEY uq_community_comment_request (user_id, client_request_id), INDEX idx_comment_post_time (post_id, created_at),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE, FOREIGN KEY (post_id) REFERENCES community_posts(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS community_post_likes (
  post_id BIGINT NOT NULL,
  user_id INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (post_id, user_id),
  FOREIGN KEY (post_id) REFERENCES community_posts(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS community_reports (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  case_ref CHAR(36) NOT NULL UNIQUE,
  reporter_user_id INT NOT NULL,
  client_request_id CHAR(36) NULL,
  target_type ENUM('post','comment') NOT NULL,
  target_id BIGINT NOT NULL,
  reason ENUM('crisis','harassment','privacy','misinformation','fraud','other') NOT NULL,
  details VARCHAR(500) NULL,
  risk_level ENUM('review','urgent') NOT NULL DEFAULT 'review',
  status ENUM('open','reviewing','resolved','dismissed') NOT NULL DEFAULT 'open',
  moderator_user_id INT NULL,
  resolution_note VARCHAR(500) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_community_report_queue (status, risk_level, created_at),
  INDEX idx_community_report_reporter (reporter_user_id, created_at),
  UNIQUE KEY uq_community_report_request (reporter_user_id, client_request_id),
  FOREIGN KEY (reporter_user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (moderator_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS notifications (
  id BIGINT AUTO_INCREMENT PRIMARY KEY, user_id INT NOT NULL, title VARCHAR(80) NOT NULL, content VARCHAR(500) NOT NULL,
  type ENUM('comment','like','system','training','safety') NOT NULL DEFAULT 'system', is_read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, INDEX idx_notification_user_read_time (user_id, is_read, created_at),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS career_milestones (
  id BIGINT AUTO_INCREMENT PRIMARY KEY, child_id INT NOT NULL, client_request_id CHAR(36) NULL, milestone_id INT NOT NULL,
  title VARCHAR(100) NOT NULL, description TEXT, story TEXT, photo_url VARCHAR(500), created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_career_milestone_request (child_id, client_request_id), INDEX idx_career_milestone_child_time (child_id, created_at), FOREIGN KEY (child_id) REFERENCES children(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS career_goals (
  id BIGINT AUTO_INCREMENT PRIMARY KEY, child_id INT NOT NULL, client_request_id CHAR(36) NULL, category VARCHAR(30) NOT NULL,
  title VARCHAR(80) NOT NULL, description TEXT, target_date DATE, priority TINYINT NOT NULL DEFAULT 1,
  steps JSON NULL, progress TINYINT NOT NULL DEFAULT 0, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_career_goal_request (child_id, client_request_id), INDEX idx_career_goal_child_priority (child_id, priority), FOREIGN KEY (child_id) REFERENCES children(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS financial_records (
  id BIGINT AUTO_INCREMENT PRIMARY KEY, user_id INT NOT NULL, child_id INT NOT NULL, client_request_id CHAR(36) NULL,
  amount DECIMAL(12,2) NOT NULL, category VARCHAR(50) NOT NULL, date DATE NOT NULL, description VARCHAR(300) NOT NULL DEFAULT '',
  receipt_url VARCHAR(500), is_reimbursable BOOLEAN NOT NULL DEFAULT FALSE, insurance_policy VARCHAR(200),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, UNIQUE KEY uq_finance_request (user_id, client_request_id), INDEX idx_finance_child_date (child_id, date),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE, FOREIGN KEY (child_id) REFERENCES children(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS user_subsidies (
  id BIGINT AUTO_INCREMENT PRIMARY KEY, user_id INT NOT NULL, subsidy_id INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, UNIQUE KEY uq_user_subsidy (user_id, subsidy_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS fraud_reports (
  id BIGINT AUTO_INCREMENT PRIMARY KEY, user_id INT NOT NULL, client_request_id CHAR(36) NULL, title VARCHAR(100) NOT NULL, type VARCHAR(50) NOT NULL DEFAULT 'other',
  description TEXT NOT NULL, location VARCHAR(100), evidence_url VARCHAR(500), status VARCHAR(30) NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, UNIQUE KEY uq_fraud_report_request (user_id, client_request_id), INDEX idx_fraud_user_time (user_id, created_at),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

INSERT IGNORE INTO safety_skills (name, description, difficulty) VALUES
('记住照护者联系电话', '在平静状态下分步骤练习说出或展示主要照护者联系电话。', 1),
('走失后的求助步骤', '停在安全位置，寻找穿制服的工作人员，并出示信息卡。', 2),
('识别身体边界', '学习可接受与不可接受的触碰，并练习明确拒绝和求助。', 2),
('道路与交通安全', '练习停、看、听以及在成人陪同下通过道路。', 3);

INSERT IGNORE INTO story_library (title, content, category) VALUES
('当我需要休息时', '我可以说“我需要休息”，走到安静角落，做三次慢呼吸。等身体舒服一些，再告诉大人我是否准备好了。', 'emotion'),
('在公共场所和家人走散', '我先停下来，不继续乱跑。找到穿制服的工作人员，出示联系卡，请他帮助联系家人。', 'safety'),
('轮流玩玩具', '轮到别人时，我可以等待或选择另一个玩具。轮到我时，我会说“现在轮到我了吗？”', 'social');

INSERT IGNORE INTO strategies (category, name, description, steps, scripts, principles, applicable_scenarios, icon, difficulty_level) VALUES
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
