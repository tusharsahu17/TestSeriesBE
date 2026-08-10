const { createDbConnection } = require('../config/db');

async function saveAnswer(attemptId, questionId, optionId) {
  let connection;
  try {
    connection = await createDbConnection();
    
    // Check if correct and get marks
    const [qRows] = await connection.query('SELECT marks, negative_marks FROM questions WHERE id = ?', [questionId]);
    const [optRows] = await connection.query('SELECT is_correct FROM question_options WHERE id = ?', [optionId]);
    
    const isCorrect = optRows[0]?.is_correct || false;
    let marksObtained = 0;
    if (isCorrect) {
      marksObtained = qRows[0]?.marks || 0;
    } else {
      marksObtained = -(qRows[0]?.negative_marks || 0);
    }

    // Upsert answer
    const [existing] = await connection.query(
      'SELECT id FROM attempt_answers WHERE attempt_id = ? AND question_id = ?', 
      [attemptId, questionId]
    );

    if (existing.length > 0) {
      await connection.query(`
        UPDATE attempt_answers 
        SET selected_option_id = ?, is_correct = ?, marks_obtained = ?, answered_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `, [optionId, isCorrect, marksObtained, existing[0].id]);
    } else {
      await connection.query(`
        INSERT INTO attempt_answers (attempt_id, question_id, selected_option_id, is_correct, marks_obtained)
        VALUES (?, ?, ?, ?, ?)
      `, [attemptId, questionId, optionId, isCorrect, marksObtained]);
    }

    return { success: true, isCorrect, marksObtained };
  } finally {
    if (connection) await connection.end();
  }
}

async function submitAttempt(attemptId) {
  let connection;
  try {
    connection = await createDbConnection();
    
    // Fetch attempt and test info
    const [attemptInfoRows] = await connection.query('SELECT test_id, total_questions FROM test_attempts WHERE id = ?', [attemptId]);
    if (attemptInfoRows.length === 0) throw new Error('Attempt not found');
    const attemptInfo = attemptInfoRows[0];
    
    const [testInfoRows] = await connection.query('SELECT total_marks FROM tests WHERE id = ?', [attemptInfo.test_id]);
    const totalMarks = testInfoRows[0]?.total_marks || 0;
    const totalQuestions = attemptInfo.total_questions || 0;

    // Calculate totals
    const [answers] = await connection.query('SELECT * FROM attempt_answers WHERE attempt_id = ?', [attemptId]);
    
    let correct = 0;
    let wrong = 0;
    let score = 0;

    answers.forEach(a => {
      if (a.is_correct) {
        correct++;
      } else if (a.is_correct === 0) { // Check explicitly for false, not null
        wrong++;
      }
      if (a.marks_obtained) {
        score += parseFloat(a.marks_obtained);
      }
    });

    const attempted = answers.length;
    const skipped = totalQuestions > attempted ? totalQuestions - attempted : 0;
    const percentage = totalMarks > 0 ? (score / totalMarks) * 100 : 0;

    await connection.query(`
      UPDATE test_attempts 
      SET status = 'COMPLETED', submitted_at = CURRENT_TIMESTAMP, 
          attempted_questions = ?, correct_answers = ?, wrong_answers = ?, skipped_questions = ?,
          obtained_marks = ?, total_marks = ?, percentage = ?
      WHERE id = ?
    `, [attempted, correct, wrong, skipped, score, totalMarks, percentage, attemptId]);

    return { success: true, score, percentage };
  } finally {
    if (connection) await connection.end();
  }
}

async function getAttemptResult(attemptId) {
  let connection;
  try {
    connection = await createDbConnection();
    const [attemptRows] = await connection.query('SELECT * FROM test_attempts WHERE id = ?', [attemptId]);
    if (attemptRows.length === 0) return null;
    
    const attempt = attemptRows[0];
    
    const [answers] = await connection.query('SELECT * FROM attempt_answers WHERE attempt_id = ?', [attemptId]);
    
    return {
      ...attempt,
      answers
    };
  } finally {
    if (connection) await connection.end();
  }
}

