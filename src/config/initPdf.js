require('dotenv').config();
const { createDbConnection } = require('./db');

async function initPdfTables() {
  let connection;
  try {
    connection = await createDbConnection();

    console.log('Initializing PDF categories and documents tables...');

    // 1. Create pdf_categories table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS pdf_categories (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL UNIQUE,
        description TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);
    console.log('pdf_categories table created or already exists.');

    // 2. Create pdf_documents table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS pdf_documents (
        id INT AUTO_INCREMENT PRIMARY KEY,
        category_id INT NOT NULL,
        title VARCHAR(255) NOT NULL,
        description TEXT,
        file_name VARCHAR(255) NOT NULL,
        original_name VARCHAR(255) NOT NULL,
        file_path VARCHAR(500) NOT NULL,
        file_url VARCHAR(500) NOT NULL,
        file_size BIGINT NOT NULL,
        mime_type VARCHAR(100) DEFAULT 'application/pdf',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_pdf_category_id (category_id),
        FOREIGN KEY (category_id) REFERENCES pdf_categories(id) ON DELETE CASCADE
      )
    `);
    console.log('pdf_documents table created or already exists.');

    console.log('PDF tables initialization complete.');
  } catch (error) {
    console.error('Error initializing PDF tables:', error);
    throw error;
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

if (require.main === module) {
  initPdfTables()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}

module.exports = { initPdfTables };
