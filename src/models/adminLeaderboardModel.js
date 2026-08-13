const { createDbConnection } = require('../config/db');

async function getSettings() {
  let connection;
  try {
    connection = await createDbConnection();
    const [rows] = await connection.query('SELECT * FROM leaderboard_settings WHERE id = 1');
    return rows[0];
  } finally {
    if (connection) await connection.end();
  }
}

async function updateSettings(data) {
  let connection;
  try {
    connection = await createDbConnection();
    const fields = [];
    const values = [];

    if (data.is_enabled !== undefined) { fields.push('is_enabled = ?'); values.push(data.is_enabled); }
    if (data.names_visible !== undefined) { fields.push('names_visible = ?'); values.push(data.names_visible); }
    if (data.ranks_public !== undefined) { fields.push('ranks_public = ?'); values.push(data.ranks_public); }
    if (data.scores_public !== undefined) { fields.push('scores_public = ?'); values.push(data.scores_public); }

    if (fields.length === 0) return true;
    values.push(1); // id = 1

    await connection.query(`UPDATE leaderboard_settings SET ${fields.join(', ')} WHERE id = ?`, values);
    return true;
  } finally {
    if (connection) await connection.end();
  }
}

async function getOverallLeaderboard() {
  let connection;
  try {
    connection = await createDbConnection();
    // Use the highest score per test, then sum them up per user
    const [rows] = await connection.query(`
      SELECT 
        u.id as user_id, u.name, u.email,
        SUM(best_attempts.max_score) as total_score
      FROM users u
      JOIN (
        SELECT user_id, test_id, MAX(obtained_marks) as max_score
        FROM test_attempts
        WHERE status = 'COMPLETED'
        GROUP BY user_id, test_id
      ) best_attempts ON u.id = best_attempts.user_id
      GROUP BY u.id
      ORDER BY total_score DESC
    `);
    
    return rows.map((row, idx) => ({ ...row, rank: idx + 1 }));
  } finally {
    if (connection) await connection.end();
  }
}

async function getTestLeaderboard(testId) {
  let connection;
  try {
    connection = await createDbConnection();
    const [rows] = await connection.query(`
      SELECT 
        u.id as user_id, u.name, u.email,
        MAX(ta.obtained_marks) as max_score
      FROM test_attempts ta
      JOIN users u ON ta.user_id = u.id
      WHERE ta.test_id = ? AND ta.status = 'COMPLETED'
      GROUP BY u.id
      ORDER BY max_score DESC
    `, [testId]);
    return rows.map((row, idx) => ({ ...row, rank: idx + 1 }));
  } finally {
    if (connection) await connection.end();
  }
}

async function getSeriesLeaderboard(seriesId) {
  let connection;
  try {
    connection = await createDbConnection();
    // Sum of highest scores in tests that belong to the series
    const [rows] = await connection.query(`
      SELECT 
        u.id as user_id, u.name, u.email,
        SUM(best_attempts.max_score) as total_score
      FROM users u
      JOIN (
        SELECT ta.user_id, ta.test_id, MAX(ta.obtained_marks) as max_score
        FROM test_attempts ta
        JOIN test_series_tests tst ON ta.test_id = tst.test_id
        WHERE tst.test_series_id = ? AND ta.status = 'COMPLETED'
        GROUP BY ta.user_id, ta.test_id
      ) best_attempts ON u.id = best_attempts.user_id
      GROUP BY u.id
      ORDER BY total_score DESC
    `, [seriesId]);
    return rows.map((row, idx) => ({ ...row, rank: idx + 1 }));
  } finally {
    if (connection) await connection.end();
  }
}

async function getWeeklyLeaderboard() {
  let connection;
  try {
    connection = await createDbConnection();
    const [rows] = await connection.query(`
      SELECT 
        u.id as user_id, u.name, u.email,
        SUM(best_attempts.max_score) as total_score
      FROM users u
      JOIN (
        SELECT user_id, test_id, MAX(obtained_marks) as max_score
        FROM test_attempts
        WHERE status = 'COMPLETED' 
          AND submitted_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
        GROUP BY user_id, test_id
      ) best_attempts ON u.id = best_attempts.user_id
      GROUP BY u.id
      ORDER BY total_score DESC
    `);
    return rows.map((row, idx) => ({ ...row, rank: idx + 1 }));
  } finally {
    if (connection) await connection.end();
  }
}

async function getMonthlyLeaderboard() {
  let connection;
  try {
    connection = await createDbConnection();
    const [rows] = await connection.query(`
      SELECT 
        u.id as user_id, u.name, u.email,
        SUM(best_attempts.max_score) as total_score
      FROM users u
      JOIN (
        SELECT user_id, test_id, MAX(obtained_marks) as max_score
        FROM test_attempts
        WHERE status = 'COMPLETED' 
          AND MONTH(submitted_at) = MONTH(CURRENT_DATE())
          AND YEAR(submitted_at) = YEAR(CURRENT_DATE())
        GROUP BY user_id, test_id
      ) best_attempts ON u.id = best_attempts.user_id
      GROUP BY u.id
      ORDER BY total_score DESC
    `);
    return rows.map((row, idx) => ({ ...row, rank: idx + 1 }));
  } finally {
    if (connection) await connection.end();
  }
}

async function getCategoryLeaderboard(categoryName) {
  let connection;
  try {
    connection = await createDbConnection();
    const [rows] = await connection.query(`
      SELECT 
        u.id as user_id, u.name, u.email,
        SUM(best_attempts.max_score) as total_score
      FROM users u
      JOIN (
        SELECT ta.user_id, ta.test_id, MAX(ta.obtained_marks) as max_score
        FROM test_attempts ta
        JOIN test_series_tests tst ON ta.test_id = tst.test_id
        JOIN test_series ts ON tst.test_series_id = ts.id
        WHERE ts.category = ? AND ta.status = 'COMPLETED'
        GROUP BY ta.user_id, ta.test_id
      ) best_attempts ON u.id = best_attempts.user_id
      GROUP BY u.id
      ORDER BY total_score DESC
    `, [categoryName]);
    return rows.map((row, idx) => ({ ...row, rank: idx + 1 }));
  } finally {
    if (connection) await connection.end();
  }
}

module.exports = {
  getSettings,
  updateSettings,
  getOverallLeaderboard,
  getTestLeaderboard,
  getSeriesLeaderboard,
  getWeeklyLeaderboard,
  getMonthlyLeaderboard,
  getCategoryLeaderboard
};
