-- Grant proposal drafts (writeups) used by Grants & Funding → Write proposal

CREATE TABLE IF NOT EXISTS grant_writeups (
  id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL,
  grant_id VARCHAR(64) NULL,
  title VARCHAR(500),
  template_type VARCHAR(100) DEFAULT 'generic',
  status VARCHAR(30) NOT NULL DEFAULT 'draft',
  content JSON,
  metadata JSON,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_grant_writeups_user (user_id),
  INDEX idx_grant_writeups_grant (grant_id),
  INDEX idx_grant_writeups_updated (updated_at)
);

SET @db := DATABASE();

SET @exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'grant_writeups' AND COLUMN_NAME = 'status'
);
SET @sql := IF(@exists = 0,
  "ALTER TABLE grant_writeups ADD COLUMN status VARCHAR(30) NOT NULL DEFAULT 'draft' AFTER template_type",
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
