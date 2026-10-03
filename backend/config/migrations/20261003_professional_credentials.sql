USE xingban_api;

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

-- Older installations could mark profiles certified at creation time. Require the new evidence workflow.
UPDATE therapists SET is_certified = FALSE;
