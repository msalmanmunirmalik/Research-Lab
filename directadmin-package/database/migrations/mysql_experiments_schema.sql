-- Experiment tracker schema (MySQL)
SET FOREIGN_KEY_CHECKS = 0;

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

CREATE TABLE IF NOT EXISTS experiments (
  id VARCHAR(64) PRIMARY KEY,
  title VARCHAR(255),
  description TEXT,
  hypothesis TEXT,
  objectives TEXT,
  methodology TEXT,
  expected_outcomes TEXT,
  status VARCHAR(100) DEFAULT 'planning',
  priority VARCHAR(100) DEFAULT 'medium',
  category VARCHAR(255),
  estimated_duration INT,
  actual_duration INT DEFAULT 0,
  start_date DATE,
  end_date DATE,
  due_date DATE,
  lab_id VARCHAR(64),
  researcher_id VARCHAR(64),
  collaborators TEXT,
  equipment TEXT,
  materials TEXT,
  reagents TEXT,
  safety_requirements TEXT,
  budget DECIMAL(12,2) DEFAULT 0,
  tags TEXT,
  notes TEXT,
  template_id VARCHAR(64),
  actual_cost DECIMAL(12,2) DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
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
  FOREIGN KEY (experiment_id) REFERENCES experiments(id) ON DELETE CASCADE
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
  FOREIGN KEY (experiment_id) REFERENCES experiments(id) ON DELETE CASCADE
);

SET FOREIGN_KEY_CHECKS = 1;
