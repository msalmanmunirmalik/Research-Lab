-- Tracker-style experiments do not require a legacy projects row.
-- Safe on DBs that never had project_id (shape-heal / greenfield schema).

SET @db := DATABASE();

SET @has_col := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'experiments' AND COLUMN_NAME = 'project_id'
);

SET @sql := IF(
  @has_col = 0,
  'SELECT 1',
  'ALTER TABLE experiments DROP FOREIGN KEY experiments_ibfk_1'
);
SET @fk_exists := (
  SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'experiments'
    AND CONSTRAINT_NAME = 'experiments_ibfk_1' AND CONSTRAINT_TYPE = 'FOREIGN KEY'
);
SET @sql := IF(@has_col = 0 OR @fk_exists = 0, 'SELECT 1', @sql);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := IF(
  @has_col = 0,
  'SELECT 1',
  'ALTER TABLE experiments MODIFY COLUMN project_id VARCHAR(64) NULL'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
