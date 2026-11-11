require('dotenv').config();
const { createDbConnection } = require('./db');

async function columnExists(connection, tableName, columnName) {
  const [rows] = await connection.query(
    `SELECT 1
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = ?
       AND COLUMN_NAME = ?`,
    [tableName, columnName]
  );
  return rows.length > 0;
}

async function indexExists(connection, tableName, indexName) {
  const [rows] = await connection.query(
    `SELECT 1
     FROM INFORMATION_SCHEMA.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = ?
       AND INDEX_NAME = ?`,
    [tableName, indexName]
  );
  return rows.length > 0;
}

async function ensureColumn(connection, tableName, columnName, definition) {
  const exists = await columnExists(connection, tableName, columnName);
  if (!exists) {
    await connection.query(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
    console.log(`Added column ${tableName}.${columnName}`);
  }
}

async function ensureIndex(connection, tableName, indexName, columnList) {
  const exists = await indexExists(connection, tableName, indexName);
  if (!exists) {
    await connection.query(`ALTER TABLE ${tableName} ADD INDEX ${indexName} (${columnList})`);
    console.log(`Added index ${indexName} on ${tableName}`);
  }
}

async function initDashboardTables() {
  let connection;
  try {
    connection = await createDbConnection();

    console.log('Ensuring dashboard columns on existing tables...');
    await ensureColumn(connection, 'users', 'last_login_at', 'DATETIME NULL');
    await ensureColumn(connection, 'users', 'last_active_at', 'DATETIME NULL');
    await ensureIndex(connection, 'users', 'idx_users_role_created', 'role, created_at');
    await ensureIndex(connection, 'users', 'idx_users_last_active', 'last_active_at');

    await ensureColumn(connection, 'test_series', 'published_at', 'DATETIME NULL');
    await ensureColumn(connection, 'test_attempts', 'test_series_id', 'INT NULL');
    await ensureIndex(connection, 'test_attempts', 'idx_test_attempts_series_id', 'test_series_id');
    await ensureIndex(connection, 'test_attempts', 'idx_test_attempts_status_started', 'status, started_at');

    // Backfill last_active_at for existing users if null
    await connection.query(`
      UPDATE users u
      LEFT JOIN (
        SELECT user_id, MAX(COALESCE(submitted_at, started_at)) AS last_attempt_at
        FROM test_attempts
        GROUP BY user_id
      ) ta ON ta.user_id = u.id
      SET u.last_active_at = GREATEST(u.created_at, COALESCE(ta.last_attempt_at, u.created_at))
      WHERE u.last_active_at IS NULL
    `);

    // Backfill published_at for existing published test_series
    await connection.query(`
      UPDATE test_series
      SET published_at = COALESCE(updated_at, created_at)
      WHERE is_published = 1 AND published_at IS NULL
    `);

    console.log('Creating subscriptions table...');
    await connection.query(`
      CREATE TABLE IF NOT EXISTS subscriptions (
        id BIGINT PRIMARY KEY AUTO_INCREMENT,
        user_id BIGINT NOT NULL,
        plan_name VARCHAR(150) NOT NULL,
        plan_type ENUM('MONTHLY', 'QUARTERLY', 'YEARLY', 'LIFETIME', 'SERIES_PASS') NOT NULL DEFAULT 'SERIES_PASS',
        test_series_id INT NULL,
        amount DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
        status ENUM('ACTIVE', 'EXPIRED', 'CANCELLED') NOT NULL DEFAULT 'ACTIVE',
        starts_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        expires_at DATETIME NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_subscriptions_user_id (user_id),
        INDEX idx_subscriptions_status (status),
        INDEX idx_subscriptions_expires_at (expires_at),
        CONSTRAINT fk_subscriptions_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        CONSTRAINT fk_subscriptions_series FOREIGN KEY (test_series_id) REFERENCES test_series(id) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
    `);

    console.log('Creating payments table...');
    await connection.query(`
      CREATE TABLE IF NOT EXISTS payments (
        id BIGINT PRIMARY KEY AUTO_INCREMENT,
        user_id BIGINT NOT NULL,
        test_series_id INT NULL,
        subscription_id BIGINT NULL,
        order_id VARCHAR(100) UNIQUE NULL,
        transaction_id VARCHAR(150) UNIQUE NULL,
        amount DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
        currency VARCHAR(10) NOT NULL DEFAULT 'INR',
        payment_method VARCHAR(50) NULL,
        payment_gateway VARCHAR(50) NULL,
        status ENUM('PENDING', 'SUCCESS', 'FAILED', 'REFUNDED') NOT NULL DEFAULT 'PENDING',
        refund_amount DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
        refund_reason VARCHAR(255) NULL,
        paid_at DATETIME NULL,
        refunded_at DATETIME NULL,
        notes TEXT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_payments_user_id (user_id),
        INDEX idx_payments_series_id (test_series_id),
        INDEX idx_payments_subscription_id (subscription_id),
        INDEX idx_payments_status (status),
        INDEX idx_payments_paid_at (paid_at),
        INDEX idx_payments_created_at (created_at),
        CONSTRAINT fk_payments_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        CONSTRAINT fk_payments_series FOREIGN KEY (test_series_id) REFERENCES test_series(id) ON DELETE SET NULL,
        CONSTRAINT fk_payments_subscription FOREIGN KEY (subscription_id) REFERENCES subscriptions(id) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
    `);

    console.log('Creating test_series_enrollments table...');
    await connection.query(`
      CREATE TABLE IF NOT EXISTS test_series_enrollments (
        id BIGINT PRIMARY KEY AUTO_INCREMENT,
        user_id BIGINT NOT NULL,
        test_series_id INT NOT NULL,
        payment_id BIGINT NULL,
        enrollment_type ENUM('FREE', 'PAID') NOT NULL DEFAULT 'FREE',
        status ENUM('ACTIVE', 'EXPIRED', 'CANCELLED') NOT NULL DEFAULT 'ACTIVE',
        enrolled_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        expires_at DATETIME NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_enrollments_user_id (user_id),
        INDEX idx_enrollments_series_id (test_series_id),
        INDEX idx_enrollments_type_status (enrollment_type, status),
        INDEX idx_enrollments_enrolled_at (enrolled_at),
        CONSTRAINT fk_enrollments_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        CONSTRAINT fk_enrollments_series FOREIGN KEY (test_series_id) REFERENCES test_series(id) ON DELETE CASCADE,
        CONSTRAINT fk_enrollments_payment FOREIGN KEY (payment_id) REFERENCES payments(id) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
    `);

    console.log('Creating user_activity_logs table...');
    await connection.query(`
      CREATE TABLE IF NOT EXISTS user_activity_logs (
        id BIGINT PRIMARY KEY AUTO_INCREMENT,
        user_id BIGINT NOT NULL,
        activity_type VARCHAR(50) NOT NULL,
        reference_id BIGINT NULL,
        metadata JSON NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_activity_user_date (user_id, created_at),
        INDEX idx_activity_type_date (activity_type, created_at),
        CONSTRAINT fk_activity_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
    `);

    console.log('Dashboard tables initialized successfully.');
  } finally {
    if (connection) await connection.end();
  }
}

if (require.main === module) {
  initDashboardTables()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Error initializing dashboard tables:', err);
      process.exit(1);
    });
}

module.exports = { initDashboardTables };

