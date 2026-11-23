require('dotenv').config();
const { createDbConnection } = require('./db');

async function initQuestionBankAdmin() {
  let connection;
  try {
    connection = await createDbConnection();

    console.log('Modifying test_id to be nullable...');
    try {
      await connection.query(`ALTER TABLE questions MODIFY COLUMN test_id BIGINT NULL`);
      console.log('Successfully modified test_id to allow NULL.');
    } catch (err) {
      console.error('Error modifying test_id:', err.message);
    }

    // Inspect existing foreign keys on questions referencing tests
    try {
      const [fkRows] = await connection.query(`
        SELECT rc.CONSTRAINT_NAME, rc.DELETE_RULE
        FROM INFORMATION_SCHEMA.REFERENTIAL_CONSTRAINTS rc
        WHERE rc.CONSTRAINT_SCHEMA = DATABASE()
          AND rc.TABLE_NAME = 'questions'
          AND rc.REFERENCED_TABLE_NAME = 'tests'
      `);

      for (const fk of fkRows) {
        if (fk.DELETE_RULE !== 'SET NULL') {
          console.log(`Dropping FK ${fk.CONSTRAINT_NAME} with rule ${fk.DELETE_RULE}...`);
          try {
            await connection.query(`ALTER TABLE questions DROP FOREIGN KEY \`${fk.CONSTRAINT_NAME}\``);
            console.log(`Successfully dropped FK ${fk.CONSTRAINT_NAME}.`);
          } catch (dropErr) {
            console.error(`Error dropping FK ${fk.CONSTRAINT_NAME}:`, dropErr.message);
          }
        }
      }

      // Check if FK with ON DELETE SET NULL is present
      const [remainingFk] = await connection.query(`
        SELECT rc.CONSTRAINT_NAME, rc.DELETE_RULE
        FROM INFORMATION_SCHEMA.REFERENTIAL_CONSTRAINTS rc
        WHERE rc.CONSTRAINT_SCHEMA = DATABASE()
          AND rc.TABLE_NAME = 'questions'
          AND rc.REFERENCED_TABLE_NAME = 'tests'
      `);

      if (remainingFk.length === 0) {
        console.log('Adding fk_questions_test_id with ON DELETE SET NULL...');
        try {
          await connection.query(`
            ALTER TABLE questions
            ADD CONSTRAINT fk_questions_test_id
            FOREIGN KEY (test_id) REFERENCES tests(id) ON DELETE SET NULL
          `);
          console.log('Successfully added foreign key with ON DELETE SET NULL.');
        } catch (addFkErr) {
          console.error('Error adding foreign key constraint:', addFkErr.message);
        }
      } else {
        console.log('Foreign key referencing tests with ON DELETE SET NULL is already active.');
      }
    } catch (fkInspectErr) {
      console.error('Error inspecting/updating foreign keys on questions:', fkInspectErr.message);
    }

    const columnsToAdd = [
      'ADD COLUMN category VARCHAR(100) NULL',
      'ADD COLUMN subject VARCHAR(100) NULL',
      'ADD COLUMN topic VARCHAR(100) NULL',
      'ADD COLUMN subtopic VARCHAR(100) NULL',
      'ADD COLUMN tags VARCHAR(255) NULL'
    ];

    console.log('Adding new columns to questions table...');
    for (const alter of columnsToAdd) {
      try {
        await connection.query(`ALTER TABLE questions ${alter}`);
        console.log(`Successfully executed: ${alter}`);
      } catch (err) {
        if (err.code === 'ER_DUP_FIELDNAME') {
          console.log(`Column already exists, skipping: ${alter}`);
        } else {
          console.error(`Error executing ${alter}:`, err.message);
        }
      }
    }

    console.log('Question Bank schema updated successfully.');
  } catch (error) {
    console.error('Database connection error in initQuestionBankAdmin:', error.message);
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

if (require.main === module) {
  initQuestionBankAdmin();
}

module.exports = { initQuestionBankAdmin };
