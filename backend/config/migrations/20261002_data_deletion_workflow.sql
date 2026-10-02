USE xingban_api;

CREATE TABLE IF NOT EXISTS data_deletion_requests (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  public_id CHAR(36) NOT NULL UNIQUE,
  requester_user_id INT NULL,
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
  INDEX idx_deletion_request_queue (status, due_at, created_at),
  FOREIGN KEY (requester_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (child_id) REFERENCES children(id) ON DELETE SET NULL,
  FOREIGN KEY (processed_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);
