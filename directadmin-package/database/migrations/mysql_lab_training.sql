-- Lab Training & Orientation curricula (MySQL)
-- Lab-authored modules: orientation, safety, techniques, etc.
-- Media: video URL + markdown/document text (protocol-style; no binary hosting in v1)

SET FOREIGN_KEY_CHECKS = 0;

CREATE TABLE IF NOT EXISTS lab_trainings (
  id VARCHAR(64) PRIMARY KEY,
  lab_id VARCHAR(64) NOT NULL,
  title VARCHAR(255) NOT NULL,
  summary TEXT,
  category VARCHAR(64) NOT NULL DEFAULT 'orientation',
  audience VARCHAR(64) NOT NULL DEFAULT 'all',
  estimated_minutes INT DEFAULT 30,
  is_required TINYINT(1) DEFAULT 0,
  sort_order INT DEFAULT 0,
  status VARCHAR(32) NOT NULL DEFAULT 'published',
  created_by VARCHAR(64) NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_lab_trainings_lab (lab_id),
  INDEX idx_lab_trainings_category (lab_id, category),
  INDEX idx_lab_trainings_status (lab_id, status)
);

CREATE TABLE IF NOT EXISTS lab_training_items (
  id VARCHAR(64) PRIMARY KEY,
  training_id VARCHAR(64) NOT NULL,
  title VARCHAR(255) NOT NULL,
  item_type VARCHAR(32) NOT NULL DEFAULT 'document',
  -- document | video | link | checklist
  content_markdown LONGTEXT,
  video_url VARCHAR(1000),
  external_url VARCHAR(1000),
  checklist_json LONGTEXT,
  estimated_minutes INT DEFAULT 10,
  sort_order INT DEFAULT 0,
  is_required TINYINT(1) DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_lab_training_items_training (training_id),
  CONSTRAINT fk_lab_training_items_training
    FOREIGN KEY (training_id) REFERENCES lab_trainings(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS lab_training_item_completions (
  id VARCHAR(64) PRIMARY KEY,
  training_id VARCHAR(64) NOT NULL,
  item_id VARCHAR(64) NOT NULL,
  user_id VARCHAR(64) NOT NULL,
  lab_id VARCHAR(64) NOT NULL,
  completed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  notes TEXT,
  UNIQUE KEY uq_lab_training_item_user (item_id, user_id),
  INDEX idx_lab_training_completions_user (lab_id, user_id),
  INDEX idx_lab_training_completions_training (training_id, user_id),
  CONSTRAINT fk_lab_training_comp_item
    FOREIGN KEY (item_id) REFERENCES lab_training_items(id) ON DELETE CASCADE,
  CONSTRAINT fk_lab_training_comp_training
    FOREIGN KEY (training_id) REFERENCES lab_trainings(id) ON DELETE CASCADE
);

SET FOREIGN_KEY_CHECKS = 1;
