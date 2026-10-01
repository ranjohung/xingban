USE xingban_api;

ALTER TABLE community_posts
  ADD COLUMN moderation_status ENUM('visible','held','removed') NOT NULL DEFAULT 'visible' AFTER liked_user_ids,
  ADD COLUMN risk_level ENUM('none','review','urgent') NOT NULL DEFAULT 'none' AFTER moderation_status;

ALTER TABLE community_comments
  ADD COLUMN moderation_status ENUM('visible','held','removed') NOT NULL DEFAULT 'visible' AFTER content,
  ADD COLUMN risk_level ENUM('none','review','urgent') NOT NULL DEFAULT 'none' AFTER moderation_status;

CREATE TABLE IF NOT EXISTS community_reports (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  case_ref CHAR(36) NOT NULL UNIQUE,
  reporter_user_id INT NOT NULL,
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
  FOREIGN KEY (reporter_user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (moderator_user_id) REFERENCES users(id) ON DELETE SET NULL
);
