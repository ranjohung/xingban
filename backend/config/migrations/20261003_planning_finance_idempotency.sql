-- 目标、成长里程碑与记账创建请求幂等：超时重试不得重复写入。
USE xingban_api;

ALTER TABLE intervention_goals
  ADD COLUMN client_request_id CHAR(36) NULL AFTER child_id,
  ADD UNIQUE KEY uq_intervention_goal_request (child_id, client_request_id);

ALTER TABLE career_milestones
  ADD COLUMN client_request_id CHAR(36) NULL AFTER child_id,
  ADD UNIQUE KEY uq_career_milestone_request (child_id, client_request_id);

ALTER TABLE career_goals
  ADD COLUMN client_request_id CHAR(36) NULL AFTER child_id,
  ADD UNIQUE KEY uq_career_goal_request (child_id, client_request_id);

ALTER TABLE financial_records
  ADD COLUMN client_request_id CHAR(36) NULL AFTER child_id,
  ADD UNIQUE KEY uq_finance_request (user_id, client_request_id);
