USE xingban_api;

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
