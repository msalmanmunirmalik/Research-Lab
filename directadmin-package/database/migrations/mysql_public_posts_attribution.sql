-- Public Network posts: every listing is attributed to a user (created_by / user_id)
-- Grants, networking posts, databank offers/requests

SET FOREIGN_KEY_CHECKS = 0;

-- Community + ingested funding calls
CREATE TABLE IF NOT EXISTS grants (
  id VARCHAR(64) PRIMARY KEY,
  created_by VARCHAR(64) NULL,
  source_id VARCHAR(64) NULL,
  external_id VARCHAR(255) NULL,
  title VARCHAR(500) NOT NULL,
  summary TEXT,
  sponsor VARCHAR(255),
  funding_type VARCHAR(100),
  funding_min DECIMAL(14,2) NULL,
  funding_max DECIMAL(14,2) NULL,
  funding_currency VARCHAR(10) DEFAULT 'USD',
  deadline_date DATE NULL,
  published_date DATE NULL,
  status VARCHAR(30) DEFAULT 'open',
  url VARCHAR(1000),
  region VARCHAR(100),
  country VARCHAR(100),
  disciplines JSON,
  keywords JSON,
  eligibility JSON,
  requirements JSON,
  raw_payload JSON,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_grants_source_external (source_id, external_id),
  INDEX idx_grants_status (status),
  INDEX idx_grants_deadline (deadline_date),
  INDEX idx_grants_created_by (created_by)
);

CREATE TABLE IF NOT EXISTS user_grant_preferences (
  id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL,
  keywords JSON,
  disciplines JSON,
  regions JSON,
  funding_types JSON,
  career_stage VARCHAR(100),
  notify_in_app TINYINT(1) DEFAULT 1,
  notify_email TINYINT(1) DEFAULT 1,
  min_funding DECIMAL(14,2) NULL,
  max_funding DECIMAL(14,2) NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_grant_prefs_user (user_id)
);

CREATE TABLE IF NOT EXISTS grant_writeups (
  id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL,
  grant_id VARCHAR(64) NULL,
  title VARCHAR(500),
  template_type VARCHAR(100),
  content TEXT,
  metadata JSON,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_grant_writeups_user (user_id),
  INDEX idx_grant_writeups_grant (grant_id)
);

CREATE TABLE IF NOT EXISTS grant_matches (
  id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL,
  grant_id VARCHAR(64) NOT NULL,
  match_score DECIMAL(6,2) DEFAULT 0,
  is_eligible TINYINT(1) DEFAULT 0,
  reasons JSON,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_grant_match (user_id, grant_id),
  INDEX idx_grant_matches_user (user_id)
);

-- Public networking posts (collaboration calls, announcements)
CREATE TABLE IF NOT EXISTS networking_posts (
  id VARCHAR(64) PRIMARY KEY,
  created_by VARCHAR(64) NOT NULL,
  title VARCHAR(255) NOT NULL,
  body TEXT,
  post_type VARCHAR(50) NOT NULL DEFAULT 'looking_for_collaborator',
  tags JSON,
  institution VARCHAR(255),
  location VARCHAR(255),
  is_published TINYINT(1) DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_networking_posts_created_by (created_by),
  INDEX idx_networking_posts_type (post_type),
  INDEX idx_networking_posts_published (is_published)
);

SET FOREIGN_KEY_CHECKS = 1;

-- Attribution columns on existing databank tables (safe if already present)
SET @db := DATABASE();

SET @exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'databank_data_offers' AND COLUMN_NAME = 'created_by'
);
SET @sql := IF(@exists = 0,
  'ALTER TABLE databank_data_offers ADD COLUMN created_by VARCHAR(64) NULL AFTER organization_id, ADD INDEX idx_offers_created_by (created_by)',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'databank_data_requests' AND COLUMN_NAME = 'user_id'
);
SET @sql := IF(@exists = 0,
  'ALTER TABLE databank_data_requests ADD COLUMN user_id VARCHAR(64) NULL AFTER data_offer_id, ADD INDEX idx_requests_user (user_id)',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Backfill offer authors from org owners
UPDATE databank_data_offers d
JOIN databank_organizations o ON o.id = d.organization_id
SET d.created_by = o.created_by
WHERE d.created_by IS NULL AND o.created_by IS NOT NULL;

-- Denormalized poster display names (survive missing user joins)
SET @db := DATABASE();
SET @exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'research_events' AND COLUMN_NAME = 'posted_by_name'
);
SET @sql := IF(@exists = 0, 'ALTER TABLE research_events ADD COLUMN posted_by_name VARCHAR(255) NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'databank_organizations' AND COLUMN_NAME = 'posted_by_name'
);
SET @sql := IF(@exists = 0, 'ALTER TABLE databank_organizations ADD COLUMN posted_by_name VARCHAR(255) NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'databank_data_offers' AND COLUMN_NAME = 'posted_by_name'
);
SET @sql := IF(@exists = 0, 'ALTER TABLE databank_data_offers ADD COLUMN posted_by_name VARCHAR(255) NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'grants' AND COLUMN_NAME = 'posted_by_name'
);
SET @sql := IF(@exists = 0, 'ALTER TABLE grants ADD COLUMN posted_by_name VARCHAR(255) NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'networking_posts' AND COLUMN_NAME = 'posted_by_name'
);
SET @sql := IF(@exists = 0, 'ALTER TABLE networking_posts ADD COLUMN posted_by_name VARCHAR(255) NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

