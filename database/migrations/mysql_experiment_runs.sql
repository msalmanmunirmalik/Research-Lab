-- Bench runs (attempts) under an experiment study
SET FOREIGN_KEY_CHECKS = 0;

CREATE TABLE IF NOT EXISTS experiment_runs (
  id VARCHAR(64) PRIMARY KEY,
  experiment_id VARCHAR(64) NOT NULL,
  user_id VARCHAR(64) NOT NULL,
  recorded_at DATETIME NOT NULL,
  title VARCHAR(255) NULL,
  modifications TEXT,
  observations TEXT,
  outcome_summary TEXT,
  status VARCHAR(32) NOT NULL DEFAULT 'completed',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_experiment_runs_experiment (experiment_id),
  INDEX idx_experiment_runs_recorded (recorded_at),
  FOREIGN KEY (experiment_id) REFERENCES experiments(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

SET FOREIGN_KEY_CHECKS = 1;
