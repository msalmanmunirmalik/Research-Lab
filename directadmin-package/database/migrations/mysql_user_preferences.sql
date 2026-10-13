-- User preferences table for settings
SET FOREIGN_KEY_CHECKS = 0;

CREATE TABLE IF NOT EXISTS user_preferences (
  id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(64) UNIQUE NOT NULL,
  notifications_email TINYINT(1) DEFAULT 1,
  notifications_push TINYINT(1) DEFAULT 1,
  notifications_research_updates TINYINT(1) DEFAULT 1,
  notifications_lab_updates TINYINT(1) DEFAULT 1,
  notifications_conference_updates TINYINT(1) DEFAULT 1,
  theme VARCHAR(50) DEFAULT 'light',
  language VARCHAR(20) DEFAULT 'en',
  date_format VARCHAR(50) DEFAULT 'MM/DD/YYYY',
  currency VARCHAR(10) DEFAULT 'USD',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

SET FOREIGN_KEY_CHECKS = 1;
