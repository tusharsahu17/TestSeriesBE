const { createDbConnection } = require('../config/db');
const { loadTestQuestionsMap, computeAttemptEvaluation } = require('./studentDashboardModel');
const notificationModel = require('./notificationModel');

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

    const numericTestId = Number(testId);
    const [testRows] = await connection.query('SELECT id, negative_marking FROM tests WHERE id = ?', [numericTestId]);
    const testNegativeMarking = testRows.length > 0 ? Number(testRows[0].negative_marking || 0) : 0;

    // 1. Fetch current questions (direct + mapped via test_questions) and their correct options
    const questionsMap = await loadTestQuestionsMap(connection, [numericTestId]);
    const questions = questionsMap.get(numericTestId) || [];

    if (questions.length === 0) {
      await connection.rollback();
      return { message: 'No questions found for this test.' };
    }

    const questionIds = questions.map(q => q.id);
    const [options] = await connection.query('SELECT * FROM question_options WHERE question_id IN (?)', [questionIds]);

    const questionMap = {};
    let testTotalMarks = 0;
    for (const q of questions) {
      const qMarks = Number(q.marks) > 0 ? Number(q.marks) : 1;
      testTotalMarks += qMarks;
      const correctOpts = options.filter(o => o.question_id === q.id && o.is_correct === 1).map(o => o.id);
      questionMap[q.id] = {
        ...q,
        effectiveMarks: qMarks,
        effectiveNegativeMarks: Number(q.negative_marks) > 0 ? Number(q.negative_marks) : testNegativeMarking,
        correctOptionIds: correctOpts
      };
    }

    // 2. Fetch all completed/submitted attempts for this test
    const [attempts] = await connection.query(
      "SELECT * FROM test_attempts WHERE test_id = ? AND UPPER(status) IN ('COMPLETED', 'EVALUATED', 'SUBMITTED', 'PENDING_EVALUATION')",
      [numericTestId]
    );

    for (const attempt of attempts) {
      const [answers] = await connection.query('SELECT * FROM attempt_answers WHERE attempt_id = ?', [attempt.id]);
      const answersByQ = new Map();
      for (const ans of answers) {
        answersByQ.set(Number(ans.question_id), ans);
      }

      let obtainedMarks = 0;
      let correctAnswersCount = 0;
      let wrongAnswersCount = 0;
      let skippedQuestionsCount = 0;
      let attemptedQuestionsCount = 0;

      for (const q of questions) {
        const qData = questionMap[q.id];
        const ans = answersByQ.get(Number(q.id));

        if (!ans || ans.selected_option_id === null || ans.selected_option_id === undefined) {
          skippedQuestionsCount++;
          if (ans) {
            await connection.query('UPDATE attempt_answers SET is_correct = NULL, marks_obtained = 0 WHERE id = ?', [ans.id]);
          }
        } else {
          attemptedQuestionsCount++;
          const isCorrect = qData.correctOptionIds.includes(ans.selected_option_id);
          const marksObtainedForQ = isCorrect ? qData.effectiveMarks : -qData.effectiveNegativeMarks;
          if (isCorrect) correctAnswersCount++;
          else wrongAnswersCount++;
          obtainedMarks += marksObtainedForQ;

          await connection.query('UPDATE attempt_answers SET is_correct = ?, marks_obtained = ? WHERE id = ?', [
            isCorrect ? 1 : 0, marksObtainedForQ, ans.id
          ]);
        }
      }

      const percentage = testTotalMarks > 0 ? (obtainedMarks / testTotalMarks) * 100 : 0;

      await connection.query(`
        UPDATE test_attempts 
        SET 
          status = 'COMPLETED',
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
        testTotalMarks,
        obtainedMarks,
        percentage,
        attempt.id
      ]);
    }

    // 3. Recalculate ranks based on newly calculated obtained_marks
    const [updatedAttempts] = await connection.query(`
      SELECT id FROM test_attempts 
      WHERE test_id = ? AND UPPER(status) IN ('COMPLETED', 'EVALUATED')
      ORDER BY obtained_marks DESC, time_taken_seconds ASC
    `, [numericTestId]);

    for (let i = 0; i < updatedAttempts.length; i++) {
      await connection.query('UPDATE test_attempts SET rank = ? WHERE id = ?', [i + 1, updatedAttempts[i].id]);
    }

    await connection.commit();
    for (const attempt of attempts) {
      await notificationModel.notifyResultPublished(connection, attempt.id);
    }
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
