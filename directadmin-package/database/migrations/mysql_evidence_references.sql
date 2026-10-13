-- Evidence & References: canonical papers + library + collections + chunks + cache

CREATE TABLE IF NOT EXISTS papers (
  id VARCHAR(64) PRIMARY KEY,
  title VARCHAR(2000) NOT NULL,
  abstract MEDIUMTEXT NULL,
  publication_type VARCHAR(80) NULL,
  publication_year INT NULL,
  publication_date VARCHAR(32) NULL,
  doi VARCHAR(255) NULL,
  pmid VARCHAR(32) NULL,
  pmcid VARCHAR(32) NULL,
  openalex_id VARCHAR(64) NULL,
  semantic_scholar_id VARCHAR(64) NULL,
  journal_name VARCHAR(500) NULL,
  journal_issn VARCHAR(64) NULL,
  publisher VARCHAR(500) NULL,
  volume VARCHAR(64) NULL,
  issue VARCHAR(64) NULL,
  pages VARCHAR(64) NULL,
  authors JSON NULL,
  affiliations JSON NULL,
  keywords JSON NULL,
  mesh_terms JSON NULL,
  topics JSON NULL,
  citation_count INT NULL DEFAULT 0,
  is_open_access TINYINT(1) NOT NULL DEFAULT 0,
  open_access_status VARCHAR(64) NULL,
  open_access_url VARCHAR(1000) NULL,
  pdf_url VARCHAR(1000) NULL,
  source_url VARCHAR(1000) NULL,
  metadata_source VARCHAR(64) NULL,
  metadata_available TINYINT(1) NOT NULL DEFAULT 1,
  abstract_available TINYINT(1) NOT NULL DEFAULT 0,
  full_text_available TINYINT(1) NOT NULL DEFAULT 0,
  pdf_available TINYINT(1) NOT NULL DEFAULT 0,
  pdf_access_type VARCHAR(40) NULL,
  normalized_title VARCHAR(2000) NULL,
  metadata_last_updated_at DATETIME NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_papers_doi (doi),
  UNIQUE KEY uq_papers_pmid (pmid),
  UNIQUE KEY uq_papers_openalex (openalex_id),
  INDEX idx_papers_year (publication_year),
  INDEX idx_papers_title (normalized_title(191)),
  INDEX idx_papers_pmcid (pmcid)
);

CREATE TABLE IF NOT EXISTS paper_identifiers (
  id VARCHAR(64) PRIMARY KEY,
  paper_id VARCHAR(64) NOT NULL,
  id_type VARCHAR(40) NOT NULL,
  id_value VARCHAR(255) NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_paper_id_type_value (id_type, id_value),
  INDEX idx_paper_identifiers_paper (paper_id)
);

CREATE TABLE IF NOT EXISTS user_library_items (
  id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL,
  paper_id VARCHAR(64) NOT NULL,
  project_id VARCHAR(64) NULL,
  is_favorite TINYINT(1) NOT NULL DEFAULT 0,
  tags JSON NULL,
  notes MEDIUMTEXT NULL,
  user_pdf_path VARCHAR(1000) NULL,
  user_pdf_text MEDIUMTEXT NULL,
  citation_key VARCHAR(120) NULL,
  writing_citation_id VARCHAR(64) NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_user_paper (user_id, paper_id),
  INDEX idx_uli_user (user_id),
  INDEX idx_uli_paper (paper_id),
  INDEX idx_uli_project (project_id),
  INDEX idx_uli_favorite (user_id, is_favorite)
);

CREATE TABLE IF NOT EXISTS reference_collections (
  id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT NULL,
  project_id VARCHAR(64) NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_ref_collections_user (user_id)
);

CREATE TABLE IF NOT EXISTS reference_collection_items (
  collection_id VARCHAR(64) NOT NULL,
  paper_id VARCHAR(64) NOT NULL,
  sort_order INT DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (collection_id, paper_id),
  INDEX idx_rci_paper (paper_id)
);

CREATE TABLE IF NOT EXISTS paper_chunks (
  id VARCHAR(64) PRIMARY KEY,
  paper_id VARCHAR(64) NOT NULL,
  user_id VARCHAR(64) NULL,
  page_number INT NULL,
  section_name VARCHAR(120) NULL,
  chunk_index INT NOT NULL DEFAULT 0,
  chunk_text MEDIUMTEXT NOT NULL,
  embedding JSON NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_paper_chunks_paper (paper_id),
  INDEX idx_paper_chunks_user (user_id)
);

CREATE TABLE IF NOT EXISTS scholarly_cache (
  cache_key VARCHAR(191) PRIMARY KEY,
  payload MEDIUMTEXT NOT NULL,
  expires_at DATETIME NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_scholarly_cache_expires (expires_at)
);

CREATE TABLE IF NOT EXISTS scholarly_audit_events (
  id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL,
  event_type VARCHAR(80) NOT NULL,
  metadata JSON NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_scholarly_audit_user (user_id),
  INDEX idx_scholarly_audit_type (event_type)
);
