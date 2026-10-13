-- Vector embeddings for protocol search + grant semantic matching (MySQL JSON vectors)
SET FOREIGN_KEY_CHECKS = 0;

CREATE TABLE IF NOT EXISTS protocol_embeddings (
  protocol_id VARCHAR(64) PRIMARY KEY,
  content_hash VARCHAR(64) NOT NULL,
  embedding LONGTEXT NOT NULL,
  embedding_model VARCHAR(100) NULL,
  embedding_provider VARCHAR(100) NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_protocol_embeddings_updated (updated_at)
);

CREATE TABLE IF NOT EXISTS grant_embeddings (
  grant_id VARCHAR(64) PRIMARY KEY,
  content_hash VARCHAR(64) NOT NULL,
  embedding LONGTEXT NOT NULL,
  embedding_model VARCHAR(100) NULL,
  embedding_provider VARCHAR(100) NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_grant_embeddings_updated (updated_at)
);

SET FOREIGN_KEY_CHECKS = 1;
