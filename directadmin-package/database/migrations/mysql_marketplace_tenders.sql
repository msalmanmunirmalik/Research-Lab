-- Marketplace tenders / RFPs (browse & contact by email; no bids on platform).

SET FOREIGN_KEY_CHECKS = 0;

CREATE TABLE IF NOT EXISTS marketplace_tenders (
  id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL,
  title VARCHAR(255) NOT NULL,
  organization VARCHAR(255) NULL,
  contact_email VARCHAR(255) NOT NULL,
  contact_phone VARCHAR(64) NULL,
  location VARCHAR(255) NULL,
  country VARCHAR(100) NULL,
  description TEXT,
  category VARCHAR(100) NULL,
  budget_note VARCHAR(255) NULL,
  deadline DATE NULL,
  requirements TEXT,
  is_active TINYINT(1) DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_marketplace_tenders_user (user_id),
  INDEX idx_marketplace_tenders_active (is_active),
  INDEX idx_marketplace_tenders_deadline (deadline),
  INDEX idx_marketplace_tenders_category (category)
);

SET FOREIGN_KEY_CHECKS = 1;
