-- Public protocols.io saves and DRM adaptations.
-- Does not copy the protocols.io catalog. A row is written only when a user saves or adapts.

CREATE TABLE IF NOT EXISTS external_protocols (
  id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL,
  provider VARCHAR(64) NOT NULL DEFAULT 'protocols.io',
  external_id VARCHAR(128) NOT NULL,
  title VARCHAR(500) NOT NULL,
  description TEXT,
  authors TEXT,
  doi VARCHAR(255) NULL,
  source_url VARCHAR(1000) NULL,
  version VARCHAR(50) NULL,
  published_on DATETIME NULL,
  license VARCHAR(100) NOT NULL DEFAULT 'CC-BY',
  categories TEXT,
  materials TEXT,
  equipment TEXT,
  steps TEXT,
  timing TEXT,
  safety_notes TEXT,
  retrieved_at DATETIME NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_external_protocol_user (user_id, provider, external_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

ALTER TABLE protocols
  ADD COLUMN IF NOT EXISTS source_name VARCHAR(100) NULL,
  ADD COLUMN IF NOT EXISTS source_url VARCHAR(1000) NULL,
  ADD COLUMN IF NOT EXISTS source_doi VARCHAR(255) NULL,
  ADD COLUMN IF NOT EXISTS source_license VARCHAR(100) NULL,
  ADD COLUMN IF NOT EXISTS source_attribution TEXT NULL,
  ADD COLUMN IF NOT EXISTS adapted_from_external_id VARCHAR(64) NULL;
