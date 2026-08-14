const { createDbConnection } = require('../config/db');

async function createQuestion(data) {
  let connection;
  try {
    connection = await createDbConnection();
    await connection.beginTransaction();

    const {
      test_id, question_text, question_type, marks, negative_marks,
      difficulty, explanation, display_order, category, subject, topic, subtopic, tags,
      options // array of { option_text, option_key, is_correct, display_order }
    } = data;

    const [qResult] = await connection.query(`
      INSERT INTO questions (
        test_id, question_text, question_type, marks, negative_marks,
        difficulty, explanation, display_order, category, subject, topic, subtopic, tags
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      test_id || null, question_text, question_type || 'MCQ', marks || 1, negative_marks || 0,
      difficulty, explanation, display_order || 0, category, subject, topic, subtopic, tags
    ]);

    const questionId = qResult.insertId;

    if (options && Array.isArray(options)) {
      for (const opt of options) {
        await connection.query(`
          INSERT INTO question_options (question_id, option_text, option_key, is_correct, display_order)
          VALUES (?, ?, ?, ?, ?)
        `, [questionId, opt.option_text, opt.option_key, opt.is_correct ? 1 : 0, opt.display_order || 0]);
      }
    }

    await connection.commit();
    return questionId;
  } catch (err) {
    if (connection) await connection.rollback();
    throw err;
  } finally {
    if (connection) await connection.end();
  }
}

async function updateQuestion(id, data) {
  let connection;
  try {
    connection = await createDbConnection();
    await connection.beginTransaction();

    const { options, ...fieldsToUpdate } = data;
    
    if (Object.keys(fieldsToUpdate).length > 0) {
      const fields = [];
      const values = [];
      
      for (const [key, value] of Object.entries(fieldsToUpdate)) {
        fields.push(`${key} = ?`);
        values.push(value);
      }
      values.push(id);
      
      await connection.query(`UPDATE questions SET ${fields.join(', ')} WHERE id = ?`, values);
    }

    if (options && Array.isArray(options)) {
      // For simplicity, delete old options and insert new ones
      await connection.query('DELETE FROM question_options WHERE question_id = ?', [id]);
      
      for (const opt of options) {
        await connection.query(`
          INSERT INTO question_options (question_id, option_text, option_key, is_correct, display_order)
          VALUES (?, ?, ?, ?, ?)
        `, [id, opt.option_text, opt.option_key, opt.is_correct ? 1 : 0, opt.display_order || 0]);
      }
    }

    await connection.commit();
    return true;
  } catch (err) {
    if (connection) await connection.rollback();
    throw err;
  } finally {
    if (connection) await connection.end();
  }
}

async function deleteQuestion(id) {
  let connection;
  try {
    connection = await createDbConnection();
    await connection.beginTransaction();
    await connection.query('DELETE FROM question_options WHERE question_id = ?', [id]);
    await connection.query('DELETE FROM questions WHERE id = ?', [id]);
    await connection.commit();
    return true;
  } catch (err) {
    if (connection) await connection.rollback();
    throw err;
  } finally {
    if (connection) await connection.end();
  }
}

async function getQuestionDetails(id) {
  let connection;
  try {
    connection = await createDbConnection();
    const [qRows] = await connection.query('SELECT * FROM questions WHERE id = ?', [id]);
    if (qRows.length === 0) return null;
    
    const [oRows] = await connection.query('SELECT * FROM question_options WHERE question_id = ? ORDER BY display_order ASC', [id]);
    return { ...qRows[0], options: oRows };
  } finally {
    if (connection) await connection.end();
  }
}

async function getAllQuestions(filters = {}) {
  let connection;
  try {
    connection = await createDbConnection();
    let query = 'SELECT * FROM questions WHERE 1=1';
    const values = [];

    const filterFields = ['test_id', 'category', 'subject', 'topic', 'subtopic', 'difficulty', 'question_type'];
    
    for (const field of filterFields) {
      if (filters[field] !== undefined) {
        query += ` AND ${field} = ?`;
        values.push(filters[field]);
      }
    }
    
    if (filters.search) {
      query += ' AND question_text LIKE ?';
      values.push(`%${filters.search}%`);
    }

    query += ' ORDER BY created_at DESC';
    const [rows] = await connection.query(query, values);
    return rows;
  } finally {
    if (connection) await connection.end();
  }
}

async function bulkCreateQuestions(questionsArray) {
  for (const q of questionsArray) {
    await createQuestion(q);
  }
  return true;
}

module.exports = {
  createQuestion,
  updateQuestion,
  deleteQuestion,
  getQuestionDetails,
  getAllQuestions,
  bulkCreateQuestions
};
