-- Sprint 2: tables mounted handlers already query, plus user-column defaults.
-- Does not rewrite existing user rows. Identifiers stay VARCHAR(64).
-- No foreign keys here. Orphan checks come later.

SET NAMES utf8mb4 COLLATE utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS calendar_events (
  id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT NULL,
  start_time DATETIME NULL,
  end_time DATETIME NULL,
  event_type VARCHAR(50) NULL DEFAULT 'meeting',
  all_day TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_calendar_events_user_start (user_id, start_time)
);

CREATE TABLE IF NOT EXISTS instrument_maintenance (
  id VARCHAR(64) PRIMARY KEY,
  instrument_id VARCHAR(64) NOT NULL,
  type VARCHAR(100) NOT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT NULL,
  scheduled_date DATETIME NULL,
  priority VARCHAR(50) NULL,
  assigned_to VARCHAR(64) NULL,
  estimated_duration INT NULL DEFAULT 60,
  cost DECIMAL(12,2) NULL DEFAULT 0,
  parts_used TEXT NULL,
  notes TEXT NULL,
  checklist TEXT NULL,
  created_by VARCHAR(64) NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'scheduled',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_instrument_maintenance_instrument (instrument_id, scheduled_date)
);

CREATE TABLE IF NOT EXISTS resource_exchange_requests (
  id VARCHAR(64) PRIMARY KEY,
  requester_lab_id VARCHAR(64) NOT NULL,
  requester_user_id VARCHAR(64) NOT NULL,
  item_name VARCHAR(255) NOT NULL,
  category VARCHAR(255) NULL,
  quantity DECIMAL(12,2) NULL,
  unit VARCHAR(50) NULL,
  urgency VARCHAR(50) NULL DEFAULT 'normal',
  needed_by DATETIME NULL,
  location_preference VARCHAR(50) NULL DEFAULT 'institution',
  notes TEXT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'open',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_exchange_requests_lab (requester_lab_id, status)
);

CREATE TABLE IF NOT EXISTS resource_exchange_offers (
  id VARCHAR(64) PRIMARY KEY,
  request_id VARCHAR(64) NOT NULL,
  provider_lab_id VARCHAR(64) NOT NULL,
  provider_user_id VARCHAR(64) NOT NULL,
  quantity DECIMAL(12,2) NULL,
  unit VARCHAR(50) NULL,
  message TEXT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'pending',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_exchange_offers_request (request_id, status)
);

CREATE TABLE IF NOT EXISTS data_templates (
  id VARCHAR(64) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  description TEXT NULL,
  category VARCHAR(255) NOT NULL,
  fields TEXT NOT NULL,
  created_by VARCHAR(64) NOT NULL,
  lab_id VARCHAR(64) NOT NULL,
  is_public TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_data_templates_lab (lab_id, created_at)
);

CREATE TABLE IF NOT EXISTS experiment_risks (
  id VARCHAR(64) PRIMARY KEY,
  experiment_id VARCHAR(64) NOT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT NULL,
  probability VARCHAR(50) NULL,
  impact VARCHAR(50) NULL,
  mitigation TEXT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'active',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_experiment_risks_experiment (experiment_id, created_at)
);

CREATE TABLE IF NOT EXISTS experiment_comments (
  id VARCHAR(64) PRIMARY KEY,
  experiment_id VARCHAR(64) NOT NULL,
  user_id VARCHAR(64) NULL,
  comment TEXT NOT NULL,
  is_internal TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_experiment_comments_experiment (experiment_id, created_at)
);

CREATE TABLE IF NOT EXISTS successful_alternatives (
  id VARCHAR(64) PRIMARY KEY,
  original_negative_result_id VARCHAR(64) NOT NULL,
  researcher_id VARCHAR(64) NOT NULL,
  alternative_title VARCHAR(500) NOT NULL,
  alternative_description TEXT NULL,
  key_differences TEXT NULL,
  success_level VARCHAR(50) NULL,
  outcome_description TEXT NULL,
  methodology TEXT NULL,
  helpful_votes INT NOT NULL DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_successful_alternatives_result (original_negative_result_id)
);

CREATE TABLE IF NOT EXISTS failure_patterns (
  id VARCHAR(64) PRIMARY KEY,
  title VARCHAR(500) NULL,
  description TEXT NULL,
  research_fields TEXT NULL,
  is_validated TINYINT(1) NOT NULL DEFAULT 0,
  votes_count INT NOT NULL DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_failure_patterns_validated (is_validated, votes_count)
);

CREATE TABLE IF NOT EXISTS negative_results_contributor_stats (
  researcher_id VARCHAR(64) PRIMARY KEY,
  total_negative_results_shared INT NOT NULL DEFAULT 0,
  public_negative_results_count INT NOT NULL DEFAULT 0,
  total_citations INT NOT NULL DEFAULT 0,
  total_helpful_votes INT NOT NULL DEFAULT 0,
  total_saved_someone_votes INT NOT NULL DEFAULT 0,
  overall_trust_score DECIMAL(8,2) NOT NULL DEFAULT 0,
  transparency_badges TEXT NULL,
  last_calculated DATETIME NULL,
  INDEX idx_nr_contributor_trust (overall_trust_score)
);

CREATE TABLE IF NOT EXISTS user_ai_failure_patterns (
  user_id VARCHAR(64) NOT NULL,
  task_type VARCHAR(255) NOT NULL,
  error_pattern VARCHAR(255) NOT NULL,
  correction TEXT NULL,
  occurrence_count INT NOT NULL DEFAULT 1,
  last_occurrence DATETIME NULL,
  PRIMARY KEY (user_id, task_type, error_pattern)
);

-- Saves already exist as negative_result_saves. Handlers also store reason and estimates.
SET @db := DATABASE();

SET @exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'negative_result_saves' AND COLUMN_NAME = 'save_reason'
);
SET @sql := IF(@exists = 0,
  'ALTER TABLE negative_result_saves
     ADD COLUMN save_reason VARCHAR(100) NULL,
     ADD COLUMN notes TEXT NULL,
     ADD COLUMN avoided_repeating_mistake TINYINT(1) NULL,
     ADD COLUMN estimated_time_saved_hours DECIMAL(10,2) NULL,
     ADD COLUMN estimated_cost_saved_usd DECIMAL(12,2) NULL,
     ADD COLUMN saved_at DATETIME NULL DEFAULT CURRENT_TIMESTAMP',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- New rows only. Existing accounts keep their current role and status.
ALTER TABLE users MODIFY COLUMN role VARCHAR(100) NOT NULL DEFAULT 'student';
ALTER TABLE users MODIFY COLUMN status VARCHAR(50) DEFAULT 'active';

-- Match users.utf8mb4_general_ci so joins on user_id do not fail collation checks.
ALTER TABLE calendar_events CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;
ALTER TABLE instrument_maintenance CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;
ALTER TABLE resource_exchange_requests CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;
ALTER TABLE resource_exchange_offers CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;
ALTER TABLE data_templates CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;
ALTER TABLE experiment_risks CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;
ALTER TABLE experiment_comments CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;
ALTER TABLE successful_alternatives CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;
ALTER TABLE failure_patterns CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;
ALTER TABLE negative_results_contributor_stats CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;
ALTER TABLE user_ai_failure_patterns CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;
ALTER TABLE negative_result_saves CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;
