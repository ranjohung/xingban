-- 安全技能练习记录请求幂等：响应丢失后重试不得重复计算练习次数。
USE xingban_api;

ALTER TABLE safety_practice_records
  ADD COLUMN client_request_id CHAR(36) NULL AFTER user_id,
  ADD UNIQUE KEY uq_safety_practice_request (user_id, client_request_id);
