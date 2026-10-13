-- Forms CRUD alignment (MySQL)
-- research_data, research_events, databank, service marketplace core tables

SET FOREIGN_KEY_CHECKS = 0;

CREATE TABLE IF NOT EXISTS research_data (
  id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL,
  lab_id VARCHAR(64) NULL,
  title VARCHAR(255) NOT NULL,
  type VARCHAR(50) NOT NULL DEFAULT 'experiment',
  category VARCHAR(50) NOT NULL DEFAULT 'other',
  status VARCHAR(20) DEFAULT 'draft',
  summary TEXT,
  description TEXT,
  methodology TEXT,
  results TEXT,
  conclusions TEXT,
  tags TEXT,
  files JSON,
  metadata JSON,
  privacy_level VARCHAR(20) DEFAULT 'lab',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_research_data_user (user_id),
  INDEX idx_research_data_lab (lab_id),
  INDEX idx_research_data_type (type),
  INDEX idx_research_data_created (created_at)
);

CREATE TABLE IF NOT EXISTS research_events (
  id VARCHAR(64) PRIMARY KEY,
  created_by VARCHAR(64) NOT NULL,
  title VARCHAR(255) NOT NULL,
  event_type VARCHAR(50) NOT NULL DEFAULT 'conference',
  description TEXT,
  organizer VARCHAR(255),
  institution VARCHAR(255),
  location VARCHAR(255),
  country VARCHAR(100),
  start_date DATE,
  end_date DATE,
  application_deadline DATE,
  max_participants INT DEFAULT 0,
  current_participants INT DEFAULT 0,
  cost DECIMAL(12,2) DEFAULT 0,
  currency VARCHAR(10) DEFAULT 'USD',
  has_stipend TINYINT(1) DEFAULT 0,
  stipend_amount DECIMAL(12,2) NULL,
  requirements TEXT,
  skills_required TEXT,
  benefits TEXT,
  website VARCHAR(500),
  contact_email VARCHAR(255),
  status VARCHAR(20) DEFAULT 'upcoming',
  is_published TINYINT(1) DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_research_events_type (event_type),
  INDEX idx_research_events_status (status),
  INDEX idx_research_events_start (start_date)
);

CREATE TABLE IF NOT EXISTS research_event_bookmarks (
  id VARCHAR(64) PRIMARY KEY,
  event_id VARCHAR(64) NOT NULL,
  user_id VARCHAR(64) NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_event_user_bookmark (event_id, user_id),
  FOREIGN KEY (event_id) REFERENCES research_events(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS research_event_applications (
  id VARCHAR(64) PRIMARY KEY,
  event_id VARCHAR(64) NOT NULL,
  user_id VARCHAR(64) NOT NULL,
  status VARCHAR(20) DEFAULT 'applied',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_event_user_application (event_id, user_id),
  FOREIGN KEY (event_id) REFERENCES research_events(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS databank_organizations (
  id VARCHAR(64) PRIMARY KEY,
  created_by VARCHAR(64) NULL,
  name VARCHAR(255) NOT NULL,
  type VARCHAR(100),
  category VARCHAR(100),
  country VARCHAR(100),
  region VARCHAR(100),
  contact_email VARCHAR(255),
  website VARCHAR(500),
  description TEXT,
  specializations TEXT,
  verified TINYINT(1) DEFAULT 0,
  rating DECIMAL(3,2) DEFAULT 0,
  joined_date DATETIME DEFAULT CURRENT_TIMESTAMP,
  last_active DATETIME DEFAULT CURRENT_TIMESTAMP,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_databank_orgs_country (country),
  INDEX idx_databank_orgs_type (type)
);

CREATE TABLE IF NOT EXISTS databank_data_offers (
  id VARCHAR(64) PRIMARY KEY,
  organization_id VARCHAR(64) NOT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  data_type VARCHAR(100),
  disease_focus TEXT,
  population_type VARCHAR(100),
  sample_size INT DEFAULT 0,
  geographic_coverage TEXT,
  time_period VARCHAR(100),
  access_level VARCHAR(50) DEFAULT 'request',
  requirements TEXT,
  contact_person VARCHAR(255),
  last_updated DATETIME DEFAULT CURRENT_TIMESTAMP,
  request_count INT DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (organization_id) REFERENCES databank_organizations(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS databank_data_requests (
  id VARCHAR(64) PRIMARY KEY,
  data_offer_id VARCHAR(64) NULL,
  requester_name VARCHAR(255),
  requester_institution VARCHAR(255),
  requester_email VARCHAR(255),
  purpose TEXT,
  methodology TEXT,
  timeline VARCHAR(100),
  collaboration_proposed TEXT,
  additional_notes TEXT,
  status VARCHAR(20) DEFAULT 'pending',
  response TEXT,
  notes TEXT,
  submitted_date DATETIME DEFAULT CURRENT_TIMESTAMP,
  response_date DATETIME NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_databank_requests_offer (data_offer_id)
);

CREATE TABLE IF NOT EXISTS service_categories (
  id VARCHAR(64) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  parent_id VARCHAR(64) NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS service_listings (
  id VARCHAR(64) PRIMARY KEY,
  provider_id VARCHAR(64) NOT NULL,
  service_title VARCHAR(255) NOT NULL,
  service_description TEXT,
  category_id VARCHAR(64) NULL,
  service_type VARCHAR(100) DEFAULT 'data_analysis',
  expertise_areas TEXT,
  techniques_offered TEXT,
  software_tools TEXT,
  pricing_model VARCHAR(50) DEFAULT 'project_based',
  base_price DECIMAL(12,2) DEFAULT 0,
  currency VARCHAR(10) DEFAULT 'USD',
  price_range_min DECIMAL(12,2) NULL,
  price_range_max DECIMAL(12,2) NULL,
  typical_turnaround_days INT DEFAULT 7,
  requirements_description TEXT,
  deliverables_description TEXT,
  currently_accepting_projects TINYINT(1) DEFAULT 1,
  is_active TINYINT(1) DEFAULT 1,
  average_rating DECIMAL(3,2) DEFAULT 0,
  total_ratings INT DEFAULT 0,
  total_projects_completed INT DEFAULT 0,
  inquiries_count INT NOT NULL DEFAULT 0,
  tags TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_service_listings_provider (provider_id),
  INDEX idx_service_listings_type (service_type),
  INDEX idx_service_listings_active (is_active)
);

SET FOREIGN_KEY_CHECKS = 1;
