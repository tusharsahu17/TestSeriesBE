require('dotenv').config();
const { createDbConnection } = require('./db');

async function initTestsAdmin() {
  let connection;
  try {
    connection = await createDbConnection();

    const columnsToAdd = [
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
        if (err.code === 'ER_DUP_FIELDNAME') {
          console.log(`Column already exists, skipping: ${alter}`);
        } else {
          console.error(`Error adding column: ${alter}`, err.message);
        }
      }
    }

    console.log('Tests table schema updated successfully.');
  } catch (error) {
    console.error('Error connecting or altering table:', error);
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

initTestsAdmin();