async function getAttemptAnswers(attemptId) {
  let connection;
  try {
    connection = await createDbConnection();
    const [attemptRows] = await connection.query('SELECT * FROM test_attempts WHERE id = ?', [attemptId]);
    if (attemptRows.length === 0) return null;
    const attempt = attemptRows[0];
    
    const [testRows] = await connection.query('SELECT name FROM tests WHERE id = ?', [attempt.test_id]);
    const testTitle = testRows[0]?.name || '';

    // fetch all questions for the test
    const [questions] = await connection.query(`
      SELECT * FROM questions 
      WHERE test_id = ? 
      ORDER BY display_order ASC, id ASC
    `, [attempt.test_id]);

    let optionsByQuestion = {};
    if (questions.length > 0) {
      const [options] = await connection.query(`
        SELECT id, question_id, option_text, is_correct
        FROM question_options 
        WHERE question_id IN (?)
        ORDER BY display_order ASC, id ASC
      `, [questions.map(q => q.id)]);
      
      optionsByQuestion = options.reduce((acc, opt) => {
        if (!acc[opt.question_id]) acc[opt.question_id] = [];
        acc[opt.question_id].push({
          id: opt.id,
          text: opt.option_text,
          is_correct: opt.is_correct
        });
        return acc;
      }, {});
    }

    // fetch attempt answers
    const [answers] = await connection.query('SELECT * FROM attempt_answers WHERE attempt_id = ?', [attemptId]);
    const answersByQuestion = answers.reduce((acc, ans) => {
      acc[ans.question_id] = ans;
      return acc;
    }, {});

    const mappedQuestions = questions.map((q, index) => {
      const qOptions = optionsByQuestion[q.id] || [];
      const userAns = answersByQuestion[q.id];
      const correctOpt = qOptions.find(o => o.is_correct);

      return {
        question_id: q.id,
        question_number: index + 1,
        question: q.question_text,
        options: qOptions.map(o => ({ id: o.id, text: o.text })),
        user_answer: userAns ? userAns.selected_option_id : null,
        correct_answer: correctOpt ? correctOpt.id : null,
        is_correct: userAns ? Boolean(userAns.is_correct) : false,
        is_skipped: !userAns,
        marks_obtained: userAns ? parseFloat(userAns.marks_obtained) : 0,
        time_taken_seconds: 0,
        explanation: q.explanation || ""
      };
    });

    return {
      attempt_id: attempt.id,
      test_id: attempt.test_id,
      test_title: testTitle,
      total_questions: attempt.total_questions,
      correct_answers: attempt.correct_answers,
      wrong_answers: attempt.wrong_answers,
      skipped_answers: attempt.skipped_questions,
      obtained_marks: parseFloat(attempt.obtained_marks),
      total_marks: parseFloat(attempt.total_marks),
      questions: mappedQuestions
    };
  } finally {
    if (connection) await connection.end();
  }
}

async function getAllAttempts(userId) {
  let connection;
  try {
    connection = await createDbConnection();
    let query = `
      SELECT a.*, t.name as test_name 
      FROM test_attempts a 
      LEFT JOIN tests t ON a.test_id = t.id 
      ORDER BY a.started_at DESC
    `;
    let params = [];
    if (userId) {
      query = `
        SELECT a.*, t.name as test_name 
        FROM test_attempts a 
        LEFT JOIN tests t ON a.test_id = t.id 
        WHERE a.user_id = ?
        ORDER BY a.started_at DESC
      `;
      params = [userId];
    }
    
    const [rows] = await connection.query(query, params);
    
    return rows.map(row => ({
      id: row.id,
      test_id: row.test_id,
      user_id: row.user_id,
      start_time: row.started_at,
      end_time: row.submitted_at,
      score: row.score || row.percentage || 0,
      status: row.status ? row.status.toLowerCase() : 'completed',
      test: {
        id: row.test_id,
        title: row.test_name || `Test #${row.test_id}`
      }
    }));
  } finally {
    if (connection) await connection.end();
  }
}

module.exports = {
  saveAnswer,
  submitAttempt,
  getAttemptResult,
  getAttemptAnswers,
  getAllAttempts
};
