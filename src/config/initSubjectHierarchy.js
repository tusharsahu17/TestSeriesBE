require('dotenv').config();
const { createDbConnection } = require('./db');

async function initSubjectHierarchy() {
  let connection;
  try {
    connection = await createDbConnection();

    console.log('Creating topics table...');
    await connection.query(`
      CREATE TABLE IF NOT EXISTS topics (
        id INT AUTO_INCREMENT PRIMARY KEY,
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
        id INT AUTO_INCREMENT PRIMARY KEY,
        topic_id INT NOT NULL,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (topic_id) REFERENCES topics(id) ON DELETE CASCADE
      )
    `);

    console.log('Subject Hierarchy schema initialized successfully.');
  } catch (error) {
    console.error('Error initializing tables:', error);
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

initSubjectHierarchy();
