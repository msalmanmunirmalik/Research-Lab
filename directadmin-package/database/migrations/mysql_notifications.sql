-- Unified in-app notifications + grant notify audit columns

SET FOREIGN_KEY_CHECKS = 0;

CREATE TABLE IF NOT EXISTS notifications (
  id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL,
  type VARCHAR(64) NOT NULL DEFAULT 'system',
  title VARCHAR(500) NOT NULL,
  body TEXT,
  link VARCHAR(1000) NULL,
  entity_type VARCHAR(64) NULL,
  entity_id VARCHAR(64) NULL,
  is_read TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_notifications_user_created (user_id, created_at),
  INDEX idx_notifications_user_unread (user_id, is_read, created_at)
);

CREATE TABLE IF NOT EXISTS grant_notifications (
  id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL,
  grant_id VARCHAR(64) NOT NULL,
  channel VARCHAR(32) NOT NULL DEFAULT 'in_app',
  status VARCHAR(32) NOT NULL DEFAULT 'sent',
  sent_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_grant_notifications_user (user_id),
  INDEX idx_grant_notifications_grant (grant_id)
);

SET FOREIGN_KEY_CHECKS = 1;

-- grant_matches.notified_at (safe if already present)
SET @db := DATABASE();
SET @exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'grant_matches' AND COLUMN_NAME = 'notified_at'
);
SET @sql := IF(@exists = 0,
  'ALTER TABLE grant_matches ADD COLUMN notified_at DATETIME NULL AFTER reasons',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
