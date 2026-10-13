-- Writing Studio: documents + citation library

CREATE TABLE IF NOT EXISTS writing_documents (
  id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL,
  doc_type VARCHAR(40) NOT NULL DEFAULT 'research_paper',
  template_id VARCHAR(100) NOT NULL DEFAULT 'paper_imrad_journal',
  title VARCHAR(500),
  status VARCHAR(30) NOT NULL DEFAULT 'draft',
  citation_style VARCHAR(40) DEFAULT 'APA',
  content JSON,
  metadata JSON,
  content_revision INT NOT NULL DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_writing_docs_user (user_id),
  INDEX idx_writing_docs_type (doc_type),
  INDEX idx_writing_docs_updated (updated_at)
);

CREATE TABLE IF NOT EXISTS writing_citations (
  id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL,
  title VARCHAR(1000) NOT NULL,
  authors JSON,
  year INT NULL,
  journal VARCHAR(500) NULL,
  volume VARCHAR(64) NULL,
  issue VARCHAR(64) NULL,
  pages VARCHAR(64) NULL,
  doi VARCHAR(255) NULL,
  url VARCHAR(1000) NULL,
  abstract TEXT NULL,
  citation_key VARCHAR(120) NULL,
  source_type VARCHAR(40) DEFAULT 'article',
  raw_bibtex MEDIUMTEXT NULL,
  csl_json JSON NULL,
  notes TEXT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_writing_citations_user (user_id),
  INDEX idx_writing_citations_doi (doi),
  INDEX idx_writing_citations_key (citation_key)
);

CREATE TABLE IF NOT EXISTS writing_document_citations (
  document_id VARCHAR(64) NOT NULL,
  citation_id VARCHAR(64) NOT NULL,
  sort_order INT DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (document_id, citation_id),
  INDEX idx_wdc_citation (citation_id)
);
