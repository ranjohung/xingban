USE xingban_api;

ALTER TABLE report_shares
  ADD COLUMN client_request_id CHAR(36) NULL AFTER owner_user_id,
  ADD UNIQUE KEY uq_report_share_request (owner_user_id, client_request_id);
