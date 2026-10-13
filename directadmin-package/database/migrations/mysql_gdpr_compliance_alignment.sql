-- GDPR compliance schema alignment for MySQL
-- Rebuilds consents / gdpr_requests / audit_logs / retention to match the API.

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

CREATE TABLE IF NOT EXISTS legal_policies (
  id VARCHAR(64) PRIMARY KEY,
  type VARCHAR(50) NOT NULL,
  title VARCHAR(255) NOT NULL,
  content LONGTEXT,
  version VARCHAR(50) DEFAULT '1.0',
  language VARCHAR(10) DEFAULT 'en',
  effective_date DATE,
  is_active TINYINT(1) DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_legal_policies_type (type, language, is_active)
);

DROP TABLE IF EXISTS consents;
CREATE TABLE consents (
  id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(64) NULL,
  session_id VARCHAR(128) NULL,
  anonymous_id VARCHAR(128) NULL,
  type VARCHAR(50) NOT NULL,
  granted TINYINT(1) NOT NULL DEFAULT 0,
  source VARCHAR(100) NULL,
  version VARCHAR(50) NULL,
  policy_type VARCHAR(50) NULL,
  policy_version VARCHAR(50) NULL,
  policy_id VARCHAR(64) NULL,
  purposes TEXT NULL,
  ip_address VARCHAR(64) NULL,
  user_agent TEXT NULL,
  revoked_at DATETIME NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_consents_user (user_id),
  INDEX idx_consents_session (session_id),
  INDEX idx_consents_type (type),
  INDEX idx_consents_created (created_at)
);

DROP TABLE IF EXISTS gdpr_requests;
CREATE TABLE gdpr_requests (
  id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(64) NULL,
  email VARCHAR(255) NOT NULL,
  type VARCHAR(50) NOT NULL,
  description TEXT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'PENDING',
  verification_method VARCHAR(50) DEFAULT 'email',
  verification_token VARCHAR(128) NULL,
  verification_expires_at DATETIME NULL,
  verification_attempts INT DEFAULT 0,
  last_verification_attempt_at DATETIME NULL,
  verification_locked_until DATETIME NULL,
  verified_at DATETIME NULL,
  processed_by_id VARCHAR(64) NULL,
  processing_notes TEXT NULL,
  rejection_reason TEXT NULL,
  result LONGTEXT NULL,
  completed_at DATETIME NULL,
  notes TEXT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_gdpr_email_type (email, type),
  INDEX idx_gdpr_status (status),
  INDEX idx_gdpr_created (created_at)
);

