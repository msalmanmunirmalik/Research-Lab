-- Lab follow + join-request flows for Networking directory

SET FOREIGN_KEY_CHECKS = 0;

CREATE TABLE IF NOT EXISTS lab_follows (
  id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL,
  lab_id VARCHAR(64) NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_lab_follows (user_id, lab_id),
  INDEX idx_lab_follows_user (user_id),
  INDEX idx_lab_follows_lab (lab_id)
);

CREATE TABLE IF NOT EXISTS lab_join_requests (
  id VARCHAR(64) PRIMARY KEY,
  lab_id VARCHAR(64) NOT NULL,
  requester_id VARCHAR(64) NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'pending',
  message TEXT NULL,
  reviewed_by VARCHAR(64) NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_lab_join_pair (lab_id, requester_id),
  INDEX idx_lab_join_lab (lab_id),
  INDEX idx_lab_join_requester (requester_id),
  INDEX idx_lab_join_status (status)
);

SET FOREIGN_KEY_CHECKS = 1;
