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
    console.error('Database connection error:', error);
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

initQuestionBankAdmin();