DROP TABLE IF EXISTS retention_policies;
CREATE TABLE retention_policies (
  id VARCHAR(64) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  data_type VARCHAR(100) NOT NULL,
  retention_period INT NOT NULL,
  action VARCHAR(50) NOT NULL,
  legal_basis VARCHAR(255) NULL,
  description TEXT NULL,
  is_active TINYINT(1) DEFAULT 1,
  last_executed_at DATETIME NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Expand audit_logs for compliance + safety writers
CREATE TABLE IF NOT EXISTS audit_logs (
  id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(64) NULL,
  action VARCHAR(255) NULL,
  entity_type VARCHAR(255) NULL,
  entity_id VARCHAR(64) NULL,
  details TEXT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE audit_logs ADD COLUMN event_type VARCHAR(100) NULL;
ALTER TABLE audit_logs ADD COLUMN severity VARCHAR(50) NULL;
ALTER TABLE audit_logs ADD COLUMN agent_type VARCHAR(100) NULL;
ALTER TABLE audit_logs ADD COLUMN target VARCHAR(255) NULL;
ALTER TABLE audit_logs ADD COLUMN target_id VARCHAR(64) NULL;
ALTER TABLE audit_logs ADD COLUMN status VARCHAR(50) NULL;
ALTER TABLE audit_logs ADD COLUMN metadata TEXT NULL;
ALTER TABLE audit_logs ADD COLUMN performance TEXT NULL;
ALTER TABLE audit_logs ADD COLUMN security TEXT NULL;
ALTER TABLE audit_logs ADD COLUMN timestamp DATETIME NULL;

CREATE TABLE IF NOT EXISTS user_processing_restrictions (
  id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL,
  restriction_type VARCHAR(50) NOT NULL,
  reason TEXT NULL,
  active TINYINT(1) DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_user_restriction (user_id, restriction_type),
  INDEX idx_upr_user (user_id)
);

-- Seed / refresh active policies (version 2.0)
UPDATE legal_policies SET is_active = 0 WHERE type IN ('privacy', 'cookies', 'terms') AND language = 'en';

INSERT INTO legal_policies (id, type, title, content, version, language, effective_date, is_active)
VALUES
(
  UUID(),
  'privacy',
  'Privacy Policy',
  '# Privacy Policy\n\n**Effective date:** see effective_date field\n**Controller:** Digital Research Manager (ResearchLab)\n\n## 1. Who we are\nDigital Research Manager provides research collaboration tools for laboratories, including notebooks, protocols, workspace tasks, and optional AI assistance.\n\n## 2. Personal data we process\n- Account data: name, email, username, role, institution, profile fields you provide\n- Authentication and security data: password hash, login timestamps, session identifiers\n- Research content you create: notebook entries, protocols, projects, results, messages\n- Usage and consent records: cookie preferences, consent history, audit events for compliance actions\n- Technical data: IP address and user agent when required for security or consent logging\n\n## 3. Purposes and legal bases (GDPR Art. 6)\n- Provide the service and authenticate users - contract (Art. 6(1)(b))\n- Secure the platform and prevent abuse - legitimate interests (Art. 6(1)(f))\n- Non-essential cookies/analytics/marketing - consent (Art. 6(1)(a))\n- Legal compliance and responding to data-subject requests - legal obligation (Art. 6(1)(c))\n\n## 4. Cookies\nEssential cookies are required for the service. Functional, analytics, and marketing cookies are optional and controlled via the cookie banner and Cookie Preferences page. See the Cookie Policy for details.\n\n## 5. Sharing\nWe do not sell personal data. Data may be shared with hosting/infrastructure processors under contract, with your lab collaborators as configured by you, or when required by law.\n\n## 6. International transfers\nIf processing occurs outside the EEA/UK, we use appropriate safeguards (e.g. standard contractual clauses) where required.\n\n## 7. Retention\nAccount and research data are retained while your account is active and as needed for scientific integrity, legal claims, and security. Consent and GDPR request records are retained as required for compliance evidence. Retention policies may anonymize or delete eligible records after configured periods.\n\n## 8. Your rights\nYou may request access, rectification, erasure, restriction, objection, and data portability where applicable. Use Privacy Rights in the app or email the controller. You may also lodge a complaint with your supervisory authority.\n\n## 9. Children\nThe service is intended for adult researchers and institutional users, not for children under 16.\n\n## 10. Contact\nFor privacy requests, use the in-app Privacy Rights form or contact your institutional administrator.',
  '2.0',
  'en',
  CURDATE(),
  1
),
(
  UUID(),
  'cookies',
  'Cookie Policy',
  '# Cookie Policy\n\n**Effective date:** see effective_date field\n\n## What are cookies?\nCookies are small text files stored on your device. Similar technologies (local storage) may also be used for consent and session state.\n\n## Categories we use\n1. **Essential** - required for authentication, security, and core functionality. Always active. Legal basis: contract / legitimate interests.\n2. **Functional** - remembers preferences and personalization. Legal basis: consent.\n3. **Analytics** - helps us understand product usage to improve the service. Legal basis: consent.\n4. **Marketing** - used only if enabled for personalized outreach. Legal basis: consent.\n\n## Managing cookies\nYou can Accept All, Reject non-essential, or Customize preferences via the cookie banner, Cookie Preferences page, or Settings → Privacy. You can change your mind at any time. Withdrawing consent does not affect the lawfulness of prior processing.\n\n## Consent records\nWhen you set preferences, we store a consent record (user or anonymous session id, categories granted/denied, policy version, timestamp, and technical metadata needed for proof of consent).\n\n## More information\nSee the Privacy Policy for your rights and how to contact us.',
  '2.0',
  'en',
  CURDATE(),
  1
),
(
  UUID(),
  'terms',
  'Terms of Service',
  '# Terms of Service\n\n**Effective date:** see effective_date field\n\n## 1. Acceptance\nBy creating an account or using Digital Research Manager, you agree to these Terms and our Privacy Policy.\n\n## 2. Accounts\nYou must provide accurate registration information and keep credentials confidential. You are responsible for activity under your account.\n\n## 3. Acceptable use\nUse the platform only for lawful research and collaboration. Do not attempt unauthorized access, disrupt services, or upload unlawful content.\n\n## 4. Research content\nYou retain rights in content you create, subject to lab/institution policies and licenses you choose when sharing. The platform may store and process content to provide the service.\n\n## 5. Availability\nWe strive for reliable service but do not guarantee uninterrupted availability.\n\n## 6. Limitation of liability\nTo the extent permitted by law, the service is provided \"as is\" without warranties of fitness for a particular purpose.\n\n## 7. Changes\nWe may update these Terms. Material changes will be reflected by a new version and effective date.\n\n## 8. Contact\nQuestions about these Terms can be directed to your institutional administrator or platform support.',
  '2.0',
  'en',
  CURDATE(),
  1
);

INSERT INTO retention_policies (id, name, data_type, retention_period, action, legal_basis, description, is_active)
SELECT UUID(), 'Consent evidence retention', 'consents', 1095, 'anonymize', 'Art. 5(2) accountability', 'Keep consent proof ~3 years then anonymize identifiers', 1
WHERE NOT EXISTS (SELECT 1 FROM retention_policies WHERE name = 'Consent evidence retention');

INSERT INTO retention_policies (id, name, data_type, retention_period, action, legal_basis, description, is_active)
SELECT UUID(), 'Completed GDPR request anonymization', 'gdpr_requests', 1095, 'anonymize', 'Art. 5(2) accountability', 'Anonymize completed DSR records after ~3 years', 1
WHERE NOT EXISTS (SELECT 1 FROM retention_policies WHERE name = 'Completed GDPR request anonymization');

SET FOREIGN_KEY_CHECKS = 1;
