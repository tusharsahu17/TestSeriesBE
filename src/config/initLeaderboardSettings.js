require('dotenv').config();
const { createDbConnection } = require('./db');

async function initLeaderboardSettings() {
  let connection;
  try {
    connection = await createDbConnection();

    console.log('Creating leaderboard_settings table...');
    await connection.query(`
      CREATE TABLE IF NOT EXISTS leaderboard_settings (
        id INT AUTO_INCREMENT PRIMARY KEY,
        is_enabled BOOLEAN DEFAULT TRUE,
        show_names BOOLEAN DEFAULT TRUE,
        show_ranks BOOLEAN DEFAULT TRUE,
        show_scores BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);

    // Insert a default row if the table is empty
    const [rows] = await connection.query('SELECT COUNT(*) as count FROM leaderboard_settings');
    if (rows[0].count === 0) {
      console.log('Inserting default leaderboard settings...');
      await connection.query(`
        INSERT INTO leaderboard_settings (is_enabled, show_names, show_ranks, show_scores)
        VALUES (TRUE, TRUE, TRUE, TRUE)
      `);
    }

    console.log('leaderboard_settings table initialized successfully.');
  } catch (error) {
    console.error('Error initializing tables:', error);
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

initLeaderboardSettings();
