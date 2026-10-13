-- Minimal MySQL schema for Negative Results feature
SET FOREIGN_KEY_CHECKS = 0;

CREATE TABLE IF NOT EXISTS negative_results (
  id VARCHAR(64) PRIMARY KEY,
  researcher_id VARCHAR(64) NULL,
  lab_id VARCHAR(64) NULL,
  experiment_title VARCHAR(500) NOT NULL,
  research_field VARCHAR(255) NULL,
  research_domain VARCHAR(255) NULL,
  keywords TEXT NULL,
  original_hypothesis TEXT NULL,
  expected_outcome TEXT NULL,
  theoretical_basis TEXT NULL,
  literature_citations TEXT NULL,
  actual_outcome TEXT NULL,
  unexpected_observations TEXT NULL,
  failure_type VARCHAR(100) NULL,
  primary_reason TEXT NULL,
  secondary_reasons TEXT NULL,
  contributing_factors TEXT NULL,
  reproduction_attempts INT DEFAULT 0,
  consistent_failure TINYINT(1) DEFAULT 0,
  variations_tested TEXT NULL,
  methodology_description TEXT NULL,
  protocol_used_id VARCHAR(64) NULL,
  materials_used TEXT NULL,
  equipment_used TEXT NULL,
  key_parameters TEXT NULL,
  experimental_conditions TEXT NULL,
  lessons_learned TEXT NULL,
  recommendations_for_others TEXT NULL,
  alternative_approaches_suggested TEXT NULL,
  what_would_you_try_instead TEXT NULL,
  estimated_cost_usd DECIMAL(12,2) DEFAULT 0,
  time_spent_hours DECIMAL(10,2) DEFAULT 0,
  sharing_status VARCHAR(50) DEFAULT 'public',
  is_publicly_searchable TINYINT(1) DEFAULT 1,
  allow_citations TINYINT(1) DEFAULT 1,
  anonymous_sharing TINYINT(1) DEFAULT 0,
  experiment_date DATE NULL,
  tags TEXT NULL,
  helpful_votes INT DEFAULT 0,
  saved_someone_votes INT DEFAULT 0,
  citation_count INT DEFAULT 0,
  views_count INT DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_nr_researcher (researcher_id),
  INDEX idx_nr_field (research_field),
  INDEX idx_nr_sharing (sharing_status)
);

CREATE TABLE IF NOT EXISTS negative_result_comments (
  id VARCHAR(64) PRIMARY KEY,
  negative_result_id VARCHAR(64) NOT NULL,
  user_id VARCHAR(64) NULL,
  comment TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_nrc_result (negative_result_id)
);

CREATE TABLE IF NOT EXISTS negative_result_votes (
  id VARCHAR(64) PRIMARY KEY,
  negative_result_id VARCHAR(64) NOT NULL,
  user_id VARCHAR(64) NOT NULL,
  vote_type VARCHAR(50) NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_nr_vote (negative_result_id, user_id, vote_type)
);

CREATE TABLE IF NOT EXISTS negative_result_saves (
  id VARCHAR(64) PRIMARY KEY,
  negative_result_id VARCHAR(64) NOT NULL,
  user_id VARCHAR(64) NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_nr_save (negative_result_id, user_id)
);

SET FOREIGN_KEY_CHECKS = 1;
