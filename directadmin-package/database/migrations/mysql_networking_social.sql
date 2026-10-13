-- Networking social graph: follows + connection requests

SET FOREIGN_KEY_CHECKS = 0;

CREATE TABLE IF NOT EXISTS user_follows (
  id VARCHAR(64) PRIMARY KEY,
  follower_id VARCHAR(64) NOT NULL,
  following_id VARCHAR(64) NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_user_follows (follower_id, following_id),
  INDEX idx_user_follows_follower (follower_id),
  INDEX idx_user_follows_following (following_id)
);

CREATE TABLE IF NOT EXISTS user_connections (
  id VARCHAR(64) PRIMARY KEY,
  requester_id VARCHAR(64) NOT NULL,
  recipient_id VARCHAR(64) NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'pending',
  message TEXT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_user_connections_pair (requester_id, recipient_id),
  INDEX idx_user_connections_requester (requester_id),
  INDEX idx_user_connections_recipient (recipient_id),
  INDEX idx_user_connections_status (status)
);

SET FOREIGN_KEY_CHECKS = 1;
