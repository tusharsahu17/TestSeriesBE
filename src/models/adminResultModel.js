const { createDbConnection } = require('../config/db');

async function getTestWiseResults(testId) {
  let connection;
  try {
    connection = await createDbConnection();
    // Get all attempts for a test, ranked by obtained_marks descending, then time_taken ascending
    const [rows] = await connection.query(`
      SELECT 
        ta.*, 
        u.name as user_name, u.email as user_email
      FROM test_attempts ta
      JOIN users u ON ta.user_id = u.id
      WHERE ta.test_id = ? AND ta.status = 'COMPLETED'
      ORDER BY ta.obtained_marks DESC, ta.time_taken_seconds ASC
    `, [testId]);
    
    // Calculate percentiles
    const totalAttempts = rows.length;
    return rows.map((row, index) => {
      // Percentile = (Number of people behind you / Total people) * 100
      // Since it's ordered by rank (index 0 is rank 1)
      const peopleBehind = totalAttempts - (index + 1);
      const percentile = totalAttempts > 1 ? (peopleBehind / (totalAttempts - 1)) * 100 : 100;
      return {
        ...row,
        calculated_rank: index + 1,
        percentile: percentile.toFixed(2),
        accuracy: row.attempted_questions > 0 ? ((row.correct_answers / row.attempted_questions) * 100).toFixed(2) : 0,
        avg_time_per_question: row.attempted_questions > 0 ? (row.time_taken_seconds / row.attempted_questions).toFixed(2) : 0
      };
    });
  } finally {
    if (connection) await connection.end();
  }
}

async function getUserWiseResults(userId) {
  let connection;
  try {
    connection = await createDbConnection();
    const [rows] = await connection.query(`
      SELECT 
        ta.*, 
        t.name as test_name
      FROM test_attempts ta
      JOIN tests t ON ta.test_id = t.id
      WHERE ta.user_id = ?
      ORDER BY ta.created_at DESC
    `, [userId]);
    
    return rows.map(row => ({
      ...row,
      accuracy: row.attempted_questions > 0 ? ((row.correct_answers / row.attempted_questions) * 100).toFixed(2) : 0
    }));
  } finally {
    if (connection) await connection.end();
  }
}

async function getIndividualResult(attemptId) {
  let connection;
  try {
    connection = await createDbConnection();
    
    // 1. Get attempt summary
    const [attempts] = await connection.query(`
      SELECT 
        ta.*, 
        u.name as user_name, u.email as user_email,
        t.name as test_name
      FROM test_attempts ta
      JOIN users u ON ta.user_id = u.id
      JOIN tests t ON ta.test_id = t.id
      WHERE ta.id = ?
    `, [attemptId]);

    if (attempts.length === 0) return null;
    const attempt = attempts[0];

    // 2. Get detailed question by question breakdown
    const [answers] = await connection.query(`
      SELECT 
        aa.*,
        q.question_text, q.marks, q.negative_marks, q.question_type, q.difficulty, q.explanation
      FROM attempt_answers aa
      JOIN questions q ON aa.question_id = q.id
      WHERE aa.attempt_id = ?
    `, [attemptId]);

    return {
      summary: {
        ...attempt,
        accuracy: attempt.attempted_questions > 0 ? ((attempt.correct_answers / attempt.attempted_questions) * 100).toFixed(2) : 0,
        avg_time_per_question: attempt.attempted_questions > 0 ? (attempt.time_taken_seconds / attempt.attempted_questions).toFixed(2) : 0
      },
      detailed_answers: answers
    };
  } finally {
    if (connection) await connection.end();
  }
}

