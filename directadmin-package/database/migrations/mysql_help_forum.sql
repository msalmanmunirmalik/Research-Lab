-- Help forum: expand requests + responses for owner CRUD
-- Apply columns only if missing (run statements individually if needed)

ALTER TABLE help_requests ADD COLUMN category VARCHAR(64) DEFAULT 'General';
ALTER TABLE help_requests ADD COLUMN urgency VARCHAR(32) DEFAULT 'Medium';
ALTER TABLE help_requests ADD COLUMN visibility VARCHAR(32) DEFAULT 'public';
ALTER TABLE help_requests ADD COLUMN posted_by_name VARCHAR(255) NULL;
ALTER TABLE help_requests ADD COLUMN upvotes INT DEFAULT 0;
ALTER TABLE help_requests ADD COLUMN views INT DEFAULT 0;
ALTER TABLE help_requests ADD COLUMN updated_at DATETIME NULL;
ALTER TABLE help_requests ADD COLUMN resolved_at DATETIME NULL;
ALTER TABLE help_requests MODIFY status VARCHAR(32) DEFAULT 'Open';

CREATE TABLE IF NOT EXISTS help_responses (
  id VARCHAR(64) PRIMARY KEY,
  request_id VARCHAR(64) NOT NULL,
  author_id VARCHAR(64) NOT NULL,
  posted_by_name VARCHAR(255) NULL,
  content TEXT NOT NULL,
  is_solution TINYINT(1) DEFAULT 0,
  upvotes INT DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NULL,
  INDEX idx_help_resp_request (request_id)
);
