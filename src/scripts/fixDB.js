require('dotenv').config();
const mysql = require('mysql2/promise');

async function fixDB() {
  let connection;
  try {
    connection = await mysql.createConnection(process.env.DATABASE_URL);
    await connection.query('ALTER TABLE test_attempts ADD COLUMN total_marks DECIMAL(10,2) DEFAULT 0 AFTER skipped_questions, ADD COLUMN obtained_marks DECIMAL(10,2) DEFAULT 0 AFTER total_marks, ADD COLUMN percentage DECIMAL(5,2) DEFAULT 0 AFTER obtained_marks, ADD COLUMN `rank` INT AFTER percentage');
    console.log('Added missing columns successfully.');
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    if (connection) await connection.end();
    process.exit(0);
  }
}

fixDB();
