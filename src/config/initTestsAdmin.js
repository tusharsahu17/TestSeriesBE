require('dotenv').config();
const { createDbConnection } = require('./db');

async function initTestsAdmin() {
  let connection;
  try {
    connection = await createDbConnection();

    // Check if tests table exists
    const [tables] = await connection.query(`
      SELECT 1 FROM INFORMATION_SCHEMA.TABLES 
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tests'
    `);
    if (tables.length === 0) {
      console.log('tests table does not exist yet. Skipping column additions.');
      return;
    }

    const columnsToAdd = [
      'ADD COLUMN exam_id BIGINT NULL',
      'ADD COLUMN instructions TEXT',
      'ADD COLUMN negative_marking DECIMAL(5, 2) DEFAULT 0.00',
      'ADD COLUMN start_time DATETIME NULL',
      'ADD COLUMN end_time DATETIME NULL',
      'ADD COLUMN max_attempts INT DEFAULT 1',
      'ADD COLUMN randomize_questions BOOLEAN DEFAULT FALSE',
      'ADD COLUMN randomize_options BOOLEAN DEFAULT FALSE',
      'ADD COLUMN navigation_settings VARCHAR(50) DEFAULT "free"',
      'ADD COLUMN auto_submit BOOLEAN DEFAULT TRUE',
      'ADD COLUMN is_published BOOLEAN DEFAULT FALSE'
    ];

    console.log('Altering tests table...');
    
    for (const alter of columnsToAdd) {
      try {
        await connection.query(`ALTER TABLE tests ${alter}`);
        console.log(`Successfully added column: ${alter}`);
      } catch (err) {
        if (err.code === 'ER_DUP_FIELDNAME' || err.errno === 1060 || err.message?.includes('Duplicate column name')) {
          console.log(`Column already exists, skipping: ${alter}`);
        } else {
          console.error(`Error adding column: ${alter}`, err.message);
        }
      }
    }

    // Inspect existing foreign keys on tests referencing exams
    try {
      const [fkRows] = await connection.query(`
        SELECT rc.CONSTRAINT_NAME
        FROM INFORMATION_SCHEMA.REFERENTIAL_CONSTRAINTS rc
        WHERE rc.CONSTRAINT_SCHEMA = DATABASE()
          AND rc.TABLE_NAME = 'tests'
          AND rc.REFERENCED_TABLE_NAME = 'exams'
      `);

      if (fkRows.length === 0) {
        const [examTable] = await connection.query(`
          SELECT 1 FROM INFORMATION_SCHEMA.TABLES 
          WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'exams'
        `);
        if (examTable.length > 0) {
          console.log('Adding fk_tests_exam_id with ON DELETE SET NULL...');
          await connection.query(`
            ALTER TABLE tests
            ADD CONSTRAINT fk_tests_exam_id
            FOREIGN KEY (exam_id) REFERENCES exams(id) ON DELETE SET NULL
          `);
          console.log('Successfully added foreign key fk_tests_exam_id.');
        }
      }
    } catch (fkErr) {
      console.warn('Note: Could not inspect or add fk_tests_exam_id:', fkErr.message);
    }

    console.log('Tests table schema updated successfully.');
  } catch (error) {
    console.error('Error connecting or altering table:', error.message || error);
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

if (require.main === module) {
  initTestsAdmin()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Error initializing tests table:', err);
      process.exit(1);
    });
}

module.exports = { initTestsAdmin };

