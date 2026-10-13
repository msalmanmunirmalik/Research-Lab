-- AI provider keys/configs tables (MySQL)
SET FOREIGN_KEY_CHECKS = 0;

CREATE TABLE IF NOT EXISTS ai_provider_configs (
  provider VARCHAR(100) PRIMARY KEY,
  provider_name VARCHAR(255),
  supports_embeddings TINYINT(1) DEFAULT 1,
  supports_chat TINYINT(1) DEFAULT 1,
  embedding_endpoint TEXT,
  chat_endpoint TEXT,
  embedding_price_per_million DECIMAL(10,4),
  chat_price_per_million DECIMAL(10,4),
  max_context_length INT,
  is_active TINYINT(1) DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS ai_provider_keys (
  id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL,
  provider VARCHAR(100) NOT NULL,
  provider_name VARCHAR(255),
  encrypted_api_key TEXT NOT NULL,
  is_active TINYINT(1) DEFAULT 1,
  last_used_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY unique_user_provider (user_id, provider),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (provider) REFERENCES ai_provider_configs(provider) ON DELETE CASCADE
);

SET FOREIGN_KEY_CHECKS = 1;
