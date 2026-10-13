-- Lab networking showcase: labs stay private until the owner opts in.
-- Compatible with MySQL versions without ADD COLUMN IF NOT EXISTS.

-- is_showcased TINYINT(1) NOT NULL DEFAULT 0
-- showcased_at DATETIME NULL
-- showcase_tagline VARCHAR(280) NULL
-- research_areas TEXT NULL  (JSON array string)
-- looking_for TEXT NULL     (JSON array string)
-- lab_type VARCHAR(50) NULL
-- established_year INT NULL

ALTER TABLE labs ADD COLUMN is_showcased TINYINT(1) NOT NULL DEFAULT 0;
ALTER TABLE labs ADD COLUMN showcased_at DATETIME NULL;
ALTER TABLE labs ADD COLUMN showcase_tagline VARCHAR(280) NULL;
ALTER TABLE labs ADD COLUMN research_areas TEXT NULL;
ALTER TABLE labs ADD COLUMN looking_for TEXT NULL;
ALTER TABLE labs ADD COLUMN lab_type VARCHAR(50) NULL;
ALTER TABLE labs ADD COLUMN established_year INT NULL;
