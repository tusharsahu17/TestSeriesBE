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

module.exports = {
  getTestById,
  getQuestionsForTest,
  startTestAttempt
};
