require('dotenv').config();
const { createDbConnection } = require('./db');

async function initLeaderboardAdmin() {
  let connection;
  try {
    connection = await createDbConnection();

    console.log('Creating leaderboard_settings table...');
    await connection.query(`
      CREATE TABLE IF NOT EXISTS leaderboard_settings (
        id INT PRIMARY KEY DEFAULT 1,
        is_enabled BOOLEAN DEFAULT TRUE,
        names_visible BOOLEAN DEFAULT TRUE,
        ranks_public BOOLEAN DEFAULT TRUE,
        scores_public BOOLEAN DEFAULT TRUE
      )
    `);

    // Insert default settings if not exists
    const [rows] = await connection.query('SELECT * FROM leaderboard_settings WHERE id = 1');
    if (rows.length === 0) {
      await connection.query(`
        INSERT INTO leaderboard_settings (id, is_enabled, names_visible, ranks_public, scores_public)
        VALUES (1, TRUE, TRUE, TRUE, TRUE)
      `);
      console.log('Inserted default leaderboard settings.');
    } else {
      console.log('Leaderboard settings already exist.');
    }

    console.log('Leaderboard schema initialized successfully.');
  } catch (error) {
    console.error('Error initializing tables:', error);
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

initLeaderboardAdmin();
