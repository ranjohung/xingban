USE xingban_api;

ALTER TABLE community_reports
  ADD COLUMN client_request_id CHAR(36) NULL AFTER reporter_user_id,
  ADD UNIQUE KEY uq_community_report_request (reporter_user_id, client_request_id);
