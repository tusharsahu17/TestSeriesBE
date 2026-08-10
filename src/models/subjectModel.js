const { createDbConnection } = require('../config/db');

async function getTestsBySubjectId(subjectId) {
  let connection;
  try {
    connection = await createDbConnection();
    const [rows] = await connection.query(`
      SELECT * 
      FROM tests 
      WHERE subject_id = ? AND is_active = TRUE
      ORDER BY display_order ASC
    `, [subjectId]);
    return rows;
  } finally {
    if (connection) await connection.end();
  }
}

module.exports = {
  getTestsBySubjectId
};
