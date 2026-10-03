USE xingban_api;

ALTER TABLE children
  ADD COLUMN client_request_id CHAR(36) NULL AFTER user_id,
  ADD UNIQUE KEY uq_child_user_request (user_id, client_request_id),
  MODIFY sensory_hearing ENUM('unknown','sensitive','dull','seeking','avoiding','normal') DEFAULT 'unknown',
  MODIFY sensory_visual ENUM('unknown','sensitive','dull','seeking','avoiding','normal') DEFAULT 'unknown',
  MODIFY sensory_tactile ENUM('unknown','sensitive','dull','seeking','avoiding','normal') DEFAULT 'unknown',
  MODIFY sensory_vestibular ENUM('unknown','sensitive','dull','seeking','avoiding','normal') DEFAULT 'unknown';
