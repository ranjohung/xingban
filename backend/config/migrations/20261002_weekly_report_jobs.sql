USE xingban_api;

ALTER TABLE weekly_reports
  ADD UNIQUE KEY uq_weekly_report_child_week (child_id, week_start);

CREATE TABLE IF NOT EXISTS weekly_report_jobs (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  child_id INT NOT NULL,
  user_id INT NOT NULL,
  week_start DATE NOT NULL,
  week_end DATE NOT NULL,
  status ENUM('pending','processing','retry','succeeded','failed') NOT NULL DEFAULT 'pending',
  attempt_count INT NOT NULL DEFAULT 0,
  next_attempt_at TIMESTAMP NULL,
  report_id INT NULL,
  notification_status ENUM('pending','delivered','failed') NOT NULL DEFAULT 'pending',
  last_error VARCHAR(500) NULL,
  started_at TIMESTAMP NULL,
  completed_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_weekly_job_child_week (child_id, week_start),
  INDEX idx_weekly_job_due (status, next_attempt_at),
  FOREIGN KEY (child_id) REFERENCES children(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (report_id) REFERENCES weekly_reports(id) ON DELETE SET NULL
);
