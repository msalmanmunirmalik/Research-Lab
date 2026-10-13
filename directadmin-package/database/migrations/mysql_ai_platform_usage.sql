-- Platform AI free-tier usage tracking (per user, per UTC day)
CREATE TABLE IF NOT EXISTS ai_platform_usage (
  user_id VARCHAR(64) NOT NULL,
  usage_date DATE NOT NULL,
  message_count INT NOT NULL DEFAULT 0,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, usage_date),
  INDEX idx_ai_platform_usage_date (usage_date)
);
