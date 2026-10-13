-- Sprint 3: experiments has the tracker shape even if the thin table was created first.
-- Adds only missing columns. Does not drop name, goal, or project_id.
-- No foreign keys.

SET @db := DATABASE();

ALTER TABLE experiments
  ADD COLUMN IF NOT EXISTS title VARCHAR(255) NULL,
  ADD COLUMN IF NOT EXISTS description TEXT NULL,
  ADD COLUMN IF NOT EXISTS hypothesis TEXT NULL,
  ADD COLUMN IF NOT EXISTS objectives TEXT NULL,
  ADD COLUMN IF NOT EXISTS methodology TEXT NULL,
  ADD COLUMN IF NOT EXISTS expected_outcomes TEXT NULL,
  ADD COLUMN IF NOT EXISTS status VARCHAR(100) NULL DEFAULT 'planning',
  ADD COLUMN IF NOT EXISTS priority VARCHAR(100) NULL DEFAULT 'medium',
  ADD COLUMN IF NOT EXISTS category VARCHAR(255) NULL,
  ADD COLUMN IF NOT EXISTS estimated_duration INT NULL,
  ADD COLUMN IF NOT EXISTS actual_duration INT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS start_date DATE NULL,
  ADD COLUMN IF NOT EXISTS end_date DATE NULL,
  ADD COLUMN IF NOT EXISTS due_date DATE NULL,
  ADD COLUMN IF NOT EXISTS lab_id VARCHAR(64) NULL,
  ADD COLUMN IF NOT EXISTS researcher_id VARCHAR(64) NULL,
  ADD COLUMN IF NOT EXISTS collaborators TEXT NULL,
  ADD COLUMN IF NOT EXISTS equipment TEXT NULL,
  ADD COLUMN IF NOT EXISTS materials TEXT NULL,
  ADD COLUMN IF NOT EXISTS reagents TEXT NULL,
  ADD COLUMN IF NOT EXISTS safety_requirements TEXT NULL,
  ADD COLUMN IF NOT EXISTS budget DECIMAL(12,2) NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tags TEXT NULL,
  ADD COLUMN IF NOT EXISTS notes TEXT NULL,
  ADD COLUMN IF NOT EXISTS template_id VARCHAR(64) NULL,
  ADD COLUMN IF NOT EXISTS actual_cost DECIMAL(12,2) NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS updated_at DATETIME NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  ADD COLUMN IF NOT EXISTS protocol_id VARCHAR(64) NULL,
  ADD COLUMN IF NOT EXISTS notebook_entry_id VARCHAR(64) NULL;

-- Copy the legacy name into title only where title is empty and the name column exists.
SET @has_name := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'experiments' AND COLUMN_NAME = 'name'
);
SET @sql := IF(@has_name = 0, 'SELECT 1',
  'UPDATE experiments SET title = name WHERE (title IS NULL OR title = '''') AND name IS NOT NULL');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has_idx := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'experiments' AND INDEX_NAME = 'idx_experiments_lab'
);
SET @sql := IF(@has_idx = 0, 'ALTER TABLE experiments ADD INDEX idx_experiments_lab (lab_id)', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has_idx := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'experiments' AND INDEX_NAME = 'idx_experiments_protocol'
);
SET @sql := IF(@has_idx = 0, 'ALTER TABLE experiments ADD INDEX idx_experiments_protocol (protocol_id)', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has_idx := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'experiments' AND INDEX_NAME = 'idx_experiments_researcher'
);
SET @sql := IF(@has_idx = 0, 'ALTER TABLE experiments ADD INDEX idx_experiments_researcher (researcher_id)', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
