-- MySQL 8.0+/8.4, InnoDB, utf8mb4. No CREATE DATABASE / GRANT required on Aiven.
CREATE TABLE IF NOT EXISTS schema_migrations (
 version VARCHAR(60) PRIMARY KEY, applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS policy_lock (id TINYINT PRIMARY KEY) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
INSERT IGNORE INTO policy_lock(id) VALUES (1);
CREATE TABLE IF NOT EXISTS roles (
 code VARCHAR(40) PRIMARY KEY, label VARCHAR(80) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
INSERT IGNORE INTO roles VALUES ('SUPER_CS','Super Customer Service'),('CS','Customer Service'),('STORE','Store');
CREATE TABLE IF NOT EXISTS users (
 id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 name VARCHAR(120) NOT NULL, email VARCHAR(191) NOT NULL UNIQUE,
 password_hash VARCHAR(255) NOT NULL,
 role VARCHAR(40) NOT NULL DEFAULT 'CS', status ENUM('pending','active','inactive') NOT NULL DEFAULT 'pending',
 must_change_password BOOLEAN NOT NULL DEFAULT FALSE,
 created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY (role) REFERENCES roles(code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS work_schedules (
 id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY, user_id INT UNSIGNED NOT NULL,
 valid_from DATE NOT NULL, weekly_off JSON NOT NULL,
 UNIQUE KEY schedule_version(user_id, valid_from),
 FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS sessions (
 token_hash CHAR(64) PRIMARY KEY, user_id INT UNSIGNED NOT NULL,
 expires_at DATETIME NOT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
 INDEX(user_id), INDEX(expires_at), FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS holiday_years (
 year SMALLINT UNSIGNED PRIMARY KEY, confirmed BOOLEAN NOT NULL DEFAULT FALSE,
 confirmed_by INT UNSIGNED NULL, confirmed_at DATETIME NULL,
 source VARCHAR(255) NOT NULL DEFAULT 'date-holidays TH - administrator review required',
 FOREIGN KEY (confirmed_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS holidays (
 id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY, day DATE NOT NULL,
 name VARCHAR(255) NOT NULL, source VARCHAR(255) NOT NULL,
 enabled BOOLEAN NOT NULL DEFAULT TRUE,
 UNIQUE KEY holiday_name(day, name), INDEX(day)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS settings (
 id TINYINT PRIMARY KEY, policy JSON NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
INSERT IGNORE INTO settings VALUES (1, '{"weekendCapacity":1,"maxConsecutive":4,"exceptionConsecutive":5,"certificateFromDays":3,"blockHolidayExtension":true}');
CREATE TABLE IF NOT EXISTS entitlements (
 user_id INT UNSIGNED NOT NULL, year SMALLINT UNSIGNED NOT NULL,
 leave_type ENUM('annual','personal','sick') NOT NULL, quota SMALLINT UNSIGNED NOT NULL,
 PRIMARY KEY(user_id,year,leave_type), FOREIGN KEY(user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS leave_requests (
 id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY, user_id INT UNSIGNED NOT NULL,
 leave_type ENUM('annual','personal','sick') NOT NULL,
 start_date DATE NOT NULL, end_date DATE NOT NULL, reason TEXT NOT NULL,
 status ENUM('pending','approved','rejected','cancelled') NOT NULL DEFAULT 'pending',
 team_discussed BOOLEAN NOT NULL DEFAULT FALSE, notified_klao BOOLEAN NOT NULL DEFAULT FALSE,
 exception_requested BOOLEAN NOT NULL DEFAULT FALSE, exception_reason TEXT NULL,
 validation_snapshot JSON NOT NULL,
 reviewed_by INT UNSIGNED NULL, reviewed_at DATETIME NULL, review_note TEXT NULL,
 created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
 INDEX(user_id,status), INDEX(start_date,end_date), INDEX(status),
 FOREIGN KEY(user_id) REFERENCES users(id), FOREIGN KEY(reviewed_by) REFERENCES users(id),
 CHECK(end_date >= start_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS leave_days (
 request_id INT UNSIGNED NOT NULL, user_id INT UNSIGNED NOT NULL, day DATE NOT NULL,
 PRIMARY KEY(request_id,day), INDEX(day,user_id), INDEX(user_id,day),
 FOREIGN KEY(request_id) REFERENCES leave_requests(id), FOREIGN KEY(user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS certificates (
 request_id INT UNSIGNED PRIMARY KEY, ciphertext MEDIUMBLOB NOT NULL,
 iv BINARY(12) NOT NULL, auth_tag BINARY(16) NOT NULL,
 mime VARCHAR(30) NOT NULL DEFAULT 'image/jpeg', bytes INT UNSIGNED NOT NULL,
 created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY(request_id) REFERENCES leave_requests(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS coverage_requests (
 id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY, user_id INT UNSIGNED NOT NULL,
 covers_user_id INT UNSIGNED NOT NULL, day DATE NOT NULL, hours DECIMAL(4,1) NOT NULL,
 requested_ot BOOLEAN NOT NULL DEFAULT FALSE, reason TEXT NOT NULL,
 status ENUM('pending','approved','rejected','cancelled') NOT NULL DEFAULT 'pending',
 store_authorized_by INT UNSIGNED NULL, reviewed_by INT UNSIGNED NULL, review_note TEXT NULL,
 created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
 INDEX(day,user_id), FOREIGN KEY(user_id) REFERENCES users(id),
 FOREIGN KEY(covers_user_id) REFERENCES users(id), FOREIGN KEY(store_authorized_by) REFERENCES users(id),
 FOREIGN KEY(reviewed_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS audit_logs (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, actor_id INT UNSIGNED NULL,
 action VARCHAR(80) NOT NULL, entity_type VARCHAR(40) NOT NULL, entity_id VARCHAR(60) NOT NULL,
 details JSON NOT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
 INDEX(created_at), FOREIGN KEY(actor_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
