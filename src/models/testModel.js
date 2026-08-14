const { createDbConnection } = require('../config/db');

async function getTestById(testId) {
  let connection;
  try {
    connection = await createDbConnection();
    const [rows] = await connection.query('SELECT * FROM tests WHERE id = ?', [testId]);
    return rows[0];
  } finally {
    if (connection) await connection.end();
  }
}

async function getQuestionsForTest(testId) {
  let connection;
  try {
    connection = await createDbConnection();
    // Fetch questions
    const [questions] = await connection.query(`
      SELECT * FROM questions 
      WHERE test_id = ? 
      ORDER BY display_order ASC
    `, [testId]);
    
    if (questions.length === 0) return [];

    const questionIds = questions.map(q => q.id);
    
    // Fetch options for these questions
    const [options] = await connection.query(`
      SELECT id, question_id, option_text, option_key, display_order 
      FROM question_options 
      WHERE question_id IN (?)
      ORDER BY display_order ASC
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
      subject_id, name, description, duration_minutes, total_questions, 
      total_marks, passing_marks, difficulty, test_type, is_free, is_active, display_order,
      instructions, negative_marking, start_time, end_time, max_attempts, 
      randomize_questions, randomize_options, navigation_settings, auto_submit, is_published
    } = data;
    
    const [result] = await connection.query(`
      INSERT INTO tests (
        subject_id, name, description, duration_minutes, total_questions, 
        total_marks, passing_marks, difficulty, test_type, is_free, is_active, display_order,
        instructions, negative_marking, start_time, end_time, max_attempts, 
        randomize_questions, randomize_options, navigation_settings, auto_submit, is_published
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      subject_id || 1, name, description, duration_minutes, total_questions || 0,
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
      'subject_id', 'name', 'description', 'duration_minutes', 'total_questions', 
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
    // Assuming questions have ON DELETE CASCADE or we delete them manually if not
    await connection.query('DELETE FROM tests WHERE id = ?', [id]);
    return true;
  } finally {
    if (connection) await connection.end();
  }
}

async function getAllTests(filters = {}) {
  let connection;
  try {
    connection = await createDbConnection();
    let query = 'SELECT * FROM tests WHERE 1=1';
    const values = [];

    if (filters.is_published !== undefined) {
      query += ' AND is_published = ?';
      values.push(filters.is_published);
    }
    
    query += ' ORDER BY created_at DESC';
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
        subject_id, name, description, duration_minutes, total_questions, 
        total_marks, passing_marks, difficulty, test_type, is_free, is_active, display_order,
        instructions, negative_marking, start_time, end_time, max_attempts, 
        randomize_questions, randomize_options, navigation_settings, auto_submit, is_published
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      og.subject_id, og.name + ' (Copy)', og.description, og.duration_minutes, og.total_questions,
      og.total_marks, og.passing_marks, og.difficulty, og.test_type, og.is_free, og.is_active, og.display_order,
      og.instructions, og.negative_marking, og.start_time, og.end_time, og.max_attempts,
      og.randomize_questions, og.randomize_options, og.navigation_settings, og.auto_submit, false // new test is not published
    ]);
    const newTestId = result.insertId;

    // 3. Duplicate questions
    const [questions] = await connection.query('SELECT * FROM questions WHERE test_id = ?', [id]);
    
    for (const q of questions) {
      const [qResult] = await connection.query(`
        INSERT INTO questions (test_id, question_text, question_type, marks, display_order, correct_option)
        VALUES (?, ?, ?, ?, ?, ?)
      `, [newTestId, q.question_text, q.question_type, q.marks, q.display_order, q.correct_option]);
      const newQuestionId = qResult.insertId;

      // 4. Duplicate question options
      const [options] = await connection.query('SELECT * FROM question_options WHERE question_id = ?', [q.id]);
      for (const opt of options) {
        await connection.query(`
          INSERT INTO question_options (question_id, option_text, option_key, display_order)
          VALUES (?, ?, ?, ?)
        `, [newQuestionId, opt.option_text, opt.option_key, opt.display_order]);
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
