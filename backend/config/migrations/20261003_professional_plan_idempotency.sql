USE xingban_api;

ALTER TABLE professional_plans
  ADD COLUMN client_request_id CHAR(36) NULL AFTER owner_user_id,
  ADD UNIQUE KEY uq_professional_plan_request (owner_user_id, client_request_id);
