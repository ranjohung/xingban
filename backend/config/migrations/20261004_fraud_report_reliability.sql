-- 防骗线索保存请求幂等，避免连点或超时重试生成重复记录。
USE xingban_api;

ALTER TABLE fraud_reports
  ADD COLUMN client_request_id CHAR(36) NULL AFTER user_id,
  ADD UNIQUE KEY uq_fraud_report_request (user_id, client_request_id);
