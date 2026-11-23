const { createDbConnection } = require('../config/db');
const { loadTestQuestionsMap } = require('./studentDashboardModel');

async function getTestById(testId) {
  let connection;
  try {
    connection = await createDbConnection();
    const [rows] = await connection.query(`
      SELECT tests.*, e.name AS exam_name
      FROM tests
      LEFT JOIN exams e ON e.id = tests.exam_id
      WHERE tests.id = ?
    `, [testId]);
    return rows[0];
  } finally {
    if (connection) await connection.end();
  }
}

async function getQuestionsForTest(testId) {
  let connection;
  try {
    connection = await createDbConnection();
    const numericId = Number(testId);
    const questionsMap = await loadTestQuestionsMap(connection, [numericId]);
    const questions = questionsMap.get(numericId) || [];

    if (questions.length === 0) return [];

    const questionIds = questions.map(q => q.id);

    // Fetch options for these questions
    const [options] = await connection.query(`
      SELECT id, question_id, option_text, option_key, display_order 
      FROM question_options 
      WHERE question_id IN (?)
      ORDER BY display_order ASC, id ASC
    `, [questionIds]);

    // Group options by question_id
    const optionsByQuestion = options.reduce((acc, opt) => {
      if (!acc[opt.question_id]) acc[opt.question_id] = [];
      acc[opt.question_id].push(opt);
      return acc;
    }, {});

    // Attach options to questions
    return questions.map(q => ({
      ...q,
      options: optionsByQuestion[q.id] || []
    }));
  } finally {
    if (connection) await connection.end();
  }
}

