-- Community post engagement: likes, comments, saves

CREATE TABLE IF NOT EXISTS community_post_likes (
  id VARCHAR(64) PRIMARY KEY,
  post_id VARCHAR(64) NOT NULL,
  user_id VARCHAR(64) NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_community_like (post_id, user_id),
  INDEX idx_community_likes_post (post_id),
  INDEX idx_community_likes_user (user_id)
);

CREATE TABLE IF NOT EXISTS community_post_comments (
  id VARCHAR(64) PRIMARY KEY,
  post_id VARCHAR(64) NOT NULL,
  user_id VARCHAR(64) NOT NULL,
  author_name VARCHAR(255) NULL,
  body TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NULL,
  INDEX idx_community_comments_post (post_id),
  INDEX idx_community_comments_user (user_id)
);

CREATE TABLE IF NOT EXISTS community_post_saves (
  id VARCHAR(64) PRIMARY KEY,
  post_id VARCHAR(64) NOT NULL,
  user_id VARCHAR(64) NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_community_save (post_id, user_id),
  INDEX idx_community_saves_post (post_id),
  INDEX idx_community_saves_user (user_id)
);
