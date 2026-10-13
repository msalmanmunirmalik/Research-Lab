-- QA P0 schema alignment: columns/tables the live API expects
SET FOREIGN_KEY_CHECKS = 0;

-- Labs
ALTER TABLE labs ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE labs ADD COLUMN IF NOT EXISTS principal_researcher_id VARCHAR(64);
ALTER TABLE labs ADD COLUMN IF NOT EXISTS contact_email VARCHAR(255);
ALTER TABLE labs ADD COLUMN IF NOT EXISTS contact_phone VARCHAR(100);
ALTER TABLE labs ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE labs ADD COLUMN IF NOT EXISTS website_url TEXT;
ALTER TABLE labs ADD COLUMN IF NOT EXISTS updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP;

-- Users profile/settings fields
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone VARCHAR(50);
ALTER TABLE users ADD COLUMN IF NOT EXISTS department VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS specialization VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS bio TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS current_position VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS current_institution VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS location VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS timezone VARCHAR(100);
ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_visibility VARCHAR(100) DEFAULT 'lab';
ALTER TABLE users ADD COLUMN IF NOT EXISTS show_email TINYINT(1) DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS show_phone TINYINT(1) DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS show_location TINYINT(1) DEFAULT 0;

-- Inventory columns expected by API
ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS lab_id VARCHAR(64);
ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS category VARCHAR(255);
ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS quantity DECIMAL(12,4);
ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS min_quantity DECIMAL(12,4) DEFAULT 0;
ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS unit VARCHAR(50);
ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS expiry_date DATE;
ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS cost_per_unit DECIMAL(12,2);
ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS supplier_contact TEXT;
ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS storage_conditions TEXT;
ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS created_by VARCHAR(64);

-- Instruments extras used by booking/list queries
ALTER TABLE instruments ADD COLUMN IF NOT EXISTS lab_id VARCHAR(64);
ALTER TABLE instruments ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE instruments ADD COLUMN IF NOT EXISTS model VARCHAR(255);
ALTER TABLE instruments ADD COLUMN IF NOT EXISTS manufacturer VARCHAR(255);

-- Experiments tracker columns
ALTER TABLE experiments ADD COLUMN IF NOT EXISTS title VARCHAR(255);
ALTER TABLE experiments ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE experiments ADD COLUMN IF NOT EXISTS hypothesis TEXT;
ALTER TABLE experiments ADD COLUMN IF NOT EXISTS objectives TEXT;
ALTER TABLE experiments ADD COLUMN IF NOT EXISTS methodology TEXT;
ALTER TABLE experiments ADD COLUMN IF NOT EXISTS expected_outcomes TEXT;
ALTER TABLE experiments ADD COLUMN IF NOT EXISTS status VARCHAR(100) DEFAULT 'planning';
ALTER TABLE experiments ADD COLUMN IF NOT EXISTS priority VARCHAR(100) DEFAULT 'medium';
ALTER TABLE experiments ADD COLUMN IF NOT EXISTS category VARCHAR(255);
ALTER TABLE experiments ADD COLUMN IF NOT EXISTS estimated_duration INT;
ALTER TABLE experiments ADD COLUMN IF NOT EXISTS actual_duration INT DEFAULT 0;
ALTER TABLE experiments ADD COLUMN IF NOT EXISTS start_date DATE;
ALTER TABLE experiments ADD COLUMN IF NOT EXISTS end_date DATE;
ALTER TABLE experiments ADD COLUMN IF NOT EXISTS due_date DATE;
ALTER TABLE experiments ADD COLUMN IF NOT EXISTS lab_id VARCHAR(64);
ALTER TABLE experiments ADD COLUMN IF NOT EXISTS researcher_id VARCHAR(64);
ALTER TABLE experiments ADD COLUMN IF NOT EXISTS collaborators TEXT;
ALTER TABLE experiments ADD COLUMN IF NOT EXISTS equipment TEXT;
ALTER TABLE experiments ADD COLUMN IF NOT EXISTS materials TEXT;
ALTER TABLE experiments ADD COLUMN IF NOT EXISTS reagents TEXT;
ALTER TABLE experiments ADD COLUMN IF NOT EXISTS safety_requirements TEXT;
ALTER TABLE experiments ADD COLUMN IF NOT EXISTS budget DECIMAL(12,2) DEFAULT 0;
ALTER TABLE experiments ADD COLUMN IF NOT EXISTS tags TEXT;
ALTER TABLE experiments ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE experiments ADD COLUMN IF NOT EXISTS template_id VARCHAR(64);
ALTER TABLE experiments ADD COLUMN IF NOT EXISTS actual_cost DECIMAL(12,2) DEFAULT 0;
ALTER TABLE experiments ADD COLUMN IF NOT EXISTS updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP;

