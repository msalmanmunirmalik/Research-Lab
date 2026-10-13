-- Private researcher wellbeing check-ins (RILOS pillar 7)
-- Voluntary, user-owned, never exposed via lab admin APIs.
SET FOREIGN_KEY_CHECKS = 0;

CREATE TABLE IF NOT EXISTS researcher_wellbeing_checkins (
  id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL,
  workload TINYINT NOT NULL,
  energy TINYINT NOT NULL,
  note TEXT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_wellbeing_user_created (user_id, created_at),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

SET FOREIGN_KEY_CHECKS = 1;
