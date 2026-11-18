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

async function getAllSubjects() {
  let connection;
  try {
    connection = await createDbConnection();
    const [rows] = await connection.query(`SELECT * FROM subjects ORDER BY id ASC`);
    return rows;
  } finally {
    if (connection) await connection.end();
  }
}

async function createSubject(data) {
  let connection;
  try {
    connection = await createDbConnection();
    const { name, description, is_active } = data;
    const [result] = await connection.query(
      `INSERT INTO subjects (name, description, is_active) VALUES (?, ?, ?)`,
      [name, description, is_active !== undefined ? is_active : 1]
    );
    return result.insertId;
  } finally {
    if (connection) await connection.end();
  }
}

async function updateSubject(id, data) {
  let connection;
  try {
    connection = await createDbConnection();
    const { name, description, is_active } = data;
    await connection.query(
      `UPDATE subjects SET name = ?, description = ?, is_active = ? WHERE id = ?`,
      [name, description, is_active, id]
    );
    return true;
  } finally {
    if (connection) await connection.end();
  }
}

async function deleteSubject(id) {
  let connection;
  try {
    connection = await createDbConnection();
    await connection.beginTransaction();

    // Unlink questions tied to tests of this subject before deleting subject so they remain in Question Bank
    try {
      await connection.query(`
        UPDATE questions q
        JOIN tests t ON q.test_id = t.id
        SET q.test_id = NULL
        WHERE t.subject_id = ?
      `, [id]);
    } catch (e) {
      // Ignore if table/column difference
    }

    await connection.query(`DELETE FROM subjects WHERE id = ?`, [id]);
    await connection.commit();
    return true;
  } catch (err) {
    if (connection) await connection.rollback();
    throw err;
  } finally {
    if (connection) await connection.end();
  }
}

module.exports = {
  getTestsBySubjectId,
  getAllSubjects,
  createSubject,
  updateSubject,
  deleteSubject
};
