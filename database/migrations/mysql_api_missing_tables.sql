-- Missing tables/columns commonly referenced by live API routes (MySQL)

SET FOREIGN_KEY_CHECKS = 0;

-- Messaging
CREATE TABLE IF NOT EXISTS conversations (
  id VARCHAR(64) PRIMARY KEY,
  type VARCHAR(20) NOT NULL DEFAULT 'direct',
  name VARCHAR(255) NULL,
  created_by VARCHAR(64) NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_conversations_updated (updated_at)
);

CREATE TABLE IF NOT EXISTS conversation_participants (
  id VARCHAR(64) PRIMARY KEY,
  conversation_id VARCHAR(64) NOT NULL,
  user_id VARCHAR(64) NOT NULL,
  joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_conversation_user (conversation_id, user_id),
  INDEX idx_cp_user (user_id)
);

CREATE TABLE IF NOT EXISTS messages (
  id VARCHAR(64) PRIMARY KEY,
  conversation_id VARCHAR(64) NOT NULL,
  sender_id VARCHAR(64) NOT NULL,
  content TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_messages_conversation (conversation_id, created_at)
);

-- Protocol executions
CREATE TABLE IF NOT EXISTS protocol_executions (
  id VARCHAR(64) PRIMARY KEY,
  protocol_id VARCHAR(64) NOT NULL,
  protocol_title VARCHAR(255) NULL,
  user_id VARCHAR(64) NOT NULL,
  start_time DATETIME NULL,
  end_time DATETIME NULL,
  total_duration_ms BIGINT NULL,
  completed_steps LONGTEXT NULL,
  notes LONGTEXT NULL,
  photos LONGTEXT NULL,
  deviations LONGTEXT NULL,
  success TINYINT(1) NOT NULL DEFAULT 1,
  issues LONGTEXT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_protocol_executions_protocol (protocol_id),
  INDEX idx_protocol_executions_user (user_id)
);

