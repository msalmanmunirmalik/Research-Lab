-- AI training data table (MySQL)
SET FOREIGN_KEY_CHECKS = 0;

CREATE TABLE IF NOT EXISTS ai_training_data (
  id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL,
  source_type VARCHAR(100) NOT NULL,
  source_id VARCHAR(64) NOT NULL,
  content TEXT,
  metadata TEXT,
  processed TINYINT(1) DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_training_source (user_id, source_type, source_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

SET FOREIGN_KEY_CHECKS = 1;
