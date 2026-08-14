require('dotenv').config();
const { createDbConnection } = require('./db');

async function initTestSeries() {
  let connection;
  try {
    connection = await createDbConnection();

    console.log('Creating test_series table...');
    await connection.query(`
      CREATE TABLE IF NOT EXISTS test_series (
        id INT AUTO_INCREMENT PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        description TEXT,
        thumbnail_url VARCHAR(500),
        price DECIMAL(10, 2) DEFAULT 0.00,
        is_paid BOOLEAN DEFAULT FALSE,
        validity_days INT,
        start_date DATETIME,
        end_date DATETIME,
        category_id INT,
        difficulty_level VARCHAR(50),
        is_published BOOLEAN DEFAULT FALSE,
        is_archived BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);

    console.log('Creating test_series_tests table...');
    await connection.query(`
      CREATE TABLE IF NOT EXISTS test_series_tests (
        id INT AUTO_INCREMENT PRIMARY KEY,
        test_series_id INT NOT NULL,
        test_id INT NOT NULL,
        display_order INT DEFAULT 0,
        FOREIGN KEY (test_series_id) REFERENCES test_series(id) ON DELETE CASCADE
      )
    `);

    console.log('Test Series tables initialized successfully.');
  } catch (error) {
    console.error('Error initializing tables:', error);
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

initTestSeries();
