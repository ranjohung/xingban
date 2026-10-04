USE xingban_api;

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
