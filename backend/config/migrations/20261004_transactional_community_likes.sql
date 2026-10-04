USE xingban_api;

CREATE TABLE IF NOT EXISTS community_post_likes (
  post_id BIGINT NOT NULL,
  user_id INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (post_id, user_id),
  FOREIGN KEY (post_id) REFERENCES community_posts(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

INSERT IGNORE INTO community_post_likes (post_id,user_id)
SELECT p.id,j.user_id
FROM community_posts p
JOIN JSON_TABLE(COALESCE(p.liked_user_ids,JSON_ARRAY()), '$[*]' COLUMNS(user_id INT PATH '$')) j
JOIN users u ON u.id=j.user_id;

UPDATE community_posts p
SET p.likes=(SELECT COUNT(*) FROM community_post_likes l WHERE l.post_id=p.id);
