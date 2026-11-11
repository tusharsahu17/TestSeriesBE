const { createDbConnection } = require('../config/db');
const {
  isAttemptEvaluated,
  loadTestQuestionsMap,
  computeAttemptEvaluation,
} = require('./studentDashboardModel');
const notificationModel = require('./notificationModel');

async function saveAnswer(attemptId, questionId, optionId, userId = null) {
  let connection;
  try {
    connection = await createDbConnection();

    const [attemptRows] = await connection.query(
      'SELECT id, user_id, test_id, status FROM test_attempts WHERE id = ?',
      [attemptId]
    );
    if (attemptRows.length === 0) {
      const err = new Error('Attempt not found');
      err.status = 404;
      throw err;
    }
    const attempt = attemptRows[0];
    if (userId && Number(attempt.user_id) !== Number(userId)) {
      const err = new Error('Unauthorized access to this attempt');
      err.status = 403;
      throw err;
    }
    if (String(attempt.status || '').toUpperCase() !== 'IN_PROGRESS') {
      const err = new Error('Cannot save answers for an attempt that is not in progress');
      err.status = 400;
      throw err;
    }

    const [qRows] = await connection.query(
      `SELECT q.id, q.marks, q.negative_marks, t.negative_marking AS test_negative_marking
       FROM questions q
       LEFT JOIN tests t ON t.id = ?
       WHERE q.id = ?`,
      [attempt.test_id, questionId]
    );
    if (qRows.length === 0) {
      const err = new Error('Question not found');
      err.status = 404;
      throw err;
    }

    const q = qRows[0];
    let isCorrect = null;
    let marksObtained = 0;

    if (optionId !== null && optionId !== undefined) {
      const [optRows] = await connection.query(
        'SELECT is_correct FROM question_options WHERE id = ? AND question_id = ?',
        [optionId, questionId]
      );
      if (optRows.length === 0) {
        const err = new Error('Option not found for this question');
        err.status = 400;
        throw err;
      }
      isCorrect = Boolean(optRows[0].is_correct);
      if (isCorrect) {
        marksObtained = Number(q.marks) > 0 ? Number(q.marks) : 1;
      } else {
        const neg =
          Number(q.negative_marks) > 0
            ? Number(q.negative_marks)
            : Number(q.test_negative_marking || 0);
        marksObtained = -neg;
      }
    }

    const [existing] = await connection.query(
      'SELECT id FROM attempt_answers WHERE attempt_id = ? AND question_id = ?',
      [attemptId, questionId]
    );

    if (existing.length > 0) {
      await connection.query(
        `UPDATE attempt_answers
         SET selected_option_id = ?, is_correct = ?, marks_obtained = ?, answered_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [optionId ?? null, isCorrect === null ? null : isCorrect ? 1 : 0, marksObtained, existing[0].id]
      );
    } else {
      await connection.query(
        `INSERT INTO attempt_answers (attempt_id, question_id, selected_option_id, is_correct, marks_obtained)
         VALUES (?, ?, ?, ?, ?)`,
        [attemptId, questionId, optionId ?? null, isCorrect === null ? null : isCorrect ? 1 : 0, marksObtained]
      );
    }

    return { success: true, isCorrect: Boolean(isCorrect), marksObtained };
  } finally {
    if (connection) await connection.end();
  }
}

async function submitAttempt(attemptId, timeTakenSeconds = null, userId = null) {
  let connection;
  try {
    connection = await createDbConnection();

    const [attemptRows] = await connection.query(
      `SELECT
         ta.*,
         t.total_questions AS test_total_questions,
         t.total_marks AS test_total_marks,
         t.passing_marks,
         t.negative_marking AS test_negative_marking,
         COALESCE(s.name, 'General') AS test_subject_name
       FROM test_attempts ta
       LEFT JOIN tests t ON t.id = ta.test_id
       LEFT JOIN subjects s ON s.id = t.subject_id
       WHERE ta.id = ?`,
      [attemptId]
    );
    if (attemptRows.length === 0) {
      const err = new Error('Attempt not found');
      err.status = 404;
      throw err;
    }
    const attemptInfo = attemptRows[0];
    if (userId && Number(attemptInfo.user_id) !== Number(userId)) {
      const err = new Error('Unauthorized access to this attempt');
      err.status = 403;
      throw err;
    }
    if (String(attemptInfo.status || '').toUpperCase() !== 'IN_PROGRESS') {
      const err = new Error('Attempt is already submitted or no longer active');
      err.status = 400;
      throw err;
    }

    const questionsMap = await loadTestQuestionsMap(connection, [attemptInfo.test_id]);
    const testQuestions = questionsMap.get(Number(attemptInfo.test_id)) || [];

    const [answerRows] = await connection.query(
      `SELECT
         aa.*,
         qo.is_correct AS option_is_correct,
         q.marks AS question_marks,
         q.negative_marks AS question_negative_marks,
         q.subject AS question_subject
       FROM attempt_answers aa
       LEFT JOIN question_options qo ON qo.id = aa.selected_option_id
       LEFT JOIN questions q ON q.id = aa.question_id
       WHERE aa.attempt_id = ?`,
      [attemptId]
    );

    const evalMetrics = computeAttemptEvaluation(
      {
        ...attemptInfo,
        time_taken_seconds: timeTakenSeconds || attemptInfo.time_taken_seconds,
      },
      testQuestions,
      answerRows
    );

    await connection.query(
      `UPDATE test_attempts
       SET status = 'COMPLETED',
           submitted_at = CURRENT_TIMESTAMP,
           total_questions = ?,
           attempted_questions = ?,
           correct_answers = ?,
           wrong_answers = ?,
           skipped_questions = ?,
           obtained_marks = ?,
           total_marks = ?,
           percentage = ?,
           time_taken_seconds = COALESCE(NULLIF(?, 0), GREATEST(TIMESTAMPDIFF(SECOND, started_at, CURRENT_TIMESTAMP), 0))
       WHERE id = ?`,
      [
        evalMetrics.totalQuestions,
        evalMetrics.attemptedQuestions,
        evalMetrics.correctAnswers,
        evalMetrics.wrongAnswers,
        evalMetrics.skippedQuestions,
        evalMetrics.obtainedMarks,
        evalMetrics.totalMarks,
        evalMetrics.percentage,
        timeTakenSeconds || 0,
        attemptId,
      ]
    );

    await connection.query('UPDATE users SET last_active_at = NOW() WHERE id = ?', [attemptInfo.user_id]);
    await connection.query(
      'INSERT INTO user_activity_logs (user_id, activity_type, reference_id) VALUES (?, ?, ?)',
      [attemptInfo.user_id, 'TEST_SUBMIT', attemptId]
    );

    await notificationModel.notifyResultPublished(connection, attemptId);

    return {
      success: true,
      score: evalMetrics.obtainedMarks,
      totalMarks: evalMetrics.totalMarks,
      percentage: evalMetrics.percentage,
      accuracy: evalMetrics.accuracy,
      resultStatus: evalMetrics.resultStatus,
    };
  } finally {
    if (connection) await connection.end();
  }
}

async function getAttemptResult(attemptId, userId = null) {
  let connection;
  try {
    connection = await createDbConnection();
    const [attemptRows] = await connection.query(
      `SELECT
         ta.*,
         COALESCE(t.name, CONCAT('Test #', ta.test_id)) AS test_name,
         t.total_questions AS test_total_questions,
         t.total_marks AS test_total_marks,
         t.passing_marks,
         t.negative_marking AS test_negative_marking,
         COALESCE(s.name, 'General') AS test_subject_name
       FROM test_attempts ta
       LEFT JOIN tests t ON t.id = ta.test_id
       LEFT JOIN subjects s ON s.id = t.subject_id
       WHERE ta.id = ?`,
      [attemptId]
    );
    if (attemptRows.length === 0) return null;

    const attempt = attemptRows[0];
    if (userId && Number(attempt.user_id) !== Number(userId)) {
      const err = new Error('Unauthorized access to this attempt');
      err.status = 403;
      throw err;
    }

    if (!isAttemptEvaluated(attempt)) {
      const err = new Error('Result is not available until test evaluation is complete');
      err.status = 403;
      err.code = 'EVALUATION_PENDING';
      throw err;
    }

    const questionsMap = await loadTestQuestionsMap(connection, [attempt.test_id]);
    const testQuestions = questionsMap.get(Number(attempt.test_id)) || [];

    const [answers] = await connection.query(
      `SELECT
         aa.*,
         qo.is_correct AS option_is_correct,
         q.marks AS question_marks,
         q.negative_marks AS question_negative_marks,
         q.subject AS question_subject
       FROM attempt_answers aa
       LEFT JOIN question_options qo ON qo.id = aa.selected_option_id
       LEFT JOIN questions q ON q.id = aa.question_id
       WHERE aa.attempt_id = ?`,
      [attemptId]
    );

    const evalMetrics = computeAttemptEvaluation(attempt, testQuestions, answers);

    return {
      ...attempt,
      total_questions: evalMetrics.totalQuestions,
      attempted_questions: evalMetrics.attemptedQuestions,
      correct_answers: evalMetrics.correctAnswers,
      wrong_answers: evalMetrics.wrongAnswers,
      skipped_questions: evalMetrics.skippedQuestions,
      total_marks: evalMetrics.totalMarks,
      obtained_marks: evalMetrics.obtainedMarks,
      percentage: evalMetrics.percentage,
      accuracy: evalMetrics.accuracy,
      time_taken_seconds: evalMetrics.timeTakenSeconds,
      result_status: evalMetrics.resultStatus,
      subject_wise_performance: evalMetrics.subjectBreakdown,
      answers,
    };
  } finally {
    if (connection) await connection.end();
  }
}

async function getAttemptAnswers(attemptId, userId = null) {
  let connection;
  try {
    connection = await createDbConnection();
    const [attemptRows] = await connection.query(
      `SELECT
         ta.*,
         COALESCE(t.name, CONCAT('Test #', ta.test_id)) AS test_name,
         t.total_questions AS test_total_questions,
         t.total_marks AS test_total_marks,
         t.passing_marks,
         t.negative_marking AS test_negative_marking,
         COALESCE(s.name, 'General') AS test_subject_name
       FROM test_attempts ta
       LEFT JOIN tests t ON t.id = ta.test_id
       LEFT JOIN subjects s ON s.id = t.subject_id
       WHERE ta.id = ?`,
      [attemptId]
    );
    if (attemptRows.length === 0) return null;
    const attempt = attemptRows[0];

    if (userId && Number(attempt.user_id) !== Number(userId)) {
      const err = new Error('Unauthorized access to this attempt');
      err.status = 403;
      throw err;
    }

    if (!isAttemptEvaluated(attempt)) {
      const err = new Error('Answers and explanations are not available until evaluation is complete');
      err.status = 403;
      err.code = 'EVALUATION_PENDING';
      throw err;
    }

    const questionsMap = await loadTestQuestionsMap(connection, [attempt.test_id]);
    const questions = questionsMap.get(Number(attempt.test_id)) || [];

    let optionsByQuestion = {};
    if (questions.length > 0) {
      const [options] = await connection.query(
        `SELECT id, question_id, option_text, option_key, is_correct
         FROM question_options
         WHERE question_id IN (?)
         ORDER BY display_order ASC, id ASC`,
        [questions.map((q) => q.id)]
      );

      optionsByQuestion = options.reduce((acc, opt) => {
        if (!acc[opt.question_id]) acc[opt.question_id] = [];
        acc[opt.question_id].push({
          id: opt.id,
          key: opt.option_key || null,
          text: opt.option_text,
          is_correct: Boolean(opt.is_correct),
        });
        return acc;
      }, {});
    }

    const [answers] = await connection.query(
      `SELECT
         aa.*,
         qo.is_correct AS option_is_correct,
         q.marks AS question_marks,
         q.negative_marks AS question_negative_marks,
         q.subject AS question_subject
       FROM attempt_answers aa
       LEFT JOIN question_options qo ON qo.id = aa.selected_option_id
       LEFT JOIN questions q ON q.id = aa.question_id
       WHERE aa.attempt_id = ?`,
      [attemptId]
    );

    const evalMetrics = computeAttemptEvaluation(attempt, questions, answers);

    const answersByQuestion = answers.reduce((acc, ans) => {
      acc[ans.question_id] = ans;
      return acc;
    }, {});

    const testNegativeMarking = Number(attempt.test_negative_marking || 0);
    const mappedQuestions = questions.map((q, index) => {
      const qOptions = optionsByQuestion[q.id] || [];
      const userAns = answersByQuestion[q.id];
      const correctOpt = qOptions.find((o) => o.is_correct);
      const selectedOpt = userAns?.selected_option_id
        ? qOptions.find((o) => o.id === userAns.selected_option_id)
        : null;
      const isSkipped = !userAns || userAns.selected_option_id === null || userAns.selected_option_id === undefined;
      const isCorrect = !isSkipped && (selectedOpt ? selectedOpt.is_correct : Boolean(userAns.is_correct));
      const qMarks = Number(q.marks) > 0 ? Number(q.marks) : 1;
      const qNeg = Number(q.negative_marks) > 0 ? Number(q.negative_marks) : testNegativeMarking;
      const marksObtained = isSkipped ? 0 : isCorrect ? qMarks : -qNeg;

      return {
        question_id: q.id,
        question_number: index + 1,
        question: q.question_text,
        subject: q.subject || attempt.test_subject_name || 'General',
        options: qOptions.map((o) => ({ id: o.id, key: o.key, text: o.text })),
        user_answer: userAns ? userAns.selected_option_id : null,
        correct_answer: correctOpt ? correctOpt.id : null,
        is_correct: isCorrect,
        is_skipped: isSkipped,
        marks_obtained: marksObtained,
        time_taken_seconds: 0,
        explanation: q.explanation || '',
      };
    });

    return {
      attempt_id: attempt.id,
      test_id: attempt.test_id,
      test_title: attempt.test_name,
      total_questions: evalMetrics.totalQuestions,
      correct_answers: evalMetrics.correctAnswers,
      wrong_answers: evalMetrics.wrongAnswers,
      skipped_answers: evalMetrics.skippedQuestions,
      obtained_marks: evalMetrics.obtainedMarks,
      total_marks: evalMetrics.totalMarks,
      percentage: evalMetrics.percentage,
      accuracy: evalMetrics.accuracy,
      time_taken_seconds: evalMetrics.timeTakenSeconds,
      result_status: evalMetrics.resultStatus,
      subject_wise_performance: evalMetrics.subjectBreakdown,
      questions: mappedQuestions,
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
      WHERE UPPER(a.status) IN ('COMPLETED', 'EVALUATED')
      ORDER BY COALESCE(a.submitted_at, a.started_at) DESC, a.id DESC
    `;
    let params = [];
    if (userId) {
      query = `
        SELECT a.*, t.name as test_name
        FROM test_attempts a
        LEFT JOIN tests t ON a.test_id = t.id
        WHERE a.user_id = ? AND UPPER(a.status) IN ('COMPLETED', 'EVALUATED')
        ORDER BY COALESCE(a.submitted_at, a.started_at) DESC, a.id DESC
      `;
      params = [userId];
    }

    const [rows] = await connection.query(query, params);

    return rows.map((row) => ({
      id: row.id,
      test_id: row.test_id,
      user_id: row.user_id,
      start_time: row.started_at,
      end_time: row.submitted_at,
      score: row.obtained_marks ?? row.percentage ?? 0,
      percentage: row.percentage ?? 0,
      status: row.status ? row.status.toLowerCase() : 'completed',
      test: {
        id: row.test_id,
        title: row.test_name || `Test #${row.test_id}`,
      },
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
  getAllAttempts,
};