async function recalculateTestResults(testId) {
  let connection;
  try {
    connection = await createDbConnection();
    await connection.beginTransaction();

    // 1. Fetch current questions and their correct options
    const [questions] = await connection.query('SELECT * FROM questions WHERE test_id = ?', [testId]);
    
    if (questions.length === 0) {
      await connection.rollback();
      return { message: 'No questions found for this test.' };
    }

    const questionIds = questions.map(q => q.id);
    const [options] = await connection.query('SELECT * FROM question_options WHERE question_id IN (?)', [questionIds]);

    // Build a map of questionId -> { question, correctOptionIds }
    const questionMap = {};
    for (const q of questions) {
      const correctOpts = options.filter(o => o.question_id === q.id && o.is_correct === 1).map(o => o.id);
      questionMap[q.id] = {
        ...q,
        correctOptionIds: correctOpts
      };
    }

    // 2. Fetch all completed attempts for this test
    const [attempts] = await connection.query('SELECT * FROM test_attempts WHERE test_id = ? AND status = "COMPLETED"', [testId]);

    for (const attempt of attempts) {
      // Fetch answers for this attempt
      const [answers] = await connection.query('SELECT * FROM attempt_answers WHERE attempt_id = ?', [attempt.id]);

      let totalMarks = 0;
      let obtainedMarks = 0;
      let correctAnswersCount = 0;
      let wrongAnswersCount = 0;
      let skippedQuestionsCount = 0;
      let attemptedQuestionsCount = 0;

      for (const ans of answers) {
        const qData = questionMap[ans.question_id];
        
        // If question was deleted from test, skip it in calculation
        if (!qData) continue;
        
        totalMarks += parseFloat(qData.marks);

        if (ans.selected_option_id === null) {
          skippedQuestionsCount++;
          // Update attempt_answers
          await connection.query('UPDATE attempt_answers SET is_correct = 0, marks_obtained = 0 WHERE id = ?', [ans.id]);
        } else {
          attemptedQuestionsCount++;
          const isCorrect = qData.correctOptionIds.includes(ans.selected_option_id);
          
          let marksObtainedForQ = 0;
          if (isCorrect) {
            correctAnswersCount++;
            marksObtainedForQ = parseFloat(qData.marks);
          } else {
            wrongAnswersCount++;
            marksObtainedForQ = -parseFloat(qData.negative_marks);
          }
          
          obtainedMarks += marksObtainedForQ;

          // Update attempt_answers
          await connection.query('UPDATE attempt_answers SET is_correct = ?, marks_obtained = ? WHERE id = ?', [
            isCorrect ? 1 : 0, marksObtainedForQ, ans.id
          ]);
        }
      }

      // Update test_attempts
      const percentage = totalMarks > 0 ? (obtainedMarks / totalMarks) * 100 : 0;
      
      await connection.query(`
        UPDATE test_attempts 
        SET 
          total_questions = ?,
          attempted_questions = ?,
          correct_answers = ?,
          wrong_answers = ?,
          skipped_questions = ?,
          total_marks = ?,
          obtained_marks = ?,
          percentage = ?
        WHERE id = ?
      `, [
        questions.length,
        attemptedQuestionsCount,
        correctAnswersCount,
        wrongAnswersCount,
        skippedQuestionsCount,
        totalMarks,
        obtainedMarks,
        percentage,
        attempt.id
      ]);
    }

    // 3. Recalculate ranks based on newly calculated obtained_marks
    const [updatedAttempts] = await connection.query(`
      SELECT id FROM test_attempts 
      WHERE test_id = ? AND status = 'COMPLETED' 
      ORDER BY obtained_marks DESC, time_taken_seconds ASC
    `, [testId]);

    for (let i = 0; i < updatedAttempts.length; i++) {
      await connection.query('UPDATE test_attempts SET rank = ? WHERE id = ?', [i + 1, updatedAttempts[i].id]);
    }

    await connection.commit();
    return { message: `Recalculated results for ${attempts.length} attempts.` };
  } catch (err) {
    if (connection) await connection.rollback();
    throw err;
  } finally {
    if (connection) await connection.end();
  }
}

module.exports = {
  getTestWiseResults,
  getUserWiseResults,
  getIndividualResult,
  recalculateTestResults
};
