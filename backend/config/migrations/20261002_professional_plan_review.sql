USE xingban_api;

ALTER TABLE professional_plans
  ADD COLUMN confirmation_status ENUM('not_requested','pending','confirmed','returned') NOT NULL DEFAULT 'not_requested' AFTER status,
  ADD COLUMN professional_note VARCHAR(1000) NULL AFTER confirmation_status,
  ADD COLUMN reviewed_at TIMESTAMP NULL AFTER professional_note,
  ADD COLUMN reviewed_by_user_id INT NULL AFTER reviewed_at,
  ADD COLUMN version INT NOT NULL DEFAULT 1 AFTER reviewed_by_user_id,
  ADD INDEX idx_professional_plan_therapist_review (therapist_id, confirmation_status, updated_at),
  ADD CONSTRAINT fk_professional_plan_reviewer FOREIGN KEY (reviewed_by_user_id) REFERENCES users(id) ON DELETE SET NULL;

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
