-- MySQL Lab Workspace (ops tasks hierarchy)
-- Workspace > Spaces > Folders > Lists > Tasks

SET FOREIGN_KEY_CHECKS = 0;

CREATE TABLE IF NOT EXISTS lab_workspaces (
  id VARCHAR(64) PRIMARY KEY,
  lab_id VARCHAR(64) NOT NULL,
  name VARCHAR(255) NOT NULL DEFAULT 'Lab Workspace',
  description TEXT,
  color VARCHAR(7) DEFAULT '#0f172a',
  icon VARCHAR(50) NULL,
  created_by VARCHAR(64) NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_lab_workspaces_lab (lab_id),
  INDEX idx_lab_workspaces_lab (lab_id)
);

CREATE TABLE IF NOT EXISTS workspace_spaces (
  id VARCHAR(64) PRIMARY KEY,
  workspace_id VARCHAR(64) NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  color VARCHAR(7) DEFAULT '#334155',
  icon VARCHAR(50) NULL,
  position INT DEFAULT 0,
  is_archived TINYINT(1) DEFAULT 0,
  created_by VARCHAR(64) NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_workspace_spaces_workspace (workspace_id),
  CONSTRAINT fk_workspace_spaces_workspace
    FOREIGN KEY (workspace_id) REFERENCES lab_workspaces(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS workspace_folders (
  id VARCHAR(64) PRIMARY KEY,
  space_id VARCHAR(64) NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  color VARCHAR(7) DEFAULT '#64748b',
  position INT DEFAULT 0,
  is_archived TINYINT(1) DEFAULT 0,
  created_by VARCHAR(64) NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_workspace_folders_space (space_id),
  CONSTRAINT fk_workspace_folders_space
    FOREIGN KEY (space_id) REFERENCES workspace_spaces(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS workspace_lists (
  id VARCHAR(64) PRIMARY KEY,
  folder_id VARCHAR(64) NULL,
  space_id VARCHAR(64) NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  color VARCHAR(7) DEFAULT '#475569',
  position INT DEFAULT 0,
  is_archived TINYINT(1) DEFAULT 0,
  created_by VARCHAR(64) NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_workspace_lists_space (space_id),
  INDEX idx_workspace_lists_folder (folder_id),
  CONSTRAINT fk_workspace_lists_space
    FOREIGN KEY (space_id) REFERENCES workspace_spaces(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS workspace_tasks (
  id VARCHAR(64) PRIMARY KEY,
  workspace_id VARCHAR(64) NOT NULL,
  space_id VARCHAR(64) NOT NULL,
  folder_id VARCHAR(64) NULL,
  list_id VARCHAR(64) NOT NULL,
  title VARCHAR(500) NOT NULL,
  description TEXT,
  status VARCHAR(32) DEFAULT 'to_do',
  priority VARCHAR(32) DEFAULT 'normal',
  due_date DATETIME NULL,
  start_date DATETIME NULL,
  assignee_id VARCHAR(64) NULL,
  created_by VARCHAR(64) NOT NULL,
  position INT DEFAULT 0,
  tags TEXT,
  custom_fields TEXT,
  project_id VARCHAR(64) NULL,
  protocol_id VARCHAR(64) NULL,
  inventory_item_id VARCHAR(64) NULL,
  instrument_id VARCHAR(64) NULL,
  progress_percentage INT DEFAULT 0,
  time_estimated INT NULL,
  time_tracked INT DEFAULT 0,
  is_archived TINYINT(1) DEFAULT 0,
  archived_at DATETIME NULL,
  completed_at DATETIME NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_workspace_tasks_workspace (workspace_id),
  INDEX idx_workspace_tasks_list (list_id),
  INDEX idx_workspace_tasks_status (status),
  INDEX idx_workspace_tasks_assignee (assignee_id),
  CONSTRAINT fk_workspace_tasks_workspace
    FOREIGN KEY (workspace_id) REFERENCES lab_workspaces(id) ON DELETE CASCADE,
  CONSTRAINT fk_workspace_tasks_list
    FOREIGN KEY (list_id) REFERENCES workspace_lists(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS workspace_subtasks (
  id VARCHAR(64) PRIMARY KEY,
  task_id VARCHAR(64) NOT NULL,
  title VARCHAR(500) NOT NULL,
  description TEXT,
  is_completed TINYINT(1) DEFAULT 0,
  completed_at DATETIME NULL,
  assignee_id VARCHAR(64) NULL,
  position INT DEFAULT 0,
  created_by VARCHAR(64) NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_workspace_subtasks_task (task_id),
  CONSTRAINT fk_workspace_subtasks_task
    FOREIGN KEY (task_id) REFERENCES workspace_tasks(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS task_comments (
  id VARCHAR(64) PRIMARY KEY,
  task_id VARCHAR(64) NOT NULL,
  user_id VARCHAR(64) NOT NULL,
  content TEXT NOT NULL,
  parent_comment_id VARCHAR(64) NULL,
  is_edited TINYINT(1) DEFAULT 0,
  edited_at DATETIME NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_task_comments_task (task_id),
  CONSTRAINT fk_task_comments_task
    FOREIGN KEY (task_id) REFERENCES workspace_tasks(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS instrument_bookings (
  id VARCHAR(64) PRIMARY KEY,
  instrument_id VARCHAR(64) NOT NULL,
  user_id VARCHAR(64) NOT NULL,
  lab_id VARCHAR(64) NULL,
  title VARCHAR(255) NULL,
  purpose TEXT,
  start_time DATETIME NOT NULL,
  end_time DATETIME NOT NULL,
  status VARCHAR(32) DEFAULT 'confirmed',
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_instrument_bookings_instrument (instrument_id),
  INDEX idx_instrument_bookings_user (user_id)
);

SET FOREIGN_KEY_CHECKS = 1;
