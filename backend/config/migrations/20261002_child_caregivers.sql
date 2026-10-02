USE xingban_api;

CREATE TABLE IF NOT EXISTS caregiver_invitations (
  id BIGINT AUTO_INCREMENT PRIMARY KEY, public_id CHAR(36) NOT NULL UNIQUE,
  owner_user_id INT NOT NULL, child_id INT NOT NULL, invitee_phone VARCHAR(20) NOT NULL,
  token_hash CHAR(64) NOT NULL UNIQUE, permissions JSON NOT NULL,
  status ENUM('pending','accepted','revoked','expired') NOT NULL DEFAULT 'pending',
  expires_at TIMESTAMP NOT NULL, accepted_by_user_id INT NULL, accepted_at TIMESTAMP NULL,
  revoked_at TIMESTAMP NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_caregiver_invite_phone (invitee_phone,status,expires_at),
  FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (child_id) REFERENCES children(id) ON DELETE CASCADE,
  FOREIGN KEY (accepted_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS child_caregivers (
  id BIGINT AUTO_INCREMENT PRIMARY KEY, child_id INT NOT NULL, owner_user_id INT NOT NULL,
  caregiver_user_id INT NOT NULL, permissions JSON NOT NULL, status ENUM('active','revoked') NOT NULL DEFAULT 'active',
  accepted_at TIMESTAMP NOT NULL, revoked_at TIMESTAMP NULL, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_child_caregiver (child_id,caregiver_user_id), INDEX idx_caregiver_active (caregiver_user_id,status),
  FOREIGN KEY (child_id) REFERENCES children(id) ON DELETE CASCADE,
  FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (caregiver_user_id) REFERENCES users(id) ON DELETE CASCADE
);
