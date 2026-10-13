-- Patch existing experiments table with tracker columns.
-- mysql_experiments_schema.sql creates the table when this file runs first on a fresh database.
SET @has_experiments := (
  SELECT COUNT(*) FROM information_schema.TABLES
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'experiments'
);
SET @sql := IF(@has_experiments = 0, 'SELECT 1', '
ALTER TABLE experiments
  ADD COLUMN IF NOT EXISTS title VARCHAR(255),
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS hypothesis TEXT,
  ADD COLUMN IF NOT EXISTS objectives TEXT,
  ADD COLUMN IF NOT EXISTS methodology TEXT,
  ADD COLUMN IF NOT EXISTS expected_outcomes TEXT,
  ADD COLUMN IF NOT EXISTS status VARCHAR(100) DEFAULT ''planning'',
  ADD COLUMN IF NOT EXISTS priority VARCHAR(100) DEFAULT ''medium'',
  ADD COLUMN IF NOT EXISTS category VARCHAR(255),
  ADD COLUMN IF NOT EXISTS estimated_duration INT,
  ADD COLUMN IF NOT EXISTS actual_duration INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS start_date DATE,
  ADD COLUMN IF NOT EXISTS end_date DATE,
  ADD COLUMN IF NOT EXISTS due_date DATE,
  ADD COLUMN IF NOT EXISTS lab_id VARCHAR(64),
  ADD COLUMN IF NOT EXISTS researcher_id VARCHAR(64),
  ADD COLUMN IF NOT EXISTS collaborators TEXT,
  ADD COLUMN IF NOT EXISTS equipment TEXT,
  ADD COLUMN IF NOT EXISTS materials TEXT,
  ADD COLUMN IF NOT EXISTS reagents TEXT,
  ADD COLUMN IF NOT EXISTS safety_requirements TEXT,
  ADD COLUMN IF NOT EXISTS budget DECIMAL(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tags TEXT,
  ADD COLUMN IF NOT EXISTS notes TEXT,
  ADD COLUMN IF NOT EXISTS template_id VARCHAR(64),
  ADD COLUMN IF NOT EXISTS actual_cost DECIMAL(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