async function startTestAttempt(userId, testId) {
  let connection;
  try {
    connection = await createDbConnection();
    
    // Fetch total questions for the attempt record
    const [test] = await connection.query('SELECT total_questions FROM tests WHERE id = ?', [testId]);
    const totalQuestions = test[0]?.total_questions || 0;

    const [result] = await connection.query(`
      INSERT INTO test_attempts (user_id, test_id, total_questions) 
      VALUES (?, ?, ?)
    `, [userId, testId, totalQuestions]);

    await connection.query('UPDATE users SET last_active_at = NOW() WHERE id = ?', [userId]);
    await connection.query(
      'INSERT INTO user_activity_logs (user_id, activity_type, reference_id) VALUES (?, ?, ?)',
      [userId, 'TEST_START', testId]
    );
    
    return { attemptId: result.insertId };
  } finally {
    if (connection) await connection.end();
  }
}
async function createTest(data) {
  let connection;
  try {
    connection = await createDbConnection();
    const { 
      exam_id, subject_id, name, description, duration_minutes, total_questions, 
      total_marks, passing_marks, difficulty, test_type, is_free, is_active, display_order,
      instructions, negative_marking, start_time, end_time, max_attempts, 
      randomize_questions, randomize_options, navigation_settings, auto_submit, is_published
    } = data;
    
    const [result] = await connection.query(`
      INSERT INTO tests (
        exam_id, subject_id, name, description, duration_minutes, total_questions, 
        total_marks, passing_marks, difficulty, test_type, is_free, is_active, display_order,
        instructions, negative_marking, start_time, end_time, max_attempts, 
        randomize_questions, randomize_options, navigation_settings, auto_submit, is_published
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      exam_id || null, subject_id || 1, name, description, duration_minutes, total_questions || 0,
      total_marks, passing_marks, difficulty, test_type, is_free !== undefined ? is_free : true, is_active !== undefined ? is_active : true, display_order || 0,
      instructions, negative_marking || 0.00, start_time, end_time, max_attempts || 1,
      randomize_questions || false, randomize_options || false, navigation_settings || 'free', auto_submit !== undefined ? auto_submit : true, is_published || false
    ]);
    return result.insertId;
  } finally {
    if (connection) await connection.end();
  }
}

async function updateTest(id, data) {
  let connection;
  try {
    connection = await createDbConnection();
    const fields = [];
    const values = [];

    const allowedFields = [
      'exam_id', 'subject_id', 'name', 'description', 'duration_minutes', 'total_questions', 
      'total_marks', 'passing_marks', 'difficulty', 'test_type', 'is_free', 'is_active', 'display_order',
      'instructions', 'negative_marking', 'start_time', 'end_time', 'max_attempts', 
      'randomize_questions', 'randomize_options', 'navigation_settings', 'auto_submit', 'is_published'
    ];

    for (const field of allowedFields) {
      if (data[field] !== undefined) {
        fields.push(`${field} = ?`);
        values.push(data[field]);
      }
    }

    if (fields.length === 0) return true;

    values.push(id);
    await connection.query(`UPDATE tests SET ${fields.join(', ')} WHERE id = ?`, values);
    return true;
  } finally {
    if (connection) await connection.end();
  }
}

async function deleteTest(id) {
  let connection;
  try {
    connection = await createDbConnection();
    await connection.beginTransaction();

    // 1. Unlink questions from this test so questions are preserved in Question Bank
    await connection.query('UPDATE questions SET test_id = NULL WHERE test_id = ?', [id]);

    // 2. If test_questions junction table exists, delete test associations
    try {
      const [tqExists] = await connection.query(
        `SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'test_questions'`
      );
      if (tqExists.length > 0) {
        await connection.query('DELETE FROM test_questions WHERE test_id = ?', [id]);
      }
    } catch (e) {
      // Ignore if table check fails
    }

    // 3. Clean up test_attempts and attempt_answers for this test if present
    try {
      const [attempts] = await connection.query('SELECT id FROM test_attempts WHERE test_id = ?', [id]);
      if (attempts.length > 0) {
        const attemptIds = attempts.map(a => a.id);
        await connection.query('DELETE FROM attempt_answers WHERE attempt_id IN (?)', [attemptIds]);
        await connection.query('DELETE FROM test_attempts WHERE test_id = ?', [id]);
      }
    } catch (e) {
      // Ignore if already cascaded by DB foreign key
    }

    // 4. Delete the test record
    await connection.query('DELETE FROM tests WHERE id = ?', [id]);

    await connection.commit();
    return true;
  } catch (err) {
    if (connection) await connection.rollback();
    throw err;
  } finally {
    if (connection) await connection.end();
  }
}

async function getAllTests(filters = {}) {
  let connection;
  try {
    connection = await createDbConnection();
    let query = `
      SELECT tests.*, e.name AS exam_name
      FROM tests
      LEFT JOIN exams e ON e.id = tests.exam_id
      WHERE 1=1
    `;
    const values = [];

    if (filters.is_published !== undefined) {
      query += ' AND tests.is_published = ?';
      values.push(filters.is_published);
    }

    if (filters.is_active !== undefined) {
      query += ' AND tests.is_active = ?';
      values.push(filters.is_active);
    }

    if (filters.exam_id) {
      query += ' AND tests.exam_id = ?';
      values.push(filters.exam_id);
    }
    
    query += ' ORDER BY tests.created_at DESC';
    const [rows] = await connection.query(query, values);
    return rows;
  } finally {
    if (connection) await connection.end();
  }
}

async function duplicateTest(id) {
  let connection;
  try {
    connection = await createDbConnection();
    await connection.beginTransaction();

    // 1. Get original test
    const [testRows] = await connection.query('SELECT * FROM tests WHERE id = ?', [id]);
    if (testRows.length === 0) throw new Error('Test not found');
    const og = testRows[0];

    // 2. Insert new test
    const [result] = await connection.query(`
      INSERT INTO tests (
        exam_id, subject_id, name, description, duration_minutes, total_questions, 
        total_marks, passing_marks, difficulty, test_type, is_free, is_active, display_order,
        instructions, negative_marking, start_time, end_time, max_attempts, 
        randomize_questions, randomize_options, navigation_settings, auto_submit, is_published
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      og.exam_id || null, og.subject_id, og.name + ' (Copy)', og.description, og.duration_minutes, og.total_questions,
      og.total_marks, og.passing_marks, og.difficulty, og.test_type, og.is_free, og.is_active, og.display_order,
      og.instructions, og.negative_marking, og.start_time, og.end_time, og.max_attempts,
      og.randomize_questions, og.randomize_options, og.navigation_settings, og.auto_submit, false // new test is not published
    ]);
    const newTestId = result.insertId;

    // 3. Duplicate questions
    const [questions] = await connection.query('SELECT * FROM questions WHERE test_id = ?', [id]);
    
    for (const q of questions) {
      const [qResult] = await connection.query(`
        INSERT INTO questions (
          test_id, question_text, question_type, marks, negative_marks,
          difficulty, explanation, display_order, category, subject, topic, subtopic, tags
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        newTestId, q.question_text, q.question_type || 'MCQ', q.marks || 1, q.negative_marks || 0,
        q.difficulty, q.explanation, q.display_order || 0, q.category, q.subject, q.topic, q.subtopic, q.tags
      ]);
      const newQuestionId = qResult.insertId;

      // 4. Duplicate question options
      const [options] = await connection.query('SELECT * FROM question_options WHERE question_id = ?', [q.id]);
      for (const opt of options) {
        await connection.query(`
          INSERT INTO question_options (question_id, option_text, option_key, is_correct, display_order)
          VALUES (?, ?, ?, ?, ?)
        `, [newQuestionId, opt.option_text, opt.option_key, opt.is_correct ? 1 : 0, opt.display_order || 0]);
      }
    }

    await connection.commit();
    return newTestId;
  } catch (err) {
    if (connection) await connection.rollback();
    throw err;
  } finally {
    if (connection) await connection.end();
  }
}

module.exports = {
  getTestById,
  getQuestionsForTest,
  startTestAttempt,
  createTest,
  updateTest,
  deleteTest,
  getAllTests,
  duplicateTest
};
