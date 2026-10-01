USE xingban_api;

-- Existing installations created before v4.4 need an explicit account link.
ALTER TABLE therapists
  ADD COLUMN user_id INT NULL AFTER id,
  ADD UNIQUE KEY uq_therapist_user (user_id),
  ADD CONSTRAINT fk_therapist_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS report_shares (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  report_id INT NOT NULL,
  owner_user_id INT NOT NULL,
  therapist_id INT NOT NULL,
  scope JSON NOT NULL,
  note VARCHAR(500) NOT NULL DEFAULT '',
  expires_at TIMESTAMP NOT NULL,
  revoked_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_report_share_therapist (therapist_id, expires_at),
  INDEX idx_report_share_owner (owner_user_id, created_at),
  FOREIGN KEY (report_id) REFERENCES weekly_reports(id) ON DELETE CASCADE,
  FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (therapist_id) REFERENCES therapists(id) ON DELETE CASCADE
);
