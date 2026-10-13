-- Persist Lab Floors choice-floor + roleplay progress per user (RILOS Learn pillar)
SET FOREIGN_KEY_CHECKS = 0;

CREATE TABLE IF NOT EXISTS lab_floors_progress (
  user_id VARCHAR(64) PRIMARY KEY,
  floors_json JSON NOT NULL,
  roleplay_json JSON NOT NULL,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

SET FOREIGN_KEY_CHECKS = 1;
