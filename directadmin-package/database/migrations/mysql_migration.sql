-- Core schema for ResearchLab (MySQL)
-- Uses utf8mb4 for full Unicode support.

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

CREATE TABLE IF NOT EXISTS users (
  id VARCHAR(64) PRIMARY KEY,
  username VARCHAR(255) UNIQUE NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  first_name VARCHAR(255),
  last_name VARCHAR(255),
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(100) NOT NULL DEFAULT 'Research Assistant',
  avatar_url TEXT,
  status VARCHAR(50) DEFAULT 'Offline',
  email_verified TINYINT(1) DEFAULT 0,
  last_login DATETIME,
  expertise TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS protocols (
  id VARCHAR(64) PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  category VARCHAR(255),
  difficulty_level VARCHAR(100),
  estimated_duration INT,
  materials TEXT,
  content TEXT,
  safety_notes TEXT,
  lab_id VARCHAR(64),
  privacy_level VARCHAR(100) DEFAULT 'lab',
  is_approved TINYINT(1) DEFAULT 1,
  tags TEXT,
  author_id VARCHAR(64) NOT NULL,
  last_updated DATETIME DEFAULT CURRENT_TIMESTAMP,
  version VARCHAR(50) DEFAULT '1.0.0',
  access_level VARCHAR(50) DEFAULT 'Lab Only',
  discussion_count INT DEFAULT 0,
  video_url TEXT,
  forked_from VARCHAR(64),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (author_id) REFERENCES users(id),
  FOREIGN KEY (forked_from) REFERENCES protocols(id)
);

CREATE TABLE IF NOT EXISTS protocol_steps (
  id VARCHAR(64) PRIMARY KEY,
  protocol_id VARCHAR(64) NOT NULL,
  step_number INT NOT NULL,
  description TEXT NOT NULL,
  details TEXT,
  safety_warning TEXT,
  materials TEXT,
  duration_minutes INT,
  calculator_data TEXT,
  video_timestamp TEXT,
  conditional_data TEXT,
  FOREIGN KEY (protocol_id) REFERENCES protocols(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS protocol_attachments (
  id VARCHAR(64) PRIMARY KEY,
  protocol_id VARCHAR(64) NOT NULL,
  name VARCHAR(255) NOT NULL,
  url TEXT NOT NULL,
  type VARCHAR(100) NOT NULL,
  FOREIGN KEY (protocol_id) REFERENCES protocols(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS projects (
  id VARCHAR(64) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  owner_id VARCHAR(64) NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (owner_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS experiments (
  id VARCHAR(64) PRIMARY KEY,
  project_id VARCHAR(64) NOT NULL,
  name VARCHAR(255) NOT NULL,
  goal TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS notebook_entries (
  id VARCHAR(64) PRIMARY KEY,
  experiment_id VARCHAR(64) NOT NULL,
  title VARCHAR(255) NOT NULL,
  author_id VARCHAR(64) NOT NULL,
  protocol_id VARCHAR(64),
  status VARCHAR(50) DEFAULT 'In Progress',
  summary TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  last_modified DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (experiment_id) REFERENCES experiments(id) ON DELETE CASCADE,
  FOREIGN KEY (author_id) REFERENCES users(id),
  FOREIGN KEY (protocol_id) REFERENCES protocols(id)
);

CREATE TABLE IF NOT EXISTS content_blocks (
  id VARCHAR(64) PRIMARY KEY,
  entry_id VARCHAR(64) NOT NULL,
  type VARCHAR(50) NOT NULL,
  data TEXT NOT NULL,
  order_index INT NOT NULL,
  FOREIGN KEY (entry_id) REFERENCES notebook_entries(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS inventory_items (
  id VARCHAR(64) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  type VARCHAR(100) NOT NULL,
  supplier VARCHAR(255),
  catalog_number VARCHAR(255),
  location VARCHAR(255),
  quantity_value DECIMAL(12,4) NOT NULL,
  quantity_unit VARCHAR(50) NOT NULL,
  lot_number VARCHAR(255),
  expiration_date DATE,
  low_stock_threshold DECIMAL(12,4),
  sds_url TEXT,
  last_updated DATETIME DEFAULT CURRENT_TIMESTAMP,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS instruments (
  id VARCHAR(64) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  type VARCHAR(100) NOT NULL,
  location VARCHAR(255) NOT NULL,
  status VARCHAR(50) DEFAULT 'Operational',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS bookings (
  id VARCHAR(64) PRIMARY KEY,
  instrument_id VARCHAR(64) NOT NULL,
  user_id VARCHAR(64) NOT NULL,
  title VARCHAR(255) NOT NULL,
  start_time DATETIME NOT NULL,
  end_time DATETIME NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (instrument_id) REFERENCES instruments(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS results (
  id VARCHAR(64) PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  author_id VARCHAR(64) NOT NULL,
  protocol_id VARCHAR(64),
  summary TEXT,
  tags TEXT,
  data_preview TEXT,
  source VARCHAR(50) DEFAULT 'Manual',
  notebook_entry_id VARCHAR(64),
  insights TEXT,
  next_steps TEXT,
  pitfalls TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (author_id) REFERENCES users(id),
  FOREIGN KEY (protocol_id) REFERENCES protocols(id),
  FOREIGN KEY (notebook_entry_id) REFERENCES notebook_entries(id)
);

CREATE TABLE IF NOT EXISTS help_requests (
  id VARCHAR(64) PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  author_id VARCHAR(64) NOT NULL,
  protocol_id VARCHAR(64),
  description TEXT NOT NULL,
  status VARCHAR(50) DEFAULT 'Open',
  tags TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (author_id) REFERENCES users(id),
  FOREIGN KEY (protocol_id) REFERENCES protocols(id)
);

CREATE TABLE IF NOT EXISTS scratchpad_items (
  id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL,
  calculator_name VARCHAR(255) NOT NULL,
  inputs TEXT NOT NULL,
  result TEXT NOT NULL,
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

SET FOREIGN_KEY_CHECKS = 1;
