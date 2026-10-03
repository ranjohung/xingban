USE xingban_api;

ALTER TABLE behavior_records
  ADD COLUMN client_request_id CHAR(36) NULL AFTER user_id,
  ADD UNIQUE KEY uq_behavior_user_request (user_id, client_request_id);
