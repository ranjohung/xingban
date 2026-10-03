USE xingban_api;

ALTER TABLE data_deletion_requests
  ADD COLUMN client_request_id CHAR(36) NULL AFTER requester_user_id,
  ADD UNIQUE KEY uq_deletion_request_client (requester_user_id, client_request_id);
