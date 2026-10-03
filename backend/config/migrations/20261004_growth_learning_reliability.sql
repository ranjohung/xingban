-- 家长课程章节完成：请求重放、业务唯一活动与积分/明细原子提交。
USE xingban_api;

ALTER TABLE growth_records
  ADD COLUMN client_request_id CHAR(36) NULL AFTER user_id,
  ADD COLUMN activity_key VARCHAR(100) NULL AFTER client_request_id,
  ADD UNIQUE KEY uq_growth_request (user_id, client_request_id),
  ADD UNIQUE KEY uq_growth_activity (user_id, action, activity_key);
