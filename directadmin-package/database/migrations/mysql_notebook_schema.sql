-- Personal NoteBook schema (MySQL)
SET FOREIGN_KEY_CHECKS = 0;

CREATE TABLE IF NOT EXISTS labs (
  id VARCHAR(64) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  institution VARCHAR(255),
  department VARCHAR(255),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS lab_members (
  id VARCHAR(64) PRIMARY KEY,
  lab_id VARCHAR(64) NOT NULL,
  user_id VARCHAR(64) NOT NULL,
  role VARCHAR(100) DEFAULT 'student',
  permissions TEXT,
  is_active TINYINT(1) DEFAULT 1,
  joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (lab_id) REFERENCES labs(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS lab_notebook_entries (
  id VARCHAR(64) PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  content TEXT,
  entry_type VARCHAR(100),
  status VARCHAR(100),
  priority VARCHAR(100),
  objectives TEXT,
  methodology TEXT,
  results TEXT,
  conclusions TEXT,
  next_steps TEXT,
  lab_id VARCHAR(64),
  project_id VARCHAR(64),
  user_id VARCHAR(64) NOT NULL,
  privacy_level VARCHAR(100) DEFAULT 'lab',
  tags TEXT,
  estimated_duration INT DEFAULT 0,
  actual_duration INT DEFAULT 0,
  cost DECIMAL(12,2) DEFAULT 0,
  equipment_used TEXT,
  materials_used TEXT,
  safety_notes TEXT,
  reference_list TEXT,
  collaborators TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (lab_id) REFERENCES labs(id) ON DELETE SET NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS lab_notebook_comments (
  id VARCHAR(64) PRIMARY KEY,
  entry_id VARCHAR(64) NOT NULL,
  user_id VARCHAR(64) NOT NULL,
  comment_text TEXT NOT NULL,
  parent_comment_id VARCHAR(64),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (entry_id) REFERENCES lab_notebook_entries(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

SET FOREIGN_KEY_CHECKS = 1;
