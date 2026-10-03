-- 自定义社交故事按当前儿童归属，并以请求UUID避免重复创建。
USE xingban_api;

ALTER TABLE custom_stories
  ADD COLUMN client_request_id CHAR(36) NULL AFTER child_id,
  ADD UNIQUE KEY uq_custom_story_request (user_id, client_request_id);