-- Backfill title from legacy name when that column exists (thin experiments table).
SET @has_experiment_name := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'experiments' AND COLUMN_NAME = 'name'
);
SET @sql := IF(@has_experiment_name = 0, 'SELECT 1',
  'UPDATE experiments SET title = name WHERE (title IS NULL OR title = '''') AND name IS NOT NULL');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

CREATE TABLE IF NOT EXISTS experiment_templates (
  id VARCHAR(64) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  category VARCHAR(255),
  description TEXT,
  methodology TEXT,
  estimated_duration INT,
  equipment TEXT,
  materials TEXT,
  reagents TEXT,
  safety_requirements TEXT,
  created_by VARCHAR(64),
  is_public TINYINT(1) DEFAULT 1,
  usage_count INT DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS experiment_milestones (
  id VARCHAR(64) PRIMARY KEY,
  experiment_id VARCHAR(64) NOT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  due_date DATE,
  status VARCHAR(100) DEFAULT 'pending',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_exp_milestones_exp (experiment_id)
);

CREATE TABLE IF NOT EXISTS experiment_progress_logs (
  id VARCHAR(64) PRIMARY KEY,
  experiment_id VARCHAR(64) NOT NULL,
  user_id VARCHAR(64) NOT NULL,
  status VARCHAR(100),
  notes TEXT,
  duration_logged INT DEFAULT 0,
  cost_logged DECIMAL(12,2) DEFAULT 0,
  attachments TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_exp_progress_exp (experiment_id)
);

-- Compliance / cookies
CREATE TABLE IF NOT EXISTS legal_policies (
  id VARCHAR(64) PRIMARY KEY,
  type VARCHAR(50) NOT NULL,
  title VARCHAR(255) NOT NULL,
  content LONGTEXT,
  version VARCHAR(50) DEFAULT '1.0',
  language VARCHAR(10) DEFAULT 'en',
  effective_date DATE,
  is_active TINYINT(1) DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_legal_policies_type (type, language, is_active)
);

CREATE TABLE IF NOT EXISTS consents (
  id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(64),
  anonymous_id VARCHAR(128),
  policy_type VARCHAR(50) NOT NULL,
  policy_id VARCHAR(64),
  granted TINYINT(1) DEFAULT 0,
  source VARCHAR(100),
  ip_address VARCHAR(64),
  user_agent TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_consents_user (user_id),
  INDEX idx_consents_anon (anonymous_id)
);

CREATE TABLE IF NOT EXISTS cookie_consents (
  id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(64),
  anonymous_id VARCHAR(128),
  necessary TINYINT(1) DEFAULT 1,
  analytics TINYINT(1) DEFAULT 0,
  marketing TINYINT(1) DEFAULT 0,
  preferences TINYINT(1) DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS gdpr_requests (
  id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(64),
  email VARCHAR(255),
  request_type VARCHAR(50) NOT NULL,
  status VARCHAR(50) DEFAULT 'PENDING',
  verification_token VARCHAR(128),
  verified_at DATETIME,
  processed_by_id VARCHAR(64),
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS retention_policies (
  id VARCHAR(64) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  data_type VARCHAR(100) NOT NULL,
  retention_period INT NOT NULL,
  action VARCHAR(50) NOT NULL,
  legal_basis VARCHAR(255),
  description TEXT,
  is_active TINYINT(1) DEFAULT 1,
  last_executed_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS platform_activities (
  id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL,
  activity_type VARCHAR(100) NOT NULL,
  activity_title VARCHAR(255),
  activity_description TEXT,
  activity_data TEXT,
  skills_demonstrated TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_platform_activities_user (user_id)
);

CREATE TABLE IF NOT EXISTS user_ai_content (
  id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL,
  source_type VARCHAR(100) NOT NULL,
  source_id VARCHAR(64) NOT NULL,
  content_text LONGTEXT,
  processed TINYINT(1) DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_user_ai_content_user (user_id),
  INDEX idx_user_ai_content_source (source_type, source_id)
);

-- Seed minimal cookie/privacy policies if empty
INSERT INTO legal_policies (id, type, title, content, version, language, effective_date, is_active)
SELECT UUID(), 'cookies', 'Cookie Policy', 'We use necessary cookies to run Digital Research Manager. Analytics and marketing cookies are optional.', '1.0', 'en', CURDATE(), 1
WHERE NOT EXISTS (SELECT 1 FROM legal_policies WHERE type = 'cookies' AND language = 'en' AND is_active = 1);

INSERT INTO legal_policies (id, type, title, content, version, language, effective_date, is_active)
SELECT UUID(), 'privacy', 'Privacy Policy', 'Digital Research Manager processes account and research data to provide lab collaboration features.', '1.0', 'en', CURDATE(), 1
WHERE NOT EXISTS (SELECT 1 FROM legal_policies WHERE type = 'privacy' AND language = 'en' AND is_active = 1);

SET FOREIGN_KEY_CHECKS = 1;
