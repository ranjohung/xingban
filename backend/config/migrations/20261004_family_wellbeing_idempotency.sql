-- 照护者心情和感谢卡创建请求幂等，避免连点或超时重试产生重复记录。
USE xingban_api;

ALTER TABLE family_moods
  ADD COLUMN client_request_id CHAR(36) NULL AFTER user_id,
  ADD UNIQUE KEY uq_family_mood_request (user_id, client_request_id);

ALTER TABLE gratitude_cards
  ADD COLUMN client_request_id CHAR(36) NULL AFTER user_id,
  ADD UNIQUE KEY uq_gratitude_request (user_id, client_request_id);
