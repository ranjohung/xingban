USE xingban_api;

ALTER TABLE caregiver_invitations
  ADD COLUMN client_request_id CHAR(36) NULL AFTER owner_user_id,
  ADD COLUMN token_ciphertext TEXT NULL AFTER token_hash,
  ADD COLUMN token_iv VARCHAR(64) NULL AFTER token_ciphertext,
  ADD COLUMN token_auth_tag VARCHAR(64) NULL AFTER token_iv,
  ADD UNIQUE KEY uq_caregiver_invitation_request (owner_user_id, client_request_id);
