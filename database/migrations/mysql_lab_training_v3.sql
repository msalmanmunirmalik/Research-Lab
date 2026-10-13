-- Tools & Trainings v3: shareable slug + course introduction body

ALTER TABLE lab_trainings
  ADD COLUMN IF NOT EXISTS slug VARCHAR(140) NULL,
  ADD COLUMN IF NOT EXISTS introduction LONGTEXT NULL;

-- Unique slug within a lab (NULLs allowed for legacy rows until backfilled)
SET @idx_exists := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'lab_trainings'
    AND INDEX_NAME = 'uq_lab_trainings_lab_slug'
);
SET @sql := IF(
  @idx_exists = 0,
  'ALTER TABLE lab_trainings ADD UNIQUE KEY uq_lab_trainings_lab_slug (lab_id, slug)',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
