USE xingban_api;

CREATE TABLE IF NOT EXISTS weekly_report_preferences (
  user_id INT PRIMARY KEY,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  delivery_weekday TINYINT NOT NULL DEFAULT 1,
  delivery_hour TINYINT NOT NULL DEFAULT 8,
  timezone VARCHAR(64) NOT NULL DEFAULT 'Asia/Shanghai',
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT chk_weekly_delivery_weekday CHECK (delivery_weekday BETWEEN 1 AND 7),
  CONSTRAINT chk_weekly_delivery_hour CHECK (delivery_hour BETWEEN 0 AND 23),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
