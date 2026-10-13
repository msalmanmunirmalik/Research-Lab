-- Write Together: multi-author collaboration on Writing Studio documents

SET @db := DATABASE();
SET @q := (
  SELECT IF(
    NOT EXISTS(
      SELECT 1 FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'writing_documents'
    )
    OR EXISTS(
      SELECT 1 FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'writing_documents' AND COLUMN_NAME = 'content_revision'
    ),
    'SELECT 1',
    'ALTER TABLE writing_documents ADD COLUMN content_revision INT NOT NULL DEFAULT 1'
  )
);
PREPARE stmt FROM @q;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

CREATE TABLE IF NOT EXISTS writing_collaborators (
  id VARCHAR(64) PRIMARY KEY,
  document_id VARCHAR(64) NOT NULL,
  user_id VARCHAR(64) NOT NULL,
  role VARCHAR(32) NOT NULL DEFAULT 'editor',
  access_scope VARCHAR(20) NOT NULL DEFAULT 'entire',
  section_ids JSON NULL,
  invited_by VARCHAR(64) NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  joined_at DATETIME NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_writing_collab_doc_user (document_id, user_id),
  INDEX idx_wc_user (user_id),
  INDEX idx_wc_doc (document_id),
  INDEX idx_wc_status (status)
);

CREATE TABLE IF NOT EXISTS writing_invitations (
  id VARCHAR(64) PRIMARY KEY,
  document_id VARCHAR(64) NOT NULL,
  token VARCHAR(64) NOT NULL,
  invited_by VARCHAR(64) NOT NULL,
  email VARCHAR(320) NULL,
  invited_user_id VARCHAR(64) NULL,
  role VARCHAR(32) NOT NULL DEFAULT 'editor',
  access_scope VARCHAR(20) NOT NULL DEFAULT 'entire',
  section_ids JSON NULL,
  message TEXT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  expires_at DATETIME NULL,
  accepted_at DATETIME NULL,
  accepted_by VARCHAR(64) NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_writing_invite_token (token),
  INDEX idx_wi_doc (document_id),
  INDEX idx_wi_email (email),
  INDEX idx_wi_user (invited_user_id),
  INDEX idx_wi_status (status)
);

CREATE TABLE IF NOT EXISTS writing_section_locks (
  document_id VARCHAR(64) NOT NULL,
  section_id VARCHAR(120) NOT NULL,
  user_id VARCHAR(64) NOT NULL,
  display_name VARCHAR(200) NULL,
  locked_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  heartbeat_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (document_id, section_id),
  INDEX idx_wsl_user (user_id),
  INDEX idx_wsl_heartbeat (heartbeat_at)
);

CREATE TABLE IF NOT EXISTS writing_presence (
  document_id VARCHAR(64) NOT NULL,
  user_id VARCHAR(64) NOT NULL,
  display_name VARCHAR(200) NULL,
  section_id VARCHAR(120) NULL,
  color VARCHAR(16) NULL,
  last_seen_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (document_id, user_id),
  INDEX idx_wp_seen (last_seen_at)
);
