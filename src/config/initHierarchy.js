require('dotenv').config();
const { createDbConnection } = require('./db');

async function initHierarchy() {
  let connection;
  try {
    connection = await createDbConnection();

    console.log('Creating topics table...');
    await connection.query(`
      CREATE TABLE IF NOT EXISTS topics (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        subject_id BIGINT NOT NULL,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE
      )
    `);

    console.log('Creating subtopics table...');
    await connection.query(`
      CREATE TABLE IF NOT EXISTS subtopics (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        topic_id BIGINT NOT NULL,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (topic_id) REFERENCES topics(id) ON DELETE CASCADE
      )
    `);

    console.log('Hierarchy tables initialized successfully.');
  } catch (error) {
    console.error('Error initializing tables:', error);
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

initHierarchy();
