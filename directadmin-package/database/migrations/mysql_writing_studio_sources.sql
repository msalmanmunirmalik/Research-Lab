-- Writing Studio Phase A/B: source-grounded citations

SET @db := DATABASE();

SET @exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'writing_citations' AND COLUMN_NAME = 'source_text'
);
SET @sql := IF(@exists = 0,
  'ALTER TABLE writing_citations ADD COLUMN source_text MEDIUMTEXT NULL AFTER notes',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @exists2 := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'writing_citations' AND COLUMN_NAME = 'pdf_path'
);
SET @sql2 := IF(@exists2 = 0,
  'ALTER TABLE writing_citations ADD COLUMN pdf_path VARCHAR(1000) NULL AFTER source_text',
  'SELECT 1');
PREPARE stmt FROM @sql2; EXECUTE stmt; DEALLOCATE PREPARE stmt;
