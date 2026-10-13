-- Tools & Trainings v2: multi-video lessons, course level/pass score, self-assessments

SET @db := DATABASE();

ALTER TABLE lab_trainings
  ADD COLUMN IF NOT EXISTS pass_score INT NULL DEFAULT 80,
  ADD COLUMN IF NOT EXISTS level VARCHAR(32) NULL DEFAULT 'beginner';

ALTER TABLE lab_training_items
  ADD COLUMN IF NOT EXISTS videos_json LONGTEXT NULL;

CREATE TABLE IF NOT EXISTS lab_training_assessments (
  id VARCHAR(64) PRIMARY KEY,
  training_id VARCHAR(64) NOT NULL,
  title VARCHAR(255) NOT NULL DEFAULT 'Self-assessment',
  pass_score INT NOT NULL DEFAULT 80,
  questions_json LONGTEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_lab_training_assessment_training (training_id),
  CONSTRAINT fk_lab_training_assessment_training
    FOREIGN KEY (training_id) REFERENCES lab_trainings(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS lab_training_assessment_attempts (
  id VARCHAR(64) PRIMARY KEY,
  assessment_id VARCHAR(64) NOT NULL,
  training_id VARCHAR(64) NOT NULL,
  user_id VARCHAR(64) NOT NULL,
  lab_id VARCHAR(64) NOT NULL,
  score INT NOT NULL DEFAULT 0,
  passed TINYINT(1) NOT NULL DEFAULT 0,
  answers_json LONGTEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_lab_training_attempts_user (lab_id, user_id),
  INDEX idx_lab_training_attempts_training (training_id, user_id),
  CONSTRAINT fk_lab_training_attempt_assessment
    FOREIGN KEY (assessment_id) REFERENCES lab_training_assessments(id) ON DELETE CASCADE,
  CONSTRAINT fk_lab_training_attempt_training
    FOREIGN KEY (training_id) REFERENCES lab_trainings(id) ON DELETE CASCADE
);
