require('dotenv').config();
const { createDbConnection } = require('./db');

async function initTopicWiseTests() {
  let connection;
  try {
    connection = await createDbConnection();

    // 1. Ensure topics table exists
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

    // 2. Ensure subtopics table exists
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

    // 3. Ensure test_topics junction table exists (for multi-topic tests)
    await connection.query(`
      CREATE TABLE IF NOT EXISTS test_topics (
        id BIGINT PRIMARY KEY AUTO_INCREMENT,
        test_id BIGINT NOT NULL,
        topic_id BIGINT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (test_id) REFERENCES tests(id) ON DELETE CASCADE,
        FOREIGN KEY (topic_id) REFERENCES topics(id) ON DELETE CASCADE,
        UNIQUE KEY uq_test_topic (test_id, topic_id)
      )
    `);

    // 4. Ensure test_questions junction table exists
    await connection.query(`
      CREATE TABLE IF NOT EXISTS test_questions (
        id BIGINT PRIMARY KEY AUTO_INCREMENT,
        test_id BIGINT NOT NULL,
        question_id BIGINT NOT NULL,
        question_order INT DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (test_id) REFERENCES tests(id) ON DELETE CASCADE,
        FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE,
        UNIQUE KEY uq_test_question (test_id, question_id)
      )
    `);

    // 5. Add topic_id and subtopic_id columns to tests table
    const testColumns = [
      'ADD COLUMN topic_id BIGINT NULL',
      'ADD COLUMN subtopic_id BIGINT NULL'
    ];

    for (const col of testColumns) {
      try {
        await connection.query(`ALTER TABLE tests ${col}`);
      } catch (err) {
        if (err.code !== 'ER_DUP_FIELDNAME' && !err.message?.includes('Duplicate column name')) {
          console.error(`Error adding column to tests: ${col}`, err.message);
        }
      }
    }

    // Add foreign keys to tests table if not present
    try {
      const [fkRows] = await connection.query(`
        SELECT rc.CONSTRAINT_NAME, rc.REFERENCED_TABLE_NAME
        FROM INFORMATION_SCHEMA.REFERENTIAL_CONSTRAINTS rc
        WHERE rc.CONSTRAINT_SCHEMA = DATABASE()
          AND rc.TABLE_NAME = 'tests'
      `);
      const refTables = fkRows.map(r => r.REFERENCED_TABLE_NAME);

      if (!refTables.includes('topics')) {
        await connection.query(`
          ALTER TABLE tests
          ADD CONSTRAINT fk_tests_topic_id
          FOREIGN KEY (topic_id) REFERENCES topics(id) ON DELETE SET NULL
        `);
      }
      if (!refTables.includes('subtopics')) {
        await connection.query(`
          ALTER TABLE tests
          ADD CONSTRAINT fk_tests_subtopic_id
          FOREIGN KEY (subtopic_id) REFERENCES subtopics(id) ON DELETE SET NULL
        `);
      }
    } catch (fkErr) {
      // Ignored if constraint exists or duplicate
    }

    // 6. Add subject_id, topic_id, subtopic_id columns to questions table
    const questionColumns = [
      'ADD COLUMN subject_id BIGINT NULL',
      'ADD COLUMN topic_id BIGINT NULL',
      'ADD COLUMN subtopic_id BIGINT NULL'
    ];

    for (const col of questionColumns) {
      try {
        await connection.query(`ALTER TABLE questions ${col}`);
      } catch (err) {
        if (err.code !== 'ER_DUP_FIELDNAME' && !err.message?.includes('Duplicate column name')) {
          console.error(`Error adding column to questions: ${col}`, err.message);
        }
      }
    }

    // Add foreign keys to questions table if not present
    try {
      const [qFkRows] = await connection.query(`
        SELECT rc.CONSTRAINT_NAME, rc.REFERENCED_TABLE_NAME
        FROM INFORMATION_SCHEMA.REFERENTIAL_CONSTRAINTS rc
        WHERE rc.CONSTRAINT_SCHEMA = DATABASE()
          AND rc.TABLE_NAME = 'questions'
      `);
      const qRefTables = qFkRows.map(r => r.REFERENCED_TABLE_NAME);

      if (!qRefTables.includes('subjects')) {
        await connection.query(`
          ALTER TABLE questions
          ADD CONSTRAINT fk_questions_subject_id
          FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE SET NULL
        `);
      }
      if (!qRefTables.includes('topics')) {
        await connection.query(`
          ALTER TABLE questions
          ADD CONSTRAINT fk_questions_topic_id
          FOREIGN KEY (topic_id) REFERENCES topics(id) ON DELETE SET NULL
        `);
      }
      if (!qRefTables.includes('subtopics')) {
        await connection.query(`
          ALTER TABLE questions
          ADD CONSTRAINT fk_questions_subtopic_id
          FOREIGN KEY (subtopic_id) REFERENCES subtopics(id) ON DELETE SET NULL
        `);
      }
    } catch (qFkErr) {
      // Ignored if constraint exists or duplicate
    }

    console.log('Topic-wise test schema and hierarchy tables initialized successfully.');
  } catch (error) {
    console.error('Error initializing topic-wise tests schema:', error.message || error);
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

if (require.main === module) {
  initTopicWiseTests()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}

module.exports = { initTopicWiseTests };
