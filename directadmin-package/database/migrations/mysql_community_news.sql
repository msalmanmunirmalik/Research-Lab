-- Community news & updates feed (shared by any authenticated user)

SET FOREIGN_KEY_CHECKS = 0;

CREATE TABLE IF NOT EXISTS community_posts (
  id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL,
  author_name VARCHAR(255) NULL,
  title VARCHAR(500) NOT NULL,
  body TEXT NOT NULL,
  post_type VARCHAR(32) NOT NULL DEFAULT 'update',
  tags JSON NULL,
  link_url VARCHAR(1000) NULL,
  is_published TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_community_posts_user (user_id),
  INDEX idx_community_posts_type (post_type),
  INDEX idx_community_posts_published_created (is_published, created_at)
);

SET FOREIGN_KEY_CHECKS = 1;
