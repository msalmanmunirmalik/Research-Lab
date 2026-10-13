-- Cross-module research workflow links (Phase 1)
-- experiments ↔ protocols; notebook ↔ protocol/experiment; results ↔ protocol/experiment/notebook

SET @db := DATABASE();

-- experiments.protocol_id
SET @exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'experiments' AND COLUMN_NAME = 'protocol_id'
);
SET @sql := IF(@exists = 0,
  'ALTER TABLE experiments ADD COLUMN protocol_id VARCHAR(64) NULL AFTER template_id, ADD INDEX idx_experiments_protocol (protocol_id)',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- experiments.notebook_entry_id (optional origin note)
SET @exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'experiments' AND COLUMN_NAME = 'notebook_entry_id'
);
SET @sql := IF(@exists = 0,
  'ALTER TABLE experiments ADD COLUMN notebook_entry_id VARCHAR(64) NULL AFTER protocol_id, ADD INDEX idx_experiments_notebook (notebook_entry_id)',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- lab_notebook_entries.protocol_id
SET @exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'lab_notebook_entries' AND COLUMN_NAME = 'protocol_id'
);
SET @sql := IF(@exists = 0,
  'ALTER TABLE lab_notebook_entries ADD COLUMN protocol_id VARCHAR(64) NULL AFTER project_id, ADD INDEX idx_notebook_protocol (protocol_id)',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- lab_notebook_entries.experiment_id
SET @exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'lab_notebook_entries' AND COLUMN_NAME = 'experiment_id'
);
SET @sql := IF(@exists = 0,
  'ALTER TABLE lab_notebook_entries ADD COLUMN experiment_id VARCHAR(64) NULL AFTER protocol_id, ADD INDEX idx_notebook_experiment (experiment_id)',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- research_data.protocol_id
SET @exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'research_data' AND COLUMN_NAME = 'protocol_id'
);
SET @sql := IF(@exists = 0,
  'ALTER TABLE research_data ADD COLUMN protocol_id VARCHAR(64) NULL AFTER lab_id, ADD INDEX idx_research_data_protocol (protocol_id)',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- research_data.experiment_id
SET @exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'research_data' AND COLUMN_NAME = 'experiment_id'
);
SET @sql := IF(@exists = 0,
  'ALTER TABLE research_data ADD COLUMN experiment_id VARCHAR(64) NULL AFTER protocol_id, ADD INDEX idx_research_data_experiment (experiment_id)',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- research_data.notebook_entry_id
SET @exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'research_data' AND COLUMN_NAME = 'notebook_entry_id'
);
SET @sql := IF(@exists = 0,
  'ALTER TABLE research_data ADD COLUMN notebook_entry_id VARCHAR(64) NULL AFTER experiment_id, ADD INDEX idx_research_data_notebook (notebook_entry_id)',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
