USE xingban_api;

ALTER TABLE community_posts
  ADD COLUMN client_request_id CHAR(36) NULL AFTER user_id,
  ADD UNIQUE KEY uq_community_post_request (user_id, client_request_id);

ALTER TABLE community_comments
  ADD COLUMN client_request_id CHAR(36) NULL AFTER user_id,
  ADD UNIQUE KEY uq_community_comment_request (user_id, client_request_id);