-- protocols is created later by mysql_migration.sql. Skip when this file runs first.
SET @db := DATABASE();
SET @has_protocols := (
  SELECT COUNT(*) FROM information_schema.TABLES
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'protocols'
);
SET @sql := IF(@has_protocols = 0, 'SELECT 1',
  'ALTER TABLE protocols ADD COLUMN IF NOT EXISTS usage_count INT NOT NULL DEFAULT 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @sql := IF(@has_protocols = 0, 'SELECT 1',
  'ALTER TABLE protocols ADD COLUMN IF NOT EXISTS last_used_at DATETIME NULL');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @sql := IF(@has_protocols = 0, 'SELECT 1',
  'ALTER TABLE protocols ADD COLUMN IF NOT EXISTS success_count INT NOT NULL DEFAULT 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Marketplace requests / portfolio
CREATE TABLE IF NOT EXISTS service_requests (
  id VARCHAR(64) PRIMARY KEY,
  service_id VARCHAR(64) NOT NULL,
  provider_id VARCHAR(64) NOT NULL,
  client_id VARCHAR(64) NOT NULL,
  project_title VARCHAR(255) NOT NULL,
  project_description TEXT NULL,
  specific_requirements TEXT NULL,
  desired_start_date DATE NULL,
  desired_completion_date DATE NULL,
  urgency_level VARCHAR(50) NULL,
  budget_range_min DECIMAL(14,2) NULL,
  budget_range_max DECIMAL(14,2) NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'pending',
  provider_response TEXT NULL,
  provider_responded_at DATETIME NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_service_requests_client (client_id),
  INDEX idx_service_requests_provider (provider_id),
  INDEX idx_service_requests_service (service_id)
);

CREATE TABLE IF NOT EXISTS service_portfolio_items (
  id VARCHAR(64) PRIMARY KEY,
  service_id VARCHAR(64) NOT NULL,
  provider_id VARCHAR(64) NOT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT NULL,
  project_type VARCHAR(100) NULL,
  challenge_description TEXT NULL,
  solution_description TEXT NULL,
  results_description TEXT NULL,
  techniques_used TEXT NULL,
  tools_used TEXT NULL,
  project_duration_days INT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_portfolio_service (service_id)
);

-- service_listings is created later by mysql_forms_crud_alignment.sql.
SET @has_listings := (
  SELECT COUNT(*) FROM information_schema.TABLES
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'service_listings'
);
SET @sql := IF(@has_listings = 0, 'SELECT 1',
  'ALTER TABLE service_listings ADD COLUMN IF NOT EXISTS inquiries_count INT NOT NULL DEFAULT 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @sql := IF(@has_listings = 0, 'SELECT 1',
  'ALTER TABLE service_listings ADD COLUMN IF NOT EXISTS provider_id VARCHAR(64) NULL');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Professional protocols (simplified MySQL shape; JSON/TEXT for complex fields)
CREATE TABLE IF NOT EXISTS professional_protocols (
  id VARCHAR(64) PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  description TEXT NULL,
  protocol_type VARCHAR(100) NULL,
  category VARCHAR(100) NULL,
  subcategory VARCHAR(100) NULL,
  version VARCHAR(50) NULL,
  difficulty_level VARCHAR(50) NULL,
  skill_requirements TEXT NULL,
  estimated_duration_minutes INT NULL,
  estimated_cost_usd DECIMAL(12,2) NULL,
  cost_per_sample DECIMAL(12,2) NULL,
  safety_level VARCHAR(50) NULL,
  biosafety_requirements TEXT NULL,
  chemical_hazards TEXT NULL,
  biological_hazards TEXT NULL,
  ppe_required TEXT NULL,
  objective TEXT NULL,
  background TEXT NULL,
  hypothesis TEXT NULL,
  reagents LONGTEXT NULL,
  equipment LONGTEXT NULL,
  consumables LONGTEXT NULL,
  preparation_steps LONGTEXT NULL,
  procedure_steps LONGTEXT NULL,
  post_processing_steps LONGTEXT NULL,
  positive_controls TEXT NULL,
  negative_controls TEXT NULL,
  quality_checkpoints LONGTEXT NULL,
  troubleshooting_guide LONGTEXT NULL,
  expected_results TEXT NULL,
  data_analysis_methods TEXT NULL,
  interpretation_guidelines TEXT NULL,
  common_pitfalls TEXT NULL,
  literature_references TEXT NULL,
  protocol_references TEXT NULL,
  supplier_information LONGTEXT NULL,
  privacy_level VARCHAR(50) DEFAULT 'lab',
  sharing_permissions LONGTEXT NULL,
  access_level VARCHAR(50) NULL,
  status VARCHAR(50) DEFAULT 'draft',
  validation_level VARCHAR(50) NULL,
  tags TEXT NULL,
  keywords TEXT NULL,
  lab_id VARCHAR(64) NULL,
  created_by VARCHAR(64) NULL,
  last_modified_by VARCHAR(64) NULL,
  search_vector TEXT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_prof_protocols_lab (lab_id),
  INDEX idx_prof_protocols_created_by (created_by),
  INDEX idx_prof_protocols_status (status)
);

-- PeerCred core
CREATE TABLE IF NOT EXISTS peercred_users (
  id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL,
  profile_complete TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_peercred_user (user_id)
);

CREATE TABLE IF NOT EXISTS reference_analytics (
  id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL,
  average_rating DECIMAL(4,2) NULL,
  reference_consistency DECIMAL(4,2) NULL,
  verification_rate DECIMAL(4,2) NULL,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_reference_analytics_user (user_id)
);

CREATE TABLE IF NOT EXISTS work_relationships (
  id VARCHAR(64) PRIMARY KEY,
  user1_id VARCHAR(64) NOT NULL,
  user2_id VARCHAR(64) NOT NULL,
  company_name VARCHAR(255) NULL,
  project_name VARCHAR(255) NULL,
  relationship_type VARCHAR(100) NULL,
  start_date DATE NULL,
  end_date DATE NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_work_rel (user1_id, user2_id, company_name, project_name)
);

CREATE TABLE IF NOT EXISTS reference_requests (
  id VARCHAR(64) PRIMARY KEY,
  requester_id VARCHAR(64) NOT NULL,
  referee_id VARCHAR(64) NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'pending',
  message TEXT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_ref_req_referee (referee_id)
);

CREATE TABLE IF NOT EXISTS reference_responses (
  id VARCHAR(64) PRIMARY KEY,
  request_id VARCHAR(64) NOT NULL,
  rating INT NULL,
  response_text TEXT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_ref_resp_request (request_id)
);

SET FOREIGN_KEY_CHECKS = 1;
