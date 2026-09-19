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

async function createExam(data) {
  let connection;
  try {
    connection = await createDbConnection();
    const { name, description, is_active } = data;
    
    // Generate a simple slug from the name
    const slug = name ? name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '') : '';
    
    const [result] = await connection.query(
      'INSERT INTO exams (name, slug, description, is_active) VALUES (?, ?, ?, ?)',
      [name, slug, description || null, is_active !== undefined ? is_active : true]
    );
    return result.insertId;
  } finally {
    if (connection) await connection.end();
  }
}

async function updateExam(id, data) {
  let connection;
  try {
    connection = await createDbConnection();
    const fields = [];
    const values = [];

    if (data.name !== undefined) {
      fields.push('name = ?');
      values.push(data.name);
    }
    if (data.description !== undefined) {
      fields.push('description = ?');
      values.push(data.description);
    }
    if (data.is_active !== undefined) {
      fields.push('is_active = ?');
      values.push(data.is_active);
    }

    if (fields.length === 0) return true;

    values.push(id);
    await connection.query(`UPDATE exams SET ${fields.join(', ')} WHERE id = ?`, values);
    return true;
  } finally {
    if (connection) await connection.end();
  }
}

async function deleteExam(id) {
  let connection;
  try {
    connection = await createDbConnection();
    await connection.query('DELETE FROM exams WHERE id = ?', [id]);
    return true;
  } finally {
    if (connection) await connection.end();
  }
}

async function addSubjectToExam(examId, subjectId) {
  let connection;
  try {
    connection = await createDbConnection();
    // Default display_order to 0
    await connection.query(
      'INSERT INTO exam_subjects (exam_id, subject_id, display_order) VALUES (?, ?, 0)',
      [examId, subjectId]
    );
    return true;
  } finally {
    if (connection) await connection.end();
  }
}

async function removeSubjectFromExam(examId, subjectId) {
  let connection;
  try {
    connection = await createDbConnection();
    await connection.query(
      'DELETE FROM exam_subjects WHERE exam_id = ? AND subject_id = ?',
      [examId, subjectId]
    );
    return true;
  } finally {
    if (connection) await connection.end();
  }
}

async function getTestsForExam(examId) {
  let connection;
  try {
    connection = await createDbConnection();
    const [rows] = await connection.query(`
      SELECT t.*, s.name as subject_name 
      FROM tests t
      JOIN exam_subjects es ON t.subject_id = es.subject_id
      JOIN subjects s ON s.id = es.subject_id
      WHERE es.exam_id = ? AND t.is_active = TRUE
      ORDER BY es.display_order ASC, t.display_order ASC
    `, [examId]);
    return rows;
  } finally {
    if (connection) await connection.end();
  }
}

module.exports = {
  getExams,
  getExamById,
  getSubjectsForExam,
  getTestsForExam,
  createExam,
  updateExam,
  deleteExam,
  addSubjectToExam,
  removeSubjectFromExam
};
