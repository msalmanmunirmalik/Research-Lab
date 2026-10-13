-- API task → provider key assignments (MySQL)
SET FOREIGN_KEY_CHECKS = 0;

CREATE TABLE IF NOT EXISTS api_task_assignments (
  id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL,
  api_key_id VARCHAR(64) NOT NULL,
  task_type VARCHAR(100) NOT NULL,
  task_name VARCHAR(200) NOT NULL,
  priority INT DEFAULT 1,
  is_active TINYINT(1) DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY unique_user_key_task (user_id, api_key_id, task_type),
  KEY idx_user_task (user_id, task_type, is_active),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (api_key_id) REFERENCES ai_provider_keys(id) ON DELETE CASCADE
);

SET FOREIGN_KEY_CHECKS = 1;
