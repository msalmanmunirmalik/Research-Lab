-- Protocol sharing table (MySQL)
SET FOREIGN_KEY_CHECKS = 0;

CREATE TABLE IF NOT EXISTS protocol_sharing (
  id VARCHAR(64) PRIMARY KEY,
  protocol_id VARCHAR(64) NOT NULL,
  shared_with_lab_id VARCHAR(64),
  shared_with_user_id VARCHAR(64),
  permission_level VARCHAR(100) DEFAULT 'read',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (protocol_id) REFERENCES protocols(id) ON DELETE CASCADE,
  FOREIGN KEY (shared_with_lab_id) REFERENCES labs(id) ON DELETE SET NULL,
  FOREIGN KEY (shared_with_user_id) REFERENCES users(id) ON DELETE SET NULL
);

SET FOREIGN_KEY_CHECKS = 1;
