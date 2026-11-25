const { createDbConnection } = require('../config/db');

async function createQuestion(data) {
  let connection;
  try {
    connection = await createDbConnection();
    await connection.beginTransaction();

    let {
      test_id, question_text, question_type, marks, negative_marks,
      difficulty, explanation, display_order, category, subject, topic, subtopic, tags,
      subject_id, topic_id, subtopic_id,
      options // array of { option_text, option_key, is_correct, display_order }
    } = data;

    // Auto-resolve names from IDs if not provided
    if (topic_id && !topic) {
      const [tRows] = await connection.query('SELECT name, subject_id FROM topics WHERE id = ?', [topic_id]);
      if (tRows.length > 0) {
        topic = tRows[0].name;
        if (!subject_id) subject_id = tRows[0].subject_id;
      }
    }
    if (subtopic_id && !subtopic) {
      const [stRows] = await connection.query('SELECT name, topic_id FROM subtopics WHERE id = ?', [subtopic_id]);
      if (stRows.length > 0) {
        subtopic = stRows[0].name;
        if (!topic_id) topic_id = stRows[0].topic_id;
      }
    }
    if (subject_id && !subject) {
      const [sRows] = await connection.query('SELECT name FROM subjects WHERE id = ?', [subject_id]);
      if (sRows.length > 0) {
        subject = sRows[0].name;
      }
    }

    // Auto-resolve IDs from names if IDs are missing
    if (!topic_id && topic) {
      const [tRows] = await connection.query('SELECT id, subject_id FROM topics WHERE LOWER(name) = LOWER(?) LIMIT 1', [topic.trim()]);
      if (tRows.length > 0) {
        topic_id = tRows[0].id;
        if (!subject_id) subject_id = tRows[0].subject_id;
      }
    }
    if (!subject_id && subject) {
      const [sRows] = await connection.query('SELECT id FROM subjects WHERE LOWER(name) = LOWER(?) LIMIT 1', [subject.trim()]);
      if (sRows.length > 0) {
        subject_id = sRows[0].id;
      }
    }

    const [qResult] = await connection.query(`
      INSERT INTO questions (
        test_id, question_text, question_type, marks, negative_marks,
        difficulty, explanation, display_order, category, subject, topic, subtopic, tags,
        subject_id, topic_id, subtopic_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      test_id || null, question_text, question_type || 'MCQ', marks || 1, negative_marks || 0,
      difficulty || 'Medium', explanation, display_order || 0, category, subject, topic, subtopic, tags,
      subject_id || null, topic_id || null, subtopic_id || null
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

    // If test_id is passed, also ensure entry in test_questions junction table
    if (test_id) {
      try {
        const [maxOrder] = await connection.query(
          'SELECT COALESCE(MAX(question_order), 0) AS max_o FROM test_questions WHERE test_id = ?',
          [test_id]
        );
        const nextO = (maxOrder[0]?.max_o || 0) + 1;
        await connection.query(
          'INSERT IGNORE INTO test_questions (test_id, question_id, question_order) VALUES (?, ?, ?)',
          [test_id, questionId, nextO]
        );
      } catch (e) {}
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
    
    // Auto-resolve names if IDs are updated
    if (fieldsToUpdate.topic_id && !fieldsToUpdate.topic) {
      const [tRows] = await connection.query('SELECT name FROM topics WHERE id = ?', [fieldsToUpdate.topic_id]);
      if (tRows.length > 0) fieldsToUpdate.topic = tRows[0].name;
    }
    if (fieldsToUpdate.subtopic_id && !fieldsToUpdate.subtopic) {
      const [stRows] = await connection.query('SELECT name FROM subtopics WHERE id = ?', [fieldsToUpdate.subtopic_id]);
      if (stRows.length > 0) fieldsToUpdate.subtopic = stRows[0].name;
    }
    if (fieldsToUpdate.subject_id && !fieldsToUpdate.subject) {
      const [sRows] = await connection.query('SELECT name FROM subjects WHERE id = ?', [fieldsToUpdate.subject_id]);
      if (sRows.length > 0) fieldsToUpdate.subject = sRows[0].name;
    }

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
    try {
      await connection.query('DELETE FROM test_questions WHERE question_id = ?', [id]);
    } catch (e) {}
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
    const [qRows] = await connection.query(`
      SELECT 
        q.*,
        s.name AS resolved_subject_name,
        t.name AS resolved_topic_name,
        st.name AS resolved_subtopic_name
      FROM questions q
      LEFT JOIN subjects s ON s.id = q.subject_id
      LEFT JOIN topics t ON t.id = q.topic_id
      LEFT JOIN subtopics st ON st.id = q.subtopic_id
      WHERE q.id = ?
    `, [id]);
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
    let query = `
      SELECT 
        q.*,
        COALESCE(t.name, q.topic) AS topic_name,
        COALESCE(st.name, q.subtopic) AS subtopic_name,
        COALESCE(s.name, q.subject) AS subject_name
      FROM questions q
      LEFT JOIN subjects s ON s.id = q.subject_id
      LEFT JOIN topics t ON t.id = q.topic_id
      LEFT JOIN subtopics st ON st.id = q.subtopic_id
      WHERE 1=1
    `;
    const values = [];

    const stringFilterFields = ['category', 'subject', 'topic', 'subtopic', 'difficulty', 'question_type'];
    for (const field of stringFilterFields) {
      if (filters[field] !== undefined && filters[field] !== '') {
        query += ` AND q.${field} = ?`;
        values.push(filters[field]);
      }
    }

    const idFilterFields = ['subject_id', 'topic_id', 'subtopic_id'];
    for (const field of idFilterFields) {
      if (filters[field] !== undefined && filters[field] !== '') {
        query += ` AND q.${field} = ?`;
        values.push(filters[field]);
      }
    }

    if (filters.test_id !== undefined && filters.test_id !== '') {
      if (filters.test_id === 'null' || filters.test_id === 'none' || filters.test_id === 'unassigned') {
        query += ' AND q.test_id IS NULL AND q.id NOT IN (SELECT question_id FROM test_questions)';
      } else {
        query += ' AND (q.test_id = ? OR q.id IN (SELECT question_id FROM test_questions WHERE test_id = ?))';
        values.push(filters.test_id, filters.test_id);
      }
    }

    // Filter to exclude questions already attached to a given test (useful when picking from Question Bank)
    if (filters.exclude_test_id) {
      query += ' AND q.id NOT IN (SELECT question_id FROM test_questions WHERE test_id = ?) AND (q.test_id IS NULL OR q.test_id != ?)';
      values.push(filters.exclude_test_id, filters.exclude_test_id);
    }
    
    if (filters.search) {
      query += ' AND (q.question_text LIKE ? OR q.explanation LIKE ? OR q.tags LIKE ?)';
      values.push(`%${filters.search}%`, `%${filters.search}%`, `%${filters.search}%`);
    }

    query += ' ORDER BY q.created_at DESC, q.id DESC';
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
