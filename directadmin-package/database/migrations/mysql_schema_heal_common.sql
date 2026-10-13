-- Heal gaps that commonly cause API 500s (idempotent where possible).
-- Safe to re-run on MariaDB (ADD COLUMN IF NOT EXISTS) and via migrate statement fallback.

SET FOREIGN_KEY_CHECKS = 0;

-- Users: profile / recommender fields
ALTER TABLE users ADD COLUMN IF NOT EXISTS research_interests TEXT NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS research_field VARCHAR(255) NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS orcid VARCHAR(50) NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS google_scholar_url TEXT NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS linkedin_url TEXT NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS website_url TEXT NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS skills TEXT NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS looking_for TEXT NULL;

-- Labs showcase (if showcase migration never ran)
ALTER TABLE labs ADD COLUMN IF NOT EXISTS is_showcased TINYINT(1) NOT NULL DEFAULT 0;
ALTER TABLE labs ADD COLUMN IF NOT EXISTS showcased_at DATETIME NULL;
ALTER TABLE labs ADD COLUMN IF NOT EXISTS showcase_tagline VARCHAR(280) NULL;
ALTER TABLE labs ADD COLUMN IF NOT EXISTS research_areas TEXT NULL;
ALTER TABLE labs ADD COLUMN IF NOT EXISTS looking_for TEXT NULL;
ALTER TABLE labs ADD COLUMN IF NOT EXISTS lab_type VARCHAR(50) NULL;
ALTER TABLE labs ADD COLUMN IF NOT EXISTS established_year INT NULL;

-- Research data workflow links
ALTER TABLE research_data ADD COLUMN IF NOT EXISTS protocol_id VARCHAR(64) NULL;
ALTER TABLE research_data ADD COLUMN IF NOT EXISTS experiment_id VARCHAR(64) NULL;
ALTER TABLE research_data ADD COLUMN IF NOT EXISTS notebook_entry_id VARCHAR(64) NULL;

-- Experiments workflow links
ALTER TABLE experiments ADD COLUMN IF NOT EXISTS protocol_id VARCHAR(64) NULL;
ALTER TABLE experiments ADD COLUMN IF NOT EXISTS notebook_entry_id VARCHAR(64) NULL;

-- Notebook workflow links
ALTER TABLE lab_notebook_entries ADD COLUMN IF NOT EXISTS protocol_id VARCHAR(64) NULL;
ALTER TABLE lab_notebook_entries ADD COLUMN IF NOT EXISTS experiment_id VARCHAR(64) NULL;

SET FOREIGN_KEY_CHECKS = 1;
