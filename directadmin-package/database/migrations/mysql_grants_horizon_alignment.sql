-- Horizon Europe / Funding & Tenders alignment
-- Ensures base grants tables exist, then adds programme/call metadata + grant_sources

SET @db := DATABASE();

CREATE TABLE IF NOT EXISTS grants (
  id VARCHAR(64) PRIMARY KEY,
  created_by VARCHAR(64) NULL,
  source_id VARCHAR(64) NULL,
  source_name VARCHAR(255) NULL,
  external_id VARCHAR(255) NULL,
  call_identifier VARCHAR(255) NULL,
  topic_identifier VARCHAR(255) NULL,
  title VARCHAR(500) NOT NULL,
  summary TEXT,
  sponsor VARCHAR(255),
  programme VARCHAR(255) NULL,
  programme_period VARCHAR(50) NULL,
  pillar VARCHAR(100) NULL,
  funding_type VARCHAR(100),
  action_type VARCHAR(255) NULL,
  funding_min DECIMAL(14,2) NULL,
  funding_max DECIMAL(14,2) NULL,
  funding_currency VARCHAR(10) DEFAULT 'USD',
  call_budget DECIMAL(16,2) NULL,
  deadline_date DATE NULL,
  deadline_model VARCHAR(100) NULL,
  published_date DATE NULL,
  opening_date DATE NULL,
  status VARCHAR(30) DEFAULT 'open',
  url VARCHAR(1000),
  region VARCHAR(100),
  country VARCHAR(100),
  disciplines JSON,
  keywords JSON,
  eligibility JSON,
  requirements JSON,
  raw_payload JSON,
  posted_by_name VARCHAR(255) NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_grants_source_external (source_id, external_id),
  INDEX idx_grants_status (status),
  INDEX idx_grants_deadline (deadline_date),
  INDEX idx_grants_created_by (created_by),
  INDEX idx_grants_call_identifier (call_identifier),
  INDEX idx_grants_programme (programme)
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

CREATE TABLE IF NOT EXISTS grant_sources (
  id VARCHAR(64) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  source_type ENUM('api', 'scrape', 'rss', 'manual') NOT NULL DEFAULT 'api',
  base_url VARCHAR(1000) NULL,
  auth_type VARCHAR(50) NULL,
  auth_config JSON NULL,
  config JSON NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  last_run_at DATETIME NULL,
  last_status VARCHAR(50) NULL,
  last_error TEXT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_grant_sources_active (is_active)
);

-- Safe column adds when an older grants table already exists
SET @exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'grants' AND COLUMN_NAME = 'programme'
);
SET @sql := IF(@exists = 0,
  'ALTER TABLE grants ADD COLUMN programme VARCHAR(255) NULL',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'grants' AND COLUMN_NAME = 'programme_period'
);
SET @sql := IF(@exists = 0,
  'ALTER TABLE grants ADD COLUMN programme_period VARCHAR(50) NULL',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'grants' AND COLUMN_NAME = 'pillar'
);
SET @sql := IF(@exists = 0,
  'ALTER TABLE grants ADD COLUMN pillar VARCHAR(100) NULL',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'grants' AND COLUMN_NAME = 'call_identifier'
);
SET @sql := IF(@exists = 0,
  'ALTER TABLE grants ADD COLUMN call_identifier VARCHAR(255) NULL',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'grants' AND COLUMN_NAME = 'topic_identifier'
);
SET @sql := IF(@exists = 0,
  'ALTER TABLE grants ADD COLUMN topic_identifier VARCHAR(255) NULL',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'grants' AND COLUMN_NAME = 'action_type'
);
SET @sql := IF(@exists = 0,
  'ALTER TABLE grants ADD COLUMN action_type VARCHAR(255) NULL',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'grants' AND COLUMN_NAME = 'deadline_model'
);
SET @sql := IF(@exists = 0,
  'ALTER TABLE grants ADD COLUMN deadline_model VARCHAR(100) NULL',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'grants' AND COLUMN_NAME = 'opening_date'
);
SET @sql := IF(@exists = 0,
  'ALTER TABLE grants ADD COLUMN opening_date DATE NULL',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'grants' AND COLUMN_NAME = 'call_budget'
);
SET @sql := IF(@exists = 0,
  'ALTER TABLE grants ADD COLUMN call_budget DECIMAL(16,2) NULL',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'grants' AND COLUMN_NAME = 'source_name'
);
SET @sql := IF(@exists = 0,
  'ALTER TABLE grants ADD COLUMN source_name VARCHAR(255) NULL',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'grants' AND COLUMN_NAME = 'posted_by_name'
);
SET @sql := IF(@exists = 0,
  'ALTER TABLE grants ADD COLUMN posted_by_name VARCHAR(255) NULL',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

INSERT INTO grant_sources (id, name, source_type, base_url, auth_type, auth_config, config, is_active)
VALUES (
  'src-horizon-europe-sedia',
  'Horizon Europe (EU Funding & Tenders / SEDIA)',
  'api',
  'https://api.tech.ec.europa.eu/search-api/prod/rest/search',
  'api_key',
  JSON_OBJECT('key', 'SEDIA', 'param', 'apiKey'),
  JSON_OBJECT(
    'provider', 'sedia',
    'frameworkProgramme', '43108390',
    'programme', 'Horizon Europe',
    'statusOpen', '31094502',
    'statusForthcoming', '31094501',
    'portalBase', 'https://ec.europa.eu/info/funding-tenders/opportunities/portal/screen/opportunities/topic-details/',
    'infoPage', 'https://research-and-innovation.ec.europa.eu/funding/funding-opportunities/funding-programmes-and-open-calls/horizon-europe_en'
  ),
  1
)
ON DUPLICATE KEY UPDATE
  name = VALUES(name),
  config = VALUES(config),
  is_active = 1,
  updated_at = CURRENT_TIMESTAMP;
