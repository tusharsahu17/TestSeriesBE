const { createDbConnection } = require('../config/db');

async function getExams() {
  let connection;
  try {
    connection = await createDbConnection();
    const [rows] = await connection.query('SELECT * FROM exams WHERE is_active = TRUE');
    return rows;
  } finally {
    if (connection) await connection.end();
  }
}

async function getExamById(examId) {
  let connection;
  try {
    connection = await createDbConnection();
    const [rows] = await connection.query('SELECT * FROM exams WHERE id = ? AND is_active = TRUE', [examId]);
    return rows[0];
  } finally {
    if (connection) await connection.end();
  }
}

async function getSubjectsForExam(examId) {
  let connection;
  try {
    connection = await createDbConnection();
    const [rows] = await connection.query(`
      SELECT s.*, es.display_order 
      FROM subjects s 
      JOIN exam_subjects es ON s.id = es.subject_id 
      WHERE es.exam_id = ? AND s.is_active = TRUE
      ORDER BY es.display_order ASC
    `, [examId]);
    return rows;
  } finally {
    if (connection) await connection.end();
  }
}

module.exports = {
  getExams,
  getExamById,
  getSubjectsForExam
};
