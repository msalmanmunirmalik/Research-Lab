-- Directory-style marketplace (no deals/orders/bookings).
-- Researchers browse suppliers & service providers and contact them by email.

SET FOREIGN_KEY_CHECKS = 0;

CREATE TABLE IF NOT EXISTS marketplace_suppliers (
  id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL,
  company_name VARCHAR(255) NOT NULL,
  contact_email VARCHAR(255) NOT NULL,
  contact_phone VARCHAR(64) NULL,
  website VARCHAR(500) NULL,
  location VARCHAR(255) NULL,
  country VARCHAR(100) NULL,
  description TEXT,
  specializations TEXT,
  logo_url VARCHAR(500) NULL,
  verified TINYINT(1) DEFAULT 0,
  is_active TINYINT(1) DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_marketplace_suppliers_user (user_id),
  INDEX idx_marketplace_suppliers_active (is_active),
  INDEX idx_marketplace_suppliers_name (company_name)
);

CREATE TABLE IF NOT EXISTS marketplace_supplier_catalog (
  id VARCHAR(64) PRIMARY KEY,
  supplier_id VARCHAR(64) NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  category VARCHAR(100) NULL,
  pricing_note VARCHAR(255) NULL,
  is_active TINYINT(1) DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_supplier_catalog_supplier (supplier_id),
  CONSTRAINT fk_supplier_catalog_supplier
    FOREIGN KEY (supplier_id) REFERENCES marketplace_suppliers(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS marketplace_service_providers (
  id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL,
  display_name VARCHAR(255) NOT NULL,
  contact_email VARCHAR(255) NOT NULL,
  contact_phone VARCHAR(64) NULL,
  website VARCHAR(500) NULL,
  institution VARCHAR(255) NULL,
  location VARCHAR(255) NULL,
  bio TEXT,
  expertise_areas TEXT,
  techniques TEXT,
  pricing_note VARCHAR(255) NULL,
  verified TINYINT(1) DEFAULT 0,
  is_active TINYINT(1) DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_marketplace_providers_user (user_id),
  INDEX idx_marketplace_providers_active (is_active),
  INDEX idx_marketplace_providers_name (display_name)
);

CREATE TABLE IF NOT EXISTS marketplace_service_offerings (
  id VARCHAR(64) PRIMARY KEY,
  provider_id VARCHAR(64) NOT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  service_type VARCHAR(100) DEFAULT 'consulting',
  turnaround_note VARCHAR(255) NULL,
  pricing_note VARCHAR(255) NULL,
  tags TEXT,
  is_active TINYINT(1) DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_service_offerings_provider (provider_id),
  INDEX idx_service_offerings_type (service_type),
  CONSTRAINT fk_service_offerings_provider
    FOREIGN KEY (provider_id) REFERENCES marketplace_service_providers(id) ON DELETE CASCADE
);

SET FOREIGN_KEY_CHECKS = 1;
