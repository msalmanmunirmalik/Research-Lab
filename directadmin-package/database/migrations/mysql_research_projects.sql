-- Research project management tables (MySQL)
-- Used by /api/project-management/*

CREATE TABLE IF NOT EXISTS research_projects (
  id VARCHAR(64) PRIMARY KEY,
  lab_id VARCHAR(64) NULL,
  project_code VARCHAR(100) NULL,
  project_title VARCHAR(255) NOT NULL,
  project_description TEXT NULL,
  principal_investigator_id VARCHAR(64) NULL,
  project_type VARCHAR(100) NULL,
  research_field VARCHAR(255) NULL,
  total_budget DECIMAL(14,2) NULL,
  budget_spent DECIMAL(14,2) NULL DEFAULT 0,
  planned_start_date DATE NULL,
  planned_end_date DATE NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'planning',
  overall_progress_percentage INT NOT NULL DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_research_projects_lab (lab_id),
  INDEX idx_research_projects_status (status),
  INDEX idx_research_projects_pi (principal_investigator_id)
);

CREATE TABLE IF NOT EXISTS project_work_packages (
  id VARCHAR(64) PRIMARY KEY,
  project_id VARCHAR(64) NOT NULL,
  package_code VARCHAR(100) NULL,
  package_title VARCHAR(255) NOT NULL,
  package_description TEXT NULL,
  lead_researcher_id VARCHAR(64) NULL,
  objectives TEXT NULL,
  deliverables TEXT NULL,
  planned_end_date DATE NULL,
  estimated_person_hours DECIMAL(10,2) NULL,
  actual_person_hours DECIMAL(10,2) NULL,
  progress_percentage INT NOT NULL DEFAULT 0,
  status VARCHAR(50) NOT NULL DEFAULT 'not_started',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_work_packages_project (project_id),
  CONSTRAINT fk_wp_project FOREIGN KEY (project_id) REFERENCES research_projects(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS lab_team_hierarchy (
  id VARCHAR(64) PRIMARY KEY,
  lab_id VARCHAR(64) NOT NULL,
  member_id VARCHAR(64) NOT NULL,
  reports_to VARCHAR(64) NULL,
  position_level INT NOT NULL DEFAULT 1,
  role VARCHAR(100) NULL,
  position_title VARCHAR(255) NULL,
  start_date DATE NULL,
  primary_responsibilities TEXT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_team_hierarchy_lab (lab_id),
  INDEX idx_team_hierarchy_member (member_id)
);

CREATE TABLE IF NOT EXISTS member_progress_reports (
  id VARCHAR(64) PRIMARY KEY,
  lab_id VARCHAR(64) NULL,
  member_id VARCHAR(64) NOT NULL,
  project_id VARCHAR(64) NULL,
  work_package_id VARCHAR(64) NULL,
  report_title VARCHAR(255) NOT NULL,
  report_period_start DATE NULL,
  report_period_end DATE NULL,
  report_type VARCHAR(50) NULL,
  summary TEXT NULL,
  accomplishments TEXT NULL,
  challenges_encountered TEXT NULL,
  planned_next_steps TEXT NULL,
  hours_worked DECIMAL(10,2) NULL,
  submission_status VARCHAR(50) NOT NULL DEFAULT 'draft',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_progress_reports_member (member_id),
  INDEX idx_progress_reports_project (project_id)
);

CREATE TABLE IF NOT EXISTS pi_reviews (
  id VARCHAR(64) PRIMARY KEY,
  progress_report_id VARCHAR(64) NOT NULL,
  reviewer_id VARCHAR(64) NOT NULL,
  reviewee_id VARCHAR(64) NOT NULL,
  overall_assessment TEXT NULL,
  strengths TEXT NULL,
  areas_for_improvement TEXT NULL,
  approval_status VARCHAR(50) NULL,
  requires_resubmission TINYINT(1) NOT NULL DEFAULT 0,
  recommended_actions TEXT NULL,
  progress_rating INT NULL,
  quality_rating INT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_pi_reviews_report (progress_report_id)
);

CREATE TABLE IF NOT EXISTS progress_notifications (
  id VARCHAR(64) PRIMARY KEY,
  notification_type VARCHAR(50) NOT NULL,
  recipient_id VARCHAR(64) NOT NULL,
  sender_id VARCHAR(64) NULL,
  report_id VARCHAR(64) NULL,
  review_id VARCHAR(64) NULL,
  title VARCHAR(255) NOT NULL,
  message TEXT NULL,
  priority VARCHAR(20) NOT NULL DEFAULT 'normal',
  is_read TINYINT(1) NOT NULL DEFAULT 0,
  read_at DATETIME NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_progress_notifications_recipient (recipient_id)
);

CREATE TABLE IF NOT EXISTS team_meetings (
  id VARCHAR(64) PRIMARY KEY,
  lab_id VARCHAR(64) NULL,
  project_id VARCHAR(64) NULL,
  organizer_id VARCHAR(64) NOT NULL,
  meeting_title VARCHAR(255) NOT NULL,
  meeting_type VARCHAR(50) NULL,
  scheduled_date DATETIME NOT NULL,
  duration_minutes INT NULL DEFAULT 60,
  agenda_items TEXT NULL,
  required_attendees TEXT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'scheduled',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_team_meetings_lab (lab_id),
  INDEX idx_team_meetings_project (project_id)
);
