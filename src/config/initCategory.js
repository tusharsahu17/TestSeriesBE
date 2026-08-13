require('dotenv').config();
const { createDbConnection } = require('./db');

async function initCategories() {
  let connection;
  try {
    connection = await createDbConnection();

    console.log('Creating categories table...');
    await connection.query(`
      CREATE TABLE IF NOT EXISTS categories (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);

    console.log('Categories table initialized successfully.');
  } catch (error) {
    console.error('Error initializing tables:', error);
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

initCategories();
