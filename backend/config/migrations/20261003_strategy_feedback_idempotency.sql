USE xingban_api;

ALTER TABLE strategy_feedback
  ADD COLUMN client_request_id CHAR(36) NULL AFTER user_id,
  ADD UNIQUE KEY uq_strategy_feedback_request (user_id, client_request_id);
