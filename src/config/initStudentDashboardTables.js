require('dotenv').config();
const { createDbConnection } = require('./db');

let ensurePromise = null;

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

async function ensureIndex(connection, tableName, indexName, columnList) {
  const exists = await indexExists(connection, tableName, indexName);
  if (!exists) {
    await connection.query(`ALTER TABLE ${tableName} ADD INDEX ${indexName} (${columnList})`);
    console.log(`Added index ${indexName} on ${tableName}`);
  }
}

async function initStudentDashboardTables(existingConnection = null) {
  let connection = existingConnection;
  const shouldClose = !existingConnection;
  try {
    if (!connection) {
      connection = await createDbConnection();
    }

    await connection.query(`
      CREATE TABLE IF NOT EXISTS notifications (
        id BIGINT PRIMARY KEY AUTO_INCREMENT,
        user_id BIGINT NULL,
        target_audience ENUM('USER', 'ALL_STUDENTS', 'SERIES_ENROLLED') NOT NULL DEFAULT 'USER',
        target_series_id INT NULL,
        type ENUM('NEW_TEST', 'RESULT_PUBLISHED', 'SERIES_EXPIRING', 'PAYMENT_CONFIRMED', 'ANNOUNCEMENT') NOT NULL DEFAULT 'ANNOUNCEMENT',
        title VARCHAR(255) NOT NULL,
        message TEXT NOT NULL,
        reference_type VARCHAR(50) NULL,
        reference_id BIGINT NULL,
        metadata JSON NULL,
        is_read BOOLEAN NOT NULL DEFAULT FALSE,
        read_at DATETIME NULL,
        dedupe_key VARCHAR(150) UNIQUE NULL,
        expires_at DATETIME NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_notifications_user_created (user_id, created_at),
        INDEX idx_notifications_audience_created (target_audience, created_at),
        INDEX idx_notifications_series_created (target_series_id, created_at),
        INDEX idx_notifications_type_created (type, created_at),
        CONSTRAINT fk_notifications_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        CONSTRAINT fk_notifications_series FOREIGN KEY (target_series_id) REFERENCES test_series(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS notification_reads (
        id BIGINT PRIMARY KEY AUTO_INCREMENT,
        notification_id BIGINT NOT NULL,
        user_id BIGINT NOT NULL,
        read_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uq_notification_reads_user (notification_id, user_id),
        INDEX idx_notification_reads_user (user_id),
        CONSTRAINT fk_notification_reads_notif FOREIGN KEY (notification_id) REFERENCES notifications(id) ON DELETE CASCADE,
        CONSTRAINT fk_notification_reads_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
    `);

    await ensureIndex(
      connection,
      'test_attempts',
      'idx_test_attempts_user_status_submitted',
      'user_id, status, submitted_at'
    );
    await ensureIndex(
      connection,
      'test_series_enrollments',
      'idx_enrollments_user_status_expires',
      'user_id, status, expires_at'
    );
    await ensureIndex(
      connection,
      'test_series_tests',
      'idx_tst_series_test',
      'test_series_id, test_id'
    );
    await ensureIndex(
      connection,
      'test_questions',
      'idx_test_questions_test_question',
      'test_id, question_id'
    );

    console.log('Student dashboard tables initialized successfully.');
  } finally {
    if (shouldClose && connection) {
      await connection.end();
    }
  }
}

async function ensureStudentDashboardTables(existingConnection = null) {
  if (!ensurePromise) {
    ensurePromise = initStudentDashboardTables(existingConnection).catch((err) => {
      ensurePromise = null;
      throw err;
    });
  }
  return ensurePromise;
}

if (require.main === module) {
  initStudentDashboardTables()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Error initializing student dashboard tables:', err);
      process.exit(1);
    });
}

module.exports = {
  initStudentDashboardTables,
  ensureStudentDashboardTables,
};

