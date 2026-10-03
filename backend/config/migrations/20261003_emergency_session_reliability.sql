-- 紧急支持会话请求幂等：网络超时后重试不重复创建会话。
USE xingban_api;

ALTER TABLE emergency_sessions
  ADD COLUMN client_request_id CHAR(36) NULL AFTER id,
  ADD UNIQUE KEY uq_emergency_session_request (user_id, client_request_id);
