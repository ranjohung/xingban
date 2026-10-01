USE xingban_api;

CREATE TABLE IF NOT EXISTS professional_plans (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  owner_user_id INT NOT NULL,
  therapist_id INT NULL,
  source_feedback_id BIGINT NULL,
  title VARCHAR(200) NOT NULL,
  goal VARCHAR(500) NULL,
  frequency VARCHAR(200) NULL,
  responsible_person VARCHAR(100) NULL,
  stop_conditions VARCHAR(500) NULL,
  review_date DATE NULL,
  status ENUM('pending_confirmation','active','paused','completed','escalated') NOT NULL DEFAULT 'pending_confirmation',
  notes VARCHAR(1000) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_professional_plan_owner_status (owner_user_id, status, updated_at),
  FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (therapist_id) REFERENCES therapists(id) ON DELETE SET NULL
);
