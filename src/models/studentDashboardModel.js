const { createDbConnection } = require('../config/db');
const { ensureStudentDashboardTables } = require('../config/initStudentDashboardTables');
const notificationModel = require('./notificationModel');

const EVALUATED_ATTEMPT_STATUSES = new Set(['COMPLETED', 'EVALUATED']);
const EXCLUDED_ATTEMPT_STATUSES = new Set(['ABANDONED', 'INVALID', 'CANCELLED']);
const PENDING_EVALUATION_STATUSES = new Set(['SUBMITTED', 'PENDING_EVALUATION', 'EVALUATING']);

function toNumber(val, fallback = 0) {
  const num = Number(val);
  return Number.isFinite(num) ? num : fallback;
}

function roundTwo(val) {
  return Math.round((toNumber(val) + Number.EPSILON) * 100) / 100;
}

function parsePositiveInt(val) {
  if (val === undefined || val === null) return null;
  const parsed = Number.parseInt(val, 10);
  return Number.isFinite(parsed) && parsed > 0 && String(parsed) === String(val).trim()
    ? parsed
    : null;
}

function parsePagination(query = {}, defaultLimit = 10, maxLimit = 100) {
  const pageRaw = Number.parseInt(query.page, 10);
  const limitRaw = Number.parseInt(query.limit, 10);
  const page = Number.isFinite(pageRaw) && pageRaw > 0 ? pageRaw : 1;
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, maxLimit) : defaultLimit;
  const offset = (page - 1) * limit;
  return { page, limit, offset };
}

function isAttemptEvaluated(attempt) {
  if (!attempt || !attempt.status) return false;
  return EVALUATED_ATTEMPT_STATUSES.has(String(attempt.status).trim().toUpperCase());
}

function resolveDateRangeFilter(filters = {}) {
  const range = filters.range ? String(filters.range).trim().toLowerCase() : 'all';
  let dateFrom = filters.dateFrom ? String(filters.dateFrom).trim().slice(0, 10) : null;
  const dateTo = filters.dateTo ? String(filters.dateTo).trim().slice(0, 10) : null;

  if (!dateFrom && range && range !== 'all') {
    const now = new Date();
    const daysMap = {
      '7d': 7,
      '30d': 30,
      '90d': 90,
      '6m': 180,
      '1y': 365,
    };
    const days = daysMap[range];
    if (days) {
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (days - 1));
      const y = start.getFullYear();
      const m = String(start.getMonth() + 1).padStart(2, '0');
      const d = String(start.getDate()).padStart(2, '0');
      dateFrom = `${y}-${m}-${d}`;
    }
  }

  return {
    range: range || 'all',
    dateFrom,
    dateTo,
    testSeriesId: parsePositiveInt(filters.testSeriesId ?? filters.test_series_id),
    subject: filters.subject ? String(filters.subject).trim() : null,
  };
}

async function withConnection(existingConnection, fn) {
  if (existingConnection) {
    return fn(existingConnection);
  }
  let connection;
  try {
    connection = await createDbConnection();
    return await fn(connection);
  } finally {
    if (connection) await connection.end();
  }
}

async function loadTestQuestionsMap(connection, testIds) {
  const map = new Map();
  if (!Array.isArray(testIds) || testIds.length === 0) return map;

  const uniqueTestIds = [...new Set(testIds.map((id) => Number(id)).filter((id) => id > 0))];
  if (uniqueTestIds.length === 0) return map;

  for (const id of uniqueTestIds) {
    map.set(id, []);
  }

  const [directRows] = await connection.query(
    `SELECT q.*, q.test_id AS mapped_test_id, COALESCE(q.display_order, 0) AS sort_order
     FROM questions q
     WHERE q.test_id IN (?)
     ORDER BY sort_order ASC, q.id ASC`,
    [uniqueTestIds]
  );

  const [junctionRows] = await connection.query(
    `SELECT q.*, tq.test_id AS mapped_test_id, COALESCE(tq.question_order, q.display_order, 0) AS sort_order
     FROM test_questions tq
     JOIN questions q ON q.id = tq.question_id
     WHERE tq.test_id IN (?)
     ORDER BY sort_order ASC, q.id ASC`,
    [uniqueTestIds]
  );

  const seenPerTest = new Map();
  for (const row of [...directRows, ...junctionRows]) {
    const tId = Number(row.mapped_test_id);
    if (!seenPerTest.has(tId)) seenPerTest.set(tId, new Set());
    const seen = seenPerTest.get(tId);
    if (seen.has(row.id)) continue;
    seen.add(row.id);
    map.get(tId).push(row);
  }

  for (const [tId, arr] of map.entries()) {
    arr.sort((a, b) => toNumber(a.sort_order) - toNumber(b.sort_order) || a.id - b.id);
    map.set(tId, arr);
  }

  return map;
}

function getSubjectStatus(accuracy) {
  if (accuracy >= 80) return 'Strong';
  if (accuracy >= 60) return 'Average';
  return 'Needs improvement';
}

function computeResultStatus(obtainedMarks, totalMarks, passingMarks, testTotalMarks) {
  const rawPassing = toNumber(passingMarks, 0);
  if (rawPassing > 0) {
    const effectivePassing =
      toNumber(testTotalMarks, 0) > 0 && totalMarks > 0 && toNumber(testTotalMarks) !== totalMarks
        ? roundTwo((rawPassing / toNumber(testTotalMarks)) * totalMarks)
        : rawPassing;
    const passed = obtainedMarks >= effectivePassing;
    return {
      resultStatus: passed ? 'Passed' : 'Failed',
      passed,
      effectivePassingMarks: effectivePassing,
    };
  }
  return {
    resultStatus: 'Completed',
    passed: null,
    effectivePassingMarks: null,
  };
}

function computeAttemptEvaluation(attempt, testQuestions = [], answerRows = []) {
  const testSubjectName = attempt.test_subject_name || 'General';
  const testNegativeMarking = toNumber(attempt.test_negative_marking, 0);

  const answersByQuestionId = new Map();
  for (const ans of answerRows) {
    answersByQuestionId.set(Number(ans.question_id), ans);
  }

  let totalQuestions = 0;
  let attemptedQuestions = 0;
  let correctAnswers = 0;
  let wrongAnswers = 0;
  let skippedQuestions = 0;
  let totalMarks = 0;
  let obtainedMarks = 0;

  const subjectMap = new Map();

  const addSubjectStat = (subjectName, { isSkipped, isCorrect, qMarks, marksObtained }) => {
    const key = subjectName || 'General';
    const entry = subjectMap.get(key) || {
      subject: key,
      totalQuestions: 0,
      attempted: 0,
      correct: 0,
      wrong: 0,
      skipped: 0,
      totalMarks: 0,
      obtainedMarks: 0,
    };
    entry.totalQuestions += 1;
    if (isSkipped) {
      entry.skipped += 1;
    } else {
      entry.attempted += 1;
      if (isCorrect) entry.correct += 1;
      else entry.wrong += 1;
    }
    entry.totalMarks += qMarks;
    entry.obtainedMarks += marksObtained;
    subjectMap.set(key, entry);
  };

  if (testQuestions.length > 0) {
    const processedQuestionIds = new Set();

    for (const q of testQuestions) {
      processedQuestionIds.add(Number(q.id));
      const ans = answersByQuestionId.get(Number(q.id)) || null;
      const qMarks = toNumber(q.marks, 1) > 0 ? toNumber(q.marks, 1) : 1;
      const qNeg = toNumber(q.negative_marks, 0) > 0 ? toNumber(q.negative_marks, 0) : testNegativeMarking;
      const subjectName = q.subject && String(q.subject).trim() ? String(q.subject).trim() : testSubjectName;

      totalQuestions += 1;
      totalMarks += qMarks;

      const isSkipped = !ans || ans.selected_option_id === null || ans.selected_option_id === undefined;
      let isCorrect = false;
      let marksObtained = 0;

      if (isSkipped) {
        skippedQuestions += 1;
      } else {
        attemptedQuestions += 1;
        isCorrect =
          ans.option_is_correct !== undefined && ans.option_is_correct !== null
            ? Boolean(ans.option_is_correct)
            : Boolean(ans.is_correct);
        if (isCorrect) {
          correctAnswers += 1;
          marksObtained = qMarks;
        } else {
          wrongAnswers += 1;
          marksObtained = -qNeg;
        }
        obtainedMarks += marksObtained;
      }

      addSubjectStat(subjectName, { isSkipped, isCorrect, qMarks, marksObtained });
    }

    // Handle any orphan answers for deleted questions that still belong to this attempt
    for (const ans of answerRows) {
      if (processedQuestionIds.has(Number(ans.question_id))) continue;
      if (ans.selected_option_id === null || ans.selected_option_id === undefined) continue;
      const qMarks = toNumber(ans.question_marks, 1) > 0 ? toNumber(ans.question_marks, 1) : 1;
      const qNeg =
        toNumber(ans.question_negative_marks, 0) > 0
          ? toNumber(ans.question_negative_marks, 0)
          : testNegativeMarking;
      const isCorrect =
        ans.option_is_correct !== undefined && ans.option_is_correct !== null
          ? Boolean(ans.option_is_correct)
          : Boolean(ans.is_correct);
      const marksObtained = isCorrect ? qMarks : -qNeg;
      const subjectName =
        ans.question_subject && String(ans.question_subject).trim()
          ? String(ans.question_subject).trim()
          : testSubjectName;

      totalQuestions += 1;
      attemptedQuestions += 1;
      totalMarks += qMarks;
      if (isCorrect) correctAnswers += 1;
      else wrongAnswers += 1;
      obtainedMarks += marksObtained;

      addSubjectStat(subjectName, { isSkipped: false, isCorrect, qMarks, marksObtained });
    }
  } else {
    totalQuestions = toNumber(attempt.total_questions || attempt.test_total_questions, 0);
    attemptedQuestions = toNumber(attempt.attempted_questions, 0);
    correctAnswers = toNumber(attempt.correct_answers, 0);
    wrongAnswers = toNumber(attempt.wrong_answers, 0);
    skippedQuestions = Math.max(totalQuestions - attemptedQuestions, toNumber(attempt.skipped_questions, 0));
    totalMarks = toNumber(attempt.total_marks || attempt.test_total_marks, 0);
    obtainedMarks = toNumber(attempt.obtained_marks, 0);

    if (totalQuestions > 0 || attemptedQuestions > 0) {
      subjectMap.set(testSubjectName, {
        subject: testSubjectName,
        totalQuestions,
        attempted: attemptedQuestions,
        correct: correctAnswers,
        wrong: wrongAnswers,
        skipped: skippedQuestions,
        totalMarks,
        obtainedMarks,
      });
    }
  }

  obtainedMarks = roundTwo(obtainedMarks);
  totalMarks = roundTwo(totalMarks);
  const percentage = totalMarks > 0 ? roundTwo((obtainedMarks / totalMarks) * 100) : 0;
  const accuracy = attemptedQuestions > 0 ? roundTwo((correctAnswers / attemptedQuestions) * 100) : 0;

  const timeTakenSeconds =
    toNumber(attempt.time_taken_seconds) > 0
      ? toNumber(attempt.time_taken_seconds)
      : attempt.submitted_at && attempt.started_at
        ? Math.max(0, Math.floor((new Date(attempt.submitted_at) - new Date(attempt.started_at)) / 1000))
        : 0;

  const { resultStatus, passed, effectivePassingMarks } = computeResultStatus(
    obtainedMarks,
    totalMarks,
    attempt.passing_marks,
    attempt.test_total_marks
  );

  const subjectBreakdown = Array.from(subjectMap.values()).map((entry) => {
    const subjAccuracy = entry.attempted > 0 ? roundTwo((entry.correct / entry.attempted) * 100) : 0;
    const subjPercentage = entry.totalMarks > 0 ? roundTwo((entry.obtainedMarks / entry.totalMarks) * 100) : 0;
    return {
      subject: entry.subject,
      totalQuestions: entry.totalQuestions,
      attempted: entry.attempted,
      correct: entry.correct,
      wrong: entry.wrong,
      skipped: entry.skipped,
      totalMarks: roundTwo(entry.totalMarks),
      obtainedMarks: roundTwo(entry.obtainedMarks),
      percentage: subjPercentage,
      accuracy: subjAccuracy,
      status: getSubjectStatus(subjAccuracy),
    };
  });

  return {
    totalQuestions,
    attemptedQuestions,
    correctAnswers,
    wrongAnswers,
    skippedQuestions,
    totalMarks,
    obtainedMarks,
    percentage,
    accuracy,
    timeTakenSeconds,
    timeTakenMinutes: roundTwo(timeTakenSeconds / 60),
    passingMarks: effectivePassingMarks,
    resultStatus,
    passed,
    subjectBreakdown,
  };
}

async function loadEvaluatedAttemptsWithMetrics(connection, userId, rawFilters = {}) {
  const filters = resolveDateRangeFilter(rawFilters);

  const conditions = [
    'ta.user_id = ?',
    "UPPER(ta.status) IN ('COMPLETED', 'EVALUATED')",
  ];
  const params = [userId];

  if (filters.dateFrom) {
    conditions.push('DATE(COALESCE(ta.submitted_at, ta.started_at, ta.created_at)) >= ?');
    params.push(filters.dateFrom);
  }
  if (filters.dateTo) {
    conditions.push('DATE(COALESCE(ta.submitted_at, ta.started_at, ta.created_at)) <= ?');
    params.push(filters.dateTo);
  }
  if (filters.testSeriesId) {
    conditions.push(
      '(ta.test_series_id = ? OR EXISTS (SELECT 1 FROM test_series_tests tst_f WHERE tst_f.test_id = ta.test_id AND tst_f.test_series_id = ?))'
    );
    params.push(filters.testSeriesId, filters.testSeriesId);
  }
  if (rawFilters.search && String(rawFilters.search).trim()) {
    const like = `%${String(rawFilters.search).trim()}%`;
    conditions.push('(t.name LIKE ? OR ts.title LIKE ? OR s.name LIKE ?)');
    params.push(like, like, like);
  }

  const [attemptRows] = await connection.query(
    `SELECT
       ta.*,
       COALESCE(t.name, CONCAT('Test #', ta.test_id)) AS test_name,
       t.duration_minutes,
       t.total_questions AS test_total_questions,
       t.total_marks AS test_total_marks,
       t.passing_marks,
       t.negative_marking AS test_negative_marking,
       COALESCE(s.name, 'General') AS test_subject_name,
       COALESCE(
         ta.test_series_id,
         (SELECT tst2.test_series_id FROM test_series_tests tst2 WHERE tst2.test_id = ta.test_id ORDER BY tst2.display_order ASC, tst2.test_series_id ASC LIMIT 1)
       ) AS resolved_series_id,
       COALESCE(
         ts.title,
         (SELECT ts2.title FROM test_series_tests tst2 JOIN test_series ts2 ON tst2.test_series_id = ts2.id WHERE tst2.test_id = ta.test_id ORDER BY tst2.display_order ASC, tst2.test_series_id ASC LIMIT 1)
       ) AS test_series_title,
       COALESCE(ta.submitted_at, ta.started_at, ta.created_at) AS evaluated_at
     FROM test_attempts ta
     LEFT JOIN tests t ON t.id = ta.test_id
     LEFT JOIN subjects s ON s.id = t.subject_id
     LEFT JOIN test_series ts ON ts.id = ta.test_series_id
     WHERE ${conditions.join(' AND ')}
     ORDER BY COALESCE(ta.submitted_at, ta.started_at, ta.created_at) DESC, ta.id DESC`,
    params
  );

  if (attemptRows.length === 0) {
    return { attempts: [], filters };
  }

  const attemptIds = attemptRows.map((a) => a.id);
  const testIds = [...new Set(attemptRows.map((a) => a.test_id).filter(Boolean))];

  const questionsMap = await loadTestQuestionsMap(connection, testIds);

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
     WHERE aa.attempt_id IN (?)
     ORDER BY aa.id ASC`,
    [attemptIds]
  );

  const answersByAttempt = new Map();
  for (const row of answerRows) {
    if (!answersByAttempt.has(row.attempt_id)) {
      answersByAttempt.set(row.attempt_id, []);
    }
    answersByAttempt.get(row.attempt_id).push(row);
  }

  let attempts = attemptRows.map((attempt) => {
    const testQuestions = questionsMap.get(Number(attempt.test_id)) || [];
    const answers = answersByAttempt.get(attempt.id) || [];
    const evalMetrics = computeAttemptEvaluation(attempt, testQuestions, answers);

    return {
      attemptId: attempt.id,
      testId: attempt.test_id,
      testName: attempt.test_name,
      testSeriesId: attempt.resolved_series_id || null,
      testSeriesTitle: attempt.test_series_title || null,
      subjectName: attempt.test_subject_name,
      durationMinutes: attempt.duration_minutes ?? null,
      status: attempt.status,
      startedAt: attempt.started_at,
      submittedAt: attempt.submitted_at || attempt.evaluated_at,
      rank: attempt.rank ?? null,
      ...evalMetrics,
    };
  });

  if (filters.subject) {
    const subjectLower = filters.subject.toLowerCase();
    attempts = attempts.filter((a) =>
      a.subjectBreakdown.some((s) => s.subject.toLowerCase() === subjectLower)
    );
  }

  return { attempts, filters };
}

async function getActiveTestSeriesCount(connection, userId) {
  const [[row]] = await connection.query(
    `SELECT COUNT(DISTINCT series_id) AS activeCount
     FROM (
       SELECT e.test_series_id AS series_id
       FROM test_series_enrollments e
       JOIN test_series ts ON ts.id = e.test_series_id
       LEFT JOIN payments p ON p.id = e.payment_id
       WHERE e.user_id = ?
         AND ts.is_archived = 0
         AND ts.is_published = 1
         AND (ts.end_date IS NULL OR ts.end_date > NOW())
         AND e.status = 'ACTIVE'
         AND (e.expires_at IS NULL OR e.expires_at > NOW())
         AND (p.id IS NULL OR p.status NOT IN ('PENDING', 'FAILED', 'REFUNDED'))
       UNION
       SELECT sub.test_series_id AS series_id
       FROM subscriptions sub
       JOIN test_series ts ON ts.id = sub.test_series_id
       WHERE sub.user_id = ?
         AND sub.test_series_id IS NOT NULL
         AND ts.is_archived = 0
         AND ts.is_published = 1
         AND (ts.end_date IS NULL OR ts.end_date > NOW())
         AND sub.status = 'ACTIVE'
         AND (sub.expires_at IS NULL OR sub.expires_at > NOW())
     ) active_series`,
    [userId, userId]
  );
  return toNumber(row?.activeCount);
}

/**
 * Section 1: Overview Cards
 */
async function getDashboardSummary(userId, existingConnection = null) {
  return withConnection(existingConnection, async (connection) => {
    const [userRows] = await connection.query(
      'SELECT id, username, name, email, subscription_status FROM users WHERE id = ?',
      [userId]
    );
    const user = userRows[0] || { id: userId, username: '', name: null, email: null, subscription_status: 'free' };

    const { attempts } = await loadEvaluatedAttemptsWithMetrics(connection, userId);

    const [[inProgressRow]] = await connection.query(
      `SELECT COUNT(*) AS inProgressCount
       FROM test_attempts
       WHERE user_id = ? AND UPPER(status) = 'IN_PROGRESS'`,
      [userId]
    );

    const activeTestSeries = await getActiveTestSeriesCount(connection, userId);

    if (attempts.length === 0) {
      return {
        student: {
          id: user.id,
          username: user.username,
          name: user.name || user.username,
          email: user.email || null,
          subscriptionStatus: user.subscription_status || 'free',
        },
        testsAttempted: 0,
        averageScore: 0,
        accuracy: 0,
        activeTestSeries,
        totalAttemptedQuestions: 0,
        totalCorrectAnswers: 0,
        totalWrongAnswers: 0,
        totalSkippedQuestions: 0,
        inProgressAttempts: toNumber(inProgressRow?.inProgressCount),
      };
    }

    let sumPercentages = 0;
    let totalAttemptedQuestions = 0;
    let totalCorrectAnswers = 0;
    let totalWrongAnswers = 0;
    let totalSkippedQuestions = 0;

    for (const attempt of attempts) {
      sumPercentages += attempt.percentage;
      totalAttemptedQuestions += attempt.attemptedQuestions;
      totalCorrectAnswers += attempt.correctAnswers;
      totalWrongAnswers += attempt.wrongAnswers;
      totalSkippedQuestions += attempt.skippedQuestions;
    }

    const averageScore = roundTwo(sumPercentages / attempts.length);
    const accuracy =
      totalAttemptedQuestions > 0 ? roundTwo((totalCorrectAnswers / totalAttemptedQuestions) * 100) : 0;

    return {
      student: {
        id: user.id,
        username: user.username,
        name: user.name || user.username,
        email: user.email || null,
        subscriptionStatus: user.subscription_status || 'free',
      },
      testsAttempted: attempts.length,
      averageScore,
      accuracy,
      activeTestSeries,
      totalAttemptedQuestions,
      totalCorrectAnswers,
      totalWrongAnswers,
      totalSkippedQuestions,
      inProgressAttempts: toNumber(inProgressRow?.inProgressCount),
    };
  });
}

function resolveEnrollmentAccessStatus(row, nowMs) {
  const paymentStatus = row.payment_status ? String(row.payment_status).toUpperCase() : null;
  const rawStatus = String(row.status || 'ACTIVE').toUpperCase();
  const expiresMs = row.expires_at ? new Date(row.expires_at).getTime() : null;
  const seriesEndMs = row.series_end_date ? new Date(row.series_end_date).getTime() : null;

  if (rawStatus === 'CANCELLED' || paymentStatus === 'REFUNDED' || paymentStatus === 'FAILED') {
    return { accessStatus: 'CANCELLED', accessLabel: 'Cancelled', canAttempt: false };
  }
  if (paymentStatus === 'PENDING') {
    return { accessStatus: 'PENDING', accessLabel: 'Pending', canAttempt: false };
  }
  if (rawStatus === 'EXPIRED' || (expiresMs && expiresMs <= nowMs) || (seriesEndMs && seriesEndMs <= nowMs)) {
    return { accessStatus: 'EXPIRED', accessLabel: 'Expired', canAttempt: false };
  }
  if (rawStatus === 'ACTIVE') {
    return { accessStatus: 'ACTIVE', accessLabel: 'Available', canAttempt: true };
  }
  return { accessStatus: rawStatus, accessLabel: rawStatus, canAttempt: false };
}

const ACCESS_STATUS_PRIORITY = {
  ACTIVE: 4,
  PENDING: 3,
  EXPIRED: 2,
  CANCELLED: 1,
};

/**
 * Section 2: My Test Series
 */
async function getMyTestSeries(userId, options = {}, existingConnection = null) {
  return withConnection(existingConnection, async (connection) => {
    const { page, limit, offset } = parsePagination(options, 20, 100);
    const statusFilter = options.status ? String(options.status).trim().toUpperCase() : 'ALL';
    const searchFilter = options.search ? String(options.search).trim().toLowerCase() : '';

    const [enrollmentRows] = await connection.query(
      `SELECT
         e.id AS enrollment_id,
         e.test_series_id,
         e.payment_id,
         e.enrollment_type,
         e.status,
         e.enrolled_at,
         e.expires_at,
         ts.title,
         ts.description,
         ts.thumbnail_url,
         ts.price,
         ts.is_paid,
         ts.validity_days,
         ts.start_date AS series_start_date,
         ts.end_date AS series_end_date,
         ts.difficulty_level,
         c.name AS category_name,
         p.status AS payment_status,
         p.paid_at,
         p.amount AS paid_amount,
         p.order_id,
         (
           SELECT COUNT(*)
           FROM test_series_tests tst
           JOIN tests t ON t.id = tst.test_id
           WHERE tst.test_series_id = ts.id
             AND t.is_published = 1
             AND t.is_active = 1
         ) AS total_tests,
         (
           SELECT COUNT(DISTINCT ta.test_id)
           FROM test_attempts ta
           JOIN test_series_tests tst2 ON tst2.test_id = ta.test_id AND tst2.test_series_id = ts.id
           JOIN tests t2 ON t2.id = ta.test_id
           WHERE ta.user_id = e.user_id
             AND (ta.test_series_id = ts.id OR ta.test_series_id IS NULL)
             AND UPPER(ta.status) IN ('COMPLETED', 'EVALUATED')
             AND t2.is_published = 1
             AND t2.is_active = 1
         ) AS completed_tests
       FROM test_series_enrollments e
       JOIN test_series ts ON ts.id = e.test_series_id
       LEFT JOIN categories c ON c.id = ts.category_id
       LEFT JOIN payments p ON p.id = e.payment_id
       WHERE e.user_id = ?
         AND ts.is_archived = 0
         AND ts.is_published = 1
       ORDER BY e.enrolled_at DESC, e.id DESC`,
      [userId]
    );

    // Also include pending payments that have not created an enrollment row yet
    const [pendingPaymentRows] = await connection.query(
      `SELECT
         p.id AS payment_id,
         p.test_series_id,
         p.amount AS paid_amount,
         p.status AS payment_status,
         p.order_id,
         p.created_at AS enrolled_at,
         ts.title,
         ts.description,
         ts.thumbnail_url,
         ts.price,
         ts.is_paid,
         ts.validity_days,
         ts.start_date AS series_start_date,
         ts.end_date AS series_end_date,
         ts.difficulty_level,
         c.name AS category_name,
         (
           SELECT COUNT(*)
           FROM test_series_tests tst
           JOIN tests t ON t.id = tst.test_id
           WHERE tst.test_series_id = ts.id
             AND t.is_published = 1
             AND t.is_active = 1
         ) AS total_tests,
         0 AS completed_tests
       FROM payments p
       JOIN test_series ts ON ts.id = p.test_series_id
       LEFT JOIN categories c ON c.id = ts.category_id
       WHERE p.user_id = ?
         AND p.test_series_id IS NOT NULL
         AND p.status = 'PENDING'
         AND ts.is_archived = 0
         AND ts.is_published = 1
         AND NOT EXISTS (
           SELECT 1 FROM test_series_enrollments e2
           WHERE e2.user_id = p.user_id AND e2.test_series_id = p.test_series_id
         )
       ORDER BY p.created_at DESC`,
      [userId]
    );

    // Also include series-linked subscriptions if not already in enrollments
    const [subscriptionRows] = await connection.query(
      `SELECT
         sub.id AS subscription_id,
         sub.test_series_id,
         sub.plan_name,
         sub.status,
         sub.starts_at AS enrolled_at,
         sub.expires_at,
         sub.amount AS paid_amount,
         ts.title,
         ts.description,
         ts.thumbnail_url,
         ts.price,
         ts.is_paid,
         ts.validity_days,
         ts.start_date AS series_start_date,
         ts.end_date AS series_end_date,
         ts.difficulty_level,
         c.name AS category_name,
         (
           SELECT COUNT(*)
           FROM test_series_tests tst
           JOIN tests t ON t.id = tst.test_id
           WHERE tst.test_series_id = ts.id
             AND t.is_published = 1
             AND t.is_active = 1
         ) AS total_tests,
         (
           SELECT COUNT(DISTINCT ta.test_id)
           FROM test_attempts ta
           JOIN test_series_tests tst2 ON tst2.test_id = ta.test_id AND tst2.test_series_id = ts.id
           JOIN tests t2 ON t2.id = ta.test_id
           WHERE ta.user_id = sub.user_id
             AND (ta.test_series_id = ts.id OR ta.test_series_id IS NULL)
             AND UPPER(ta.status) IN ('COMPLETED', 'EVALUATED')
             AND t2.is_published = 1
             AND t2.is_active = 1
         ) AS completed_tests
       FROM subscriptions sub
       JOIN test_series ts ON ts.id = sub.test_series_id
       LEFT JOIN categories c ON c.id = ts.category_id
       WHERE sub.user_id = ?
         AND sub.test_series_id IS NOT NULL
         AND ts.is_archived = 0
         AND ts.is_published = 1
         AND NOT EXISTS (
           SELECT 1 FROM test_series_enrollments e3
           WHERE e3.user_id = sub.user_id AND e3.test_series_id = sub.test_series_id
         )
       ORDER BY sub.starts_at DESC`,
      [userId]
    );

    const nowMs = Date.now();
    const bySeriesId = new Map();

    const mergeRecord = (record) => {
      const existing = bySeriesId.get(record.testSeriesId);
      if (!existing) {
        bySeriesId.set(record.testSeriesId, record);
        return;
      }
      const existingPrio = ACCESS_STATUS_PRIORITY[existing.accessStatus] || 0;
      const newPrio = ACCESS_STATUS_PRIORITY[record.accessStatus] || 0;
      if (newPrio > existingPrio) {
        bySeriesId.set(record.testSeriesId, record);
      }
    };

    for (const row of enrollmentRows) {
      const { accessStatus, accessLabel, canAttempt } = resolveEnrollmentAccessStatus(row, nowMs);
      const totalTests = toNumber(row.total_tests);
      const completedTests = Math.min(toNumber(row.completed_tests), totalTests);
      const remainingTests = Math.max(totalTests - completedTests, 0);
      const progressPercentage = totalTests > 0 ? roundTwo((completedTests / totalTests) * 100) : 0;

      mergeRecord({
        enrollmentId: row.enrollment_id,
        testSeriesId: row.test_series_id,
        title: row.title,
        description: row.description || null,
        thumbnailUrl: row.thumbnail_url || null,
        categoryName: row.category_name || null,
        difficultyLevel: row.difficulty_level || null,
        price: roundTwo(row.price),
        isPaid: Boolean(row.is_paid),
        enrollmentType: row.enrollment_type,
        purchaseDate: row.paid_at || row.enrolled_at,
        enrolledAt: row.enrolled_at,
        expiresAt: row.expires_at || null,
        totalTests,
        completedTests,
        remainingTests,
        progressPercentage,
        accessStatus,
        accessLabel,
        canAttempt,
        paymentId: row.payment_id || null,
        orderId: row.order_id || null,
        paidAmount: row.paid_amount !== null && row.paid_amount !== undefined ? roundTwo(row.paid_amount) : null,
        paymentStatus: row.payment_status || null,
      });
    }

    for (const row of pendingPaymentRows) {
      const totalTests = toNumber(row.total_tests);
      mergeRecord({
        enrollmentId: null,
        testSeriesId: row.test_series_id,
        title: row.title,
        description: row.description || null,
        thumbnailUrl: row.thumbnail_url || null,
        categoryName: row.category_name || null,
        difficultyLevel: row.difficulty_level || null,
        price: roundTwo(row.price),
        isPaid: Boolean(row.is_paid),
        enrollmentType: 'PAID',
        purchaseDate: row.enrolled_at,
        enrolledAt: row.enrolled_at,
        expiresAt: null,
        totalTests,
        completedTests: 0,
        remainingTests: totalTests,
        progressPercentage: 0,
        accessStatus: 'PENDING',
        accessLabel: 'Pending',
        canAttempt: false,
        paymentId: row.payment_id,
        orderId: row.order_id || null,
        paidAmount: roundTwo(row.paid_amount),
        paymentStatus: row.payment_status,
      });
    }

    for (const row of subscriptionRows) {
      const { accessStatus, accessLabel, canAttempt } = resolveEnrollmentAccessStatus(row, nowMs);
      const totalTests = toNumber(row.total_tests);
      const completedTests = Math.min(toNumber(row.completed_tests), totalTests);
      const remainingTests = Math.max(totalTests - completedTests, 0);
      const progressPercentage = totalTests > 0 ? roundTwo((completedTests / totalTests) * 100) : 0;

      mergeRecord({
        enrollmentId: null,
        subscriptionId: row.subscription_id,
        testSeriesId: row.test_series_id,
        title: row.title,
        description: row.description || null,
        thumbnailUrl: row.thumbnail_url || null,
        categoryName: row.category_name || null,
        difficultyLevel: row.difficulty_level || null,
        price: roundTwo(row.price),
        isPaid: Boolean(row.is_paid),
        enrollmentType: 'PAID',
        purchaseDate: row.enrolled_at,
        enrolledAt: row.enrolled_at,
        expiresAt: row.expires_at || null,
        totalTests,
        completedTests,
        remainingTests,
        progressPercentage,
        accessStatus,
        accessLabel,
        canAttempt,
        paymentId: null,
        orderId: null,
        paidAmount: roundTwo(row.paid_amount),
        paymentStatus: 'SUCCESS',
      });
    }

    const allSeries = Array.from(bySeriesId.values()).sort((a, b) => {
      const prioDiff = (ACCESS_STATUS_PRIORITY[b.accessStatus] || 0) - (ACCESS_STATUS_PRIORITY[a.accessStatus] || 0);
      if (prioDiff !== 0) return prioDiff;
      return new Date(b.purchaseDate).getTime() - new Date(a.purchaseDate).getTime();
    });

    const summary = {
      total: allSeries.length,
      active: allSeries.filter((s) => s.accessStatus === 'ACTIVE').length,
      expired: allSeries.filter((s) => s.accessStatus === 'EXPIRED').length,
      pending: allSeries.filter((s) => s.accessStatus === 'PENDING').length,
      cancelled: allSeries.filter((s) => s.accessStatus === 'CANCELLED').length,
    };

    let filtered = allSeries;
    if (statusFilter && statusFilter !== 'ALL') {
      filtered = filtered.filter((s) => s.accessStatus === statusFilter);
    }
    if (searchFilter) {
      filtered = filtered.filter(
        (s) =>
          (s.title && s.title.toLowerCase().includes(searchFilter)) ||
          (s.categoryName && s.categoryName.toLowerCase().includes(searchFilter))
      );
    }

    const total = filtered.length;
    const items = filtered.slice(offset, offset + limit);

    return {
      items,
      summary,
      pagination: {
        page,
        limit,
        total,
        totalPages: total > 0 ? Math.ceil(total / limit) : 0,
      },
    };
  });
}

async function getStudentAccessContext(connection, userId) {
  const [enrollments] = await connection.query(
    `SELECT
       e.id,
       e.test_series_id,
       e.status,
       e.expires_at,
       ts.title AS series_title,
       ts.start_date AS series_start_date,
       ts.end_date AS series_end_date,
       p.status AS payment_status
     FROM test_series_enrollments e
     JOIN test_series ts ON ts.id = e.test_series_id
     LEFT JOIN payments p ON p.id = e.payment_id
     WHERE e.user_id = ? AND ts.is_archived = 0 AND ts.is_published = 1`,
    [userId]
  );

  const [subscriptions] = await connection.query(
    `SELECT id, plan_type, test_series_id, status, expires_at
     FROM subscriptions
     WHERE user_id = ?`,
    [userId]
  );

  const nowMs = Date.now();
  const activeSeriesIds = new Set();
  const expiredSeriesIds = new Set();
  const pendingSeriesIds = new Set();
  let hasGlobalActiveSubscription = false;

  for (const e of enrollments) {
    const resolved = resolveEnrollmentAccessStatus(e, nowMs);
    if (resolved.accessStatus === 'ACTIVE') {
      activeSeriesIds.add(e.test_series_id);
    } else if (resolved.accessStatus === 'PENDING') {
      pendingSeriesIds.add(e.test_series_id);
    } else if (resolved.accessStatus === 'EXPIRED') {
      expiredSeriesIds.add(e.test_series_id);
    }
  }

  for (const sub of subscriptions) {
    const isSubActive =
      String(sub.status).toUpperCase() === 'ACTIVE' &&
      (!sub.expires_at || new Date(sub.expires_at).getTime() > nowMs);
    if (!isSubActive) continue;

    if (sub.test_series_id) {
      activeSeriesIds.add(sub.test_series_id);
    } else if (['MONTHLY', 'QUARTERLY', 'YEARLY', 'LIFETIME'].includes(String(sub.plan_type).toUpperCase())) {
      hasGlobalActiveSubscription = true;
    }
  }

  return {
    activeSeriesIds,
    expiredSeriesIds,
    pendingSeriesIds,
    hasGlobalActiveSubscription,
  };
}

function buildTestAttemptStats(test, actualQuestions, attemptsForTest, accessCtx, linkedSeries, nowMs) {
  const questionCount = actualQuestions.length > 0 ? actualQuestions.length : toNumber(test.total_questions, 0);
  const sumQuestionMarks = actualQuestions.reduce(
    (sum, q) => sum + (toNumber(q.marks, 1) > 0 ? toNumber(q.marks, 1) : 1),
    0
  );
  const totalMarks = actualQuestions.length > 0 ? roundTwo(sumQuestionMarks) : toNumber(test.total_marks, 0);

  const maxQuestionNegative = actualQuestions.reduce(
    (maxVal, q) => Math.max(maxVal, toNumber(q.negative_marks, 0)),
    0
  );
  const negativeMarking =
    toNumber(test.negative_marking, 0) > 0 ? roundTwo(test.negative_marking) : roundTwo(maxQuestionNegative);

  const activeAttempt = attemptsForTest.find((a) => String(a.status).toUpperCase() === 'IN_PROGRESS') || null;
  const evaluatedAttempts = attemptsForTest.filter((a) => isAttemptEvaluated(a));
  const pendingEvalAttempts = attemptsForTest.filter((a) =>
    PENDING_EVALUATION_STATUSES.has(String(a.status || '').toUpperCase())
  );

  const attemptsUsed = evaluatedAttempts.length + pendingEvalAttempts.length;
  const maxAttempts = test.max_attempts !== null && test.max_attempts !== undefined ? toNumber(test.max_attempts, 0) : null;
  const attemptsRemaining = maxAttempts && maxAttempts > 0 ? Math.max(maxAttempts - attemptsUsed, 0) : null;

  const isEnrolledActive = linkedSeries.some((s) => accessCtx.activeSeriesIds.has(s.id));
  const isEnrolledExpired = !isEnrolledActive && linkedSeries.some((s) => accessCtx.expiredSeriesIds.has(s.id));
  const isEnrolledPending = !isEnrolledActive && linkedSeries.some((s) => accessCtx.pendingSeriesIds.has(s.id));

  let accessSource = 'NONE';
  if (isEnrolledActive) accessSource = 'ENROLLED_SERIES';
  else if (accessCtx.hasGlobalActiveSubscription) accessSource = 'SUBSCRIPTION';
  else if (Boolean(test.is_free)) accessSource = 'FREE';

  const hasAccess = accessSource !== 'NONE';

  const startTimeMs = test.start_time ? new Date(test.start_time).getTime() : null;
  const endTimeMs = test.end_time ? new Date(test.end_time).getTime() : null;
  const isUpcoming = Boolean(startTimeMs && startTimeMs > nowMs);
  const isEnded = Boolean(endTimeMs && endTimeMs < nowMs);
  const isLimitReached = Boolean(maxAttempts && maxAttempts > 0 && attemptsUsed >= maxAttempts);

  let attemptStatus = 'NOT_STARTED';
  let canStart = true;
  let cannotStartReason = null;
  let actionLabel = 'Start Test';

  if (!test.is_published || !test.is_active) {
    attemptStatus = 'UNAVAILABLE';
    canStart = false;
    cannotStartReason = 'Test is not published or currently unavailable';
    actionLabel = 'Unavailable';
  } else if (!hasAccess) {
    attemptStatus = isEnrolledExpired ? 'SERIES_EXPIRED' : isEnrolledPending ? 'ACCESS_PENDING' : 'LOCKED';
    canStart = false;
    cannotStartReason = isEnrolledExpired
      ? 'Test series access has expired'
      : isEnrolledPending
        ? 'Payment confirmation pending'
        : 'Purchase or enroll in the test series to unlock';
    actionLabel = isEnrolledExpired ? 'Renew Series' : isEnrolledPending ? 'Pending' : 'Enroll to Unlock';
  } else if (isUpcoming) {
    attemptStatus = 'UPCOMING';
    canStart = false;
    cannotStartReason = 'Test has not started yet';
    actionLabel = 'Upcoming';
  } else if (isEnded) {
    attemptStatus = 'ENDED';
    canStart = false;
    cannotStartReason = 'Test window has ended';
    actionLabel = evaluatedAttempts.length > 0 ? 'View Result' : 'Expired';
  } else if (activeAttempt) {
    attemptStatus = 'IN_PROGRESS';
    canStart = false;
    cannotStartReason = 'You already have an active attempt in progress';
    actionLabel = 'Resume Test';
  } else if (isLimitReached) {
    attemptStatus = 'ATTEMPT_LIMIT_REACHED';
    canStart = false;
    cannotStartReason = `Maximum attempt limit (${maxAttempts}) reached`;
    actionLabel = evaluatedAttempts.length > 0 ? 'View Result' : 'Limit Reached';
  } else if (evaluatedAttempts.length > 0) {
    attemptStatus = 'COMPLETED';
    canStart = true;
    actionLabel = 'Retake Test';
  }

  const latestEvaluated = evaluatedAttempts[0] || null;
  const bestPercentage =
    evaluatedAttempts.length > 0
      ? roundTwo(Math.max(...evaluatedAttempts.map((a) => toNumber(a.percentage, 0))))
      : null;

  return {
    totalQuestions: questionCount,
    totalMarks,
    negativeMarking,
    attemptStatus,
    attemptsUsed,
    maxAttempts: maxAttempts && maxAttempts > 0 ? maxAttempts : null,
    attemptsRemaining,
    activeAttemptId: activeAttempt ? activeAttempt.id : null,
    latestAttemptId: latestEvaluated ? latestEvaluated.id : null,
    bestPercentage,
    hasAccess,
    accessSource,
    isFromPurchasedSeries: isEnrolledActive,
    isUpcoming,
    isEnded,
    canStart,
    cannotStartReason,
    actionLabel,
  };
}

/**
 * Section 2 Detail: Single Test Series details + tests for logged-in student
 */
async function getStudentTestSeriesDetail(userId, seriesId, existingConnection = null) {
  return withConnection(existingConnection, async (connection) => {
    const mySeriesResult = await getMyTestSeries(userId, { page: 1, limit: 1000 }, connection);
    const enrollment = mySeriesResult.items.find((item) => item.testSeriesId === Number(seriesId)) || null;

    const [seriesRows] = await connection.query(
      `SELECT ts.*, c.name AS category_name
       FROM test_series ts
       LEFT JOIN categories c ON c.id = ts.category_id
       WHERE ts.id = ? AND ts.is_archived = 0 AND ts.is_published = 1`,
      [seriesId]
    );
    if (seriesRows.length === 0) return null;
    const series = seriesRows[0];

    if (!enrollment) {
      return null;
    }

    const [tests] = await connection.query(
      `SELECT t.*, s.name AS subject_name, tst.display_order AS series_display_order
       FROM test_series_tests tst
       JOIN tests t ON t.id = tst.test_id
       LEFT JOIN subjects s ON s.id = t.subject_id
       WHERE tst.test_series_id = ?
         AND t.is_published = 1
         AND t.is_active = 1
       ORDER BY tst.display_order ASC, t.id ASC`,
      [seriesId]
    );

    const testIds = tests.map((t) => t.id);
    const questionsMap = await loadTestQuestionsMap(connection, testIds);
    const accessCtx = await getStudentAccessContext(connection, userId);

    const attemptsByTest = new Map();
    if (testIds.length > 0) {
      const [attemptRows] = await connection.query(
        `SELECT id, test_id, status, percentage, obtained_marks, total_marks, started_at, submitted_at
         FROM test_attempts
         WHERE user_id = ? AND test_id IN (?)
         ORDER BY COALESCE(submitted_at, started_at) DESC, id DESC`,
        [userId, testIds]
      );
      for (const a of attemptRows) {
        if (!attemptsByTest.has(a.test_id)) attemptsByTest.set(a.test_id, []);
        attemptsByTest.get(a.test_id).push(a);
      }
    }

    const nowMs = Date.now();
    const mappedTests = tests.map((t) => {
      const qList = questionsMap.get(t.id) || [];
      const tAttempts = attemptsByTest.get(t.id) || [];
      const stats = buildTestAttemptStats(t, qList, tAttempts, accessCtx, [series], nowMs);
      return {
        id: t.id,
        name: t.name,
        description: t.description || null,
        subjectName: t.subject_name || 'General',
        difficulty: t.difficulty || null,
        testType: t.test_type || null,
        durationMinutes: t.duration_minutes ?? 0,
        passingMarks: t.passing_marks ?? null,
        startTime: t.start_time || null,
        endTime: t.end_time || null,
        isFree: Boolean(t.is_free),
        ...stats,
      };
    });

    return {
      series: enrollment,
      tests: mappedTests,
    };
  });
}

/**
 * Section 3: Available Tests Discovery
 */
async function getAvailableTests(userId, options = {}, existingConnection = null) {
  return withConnection(existingConnection, async (connection) => {
    const { page, limit, offset } = parsePagination(options, 20, 100);
    const includeLocked = String(options.includeLocked || '').toLowerCase() === 'true';
    const bucketFilter = options.bucket ? String(options.bucket).trim().toLowerCase() : 'all';
    const seriesIdFilter = parsePositiveInt(options.testSeriesId ?? options.test_series_id);
    const searchFilter = options.search ? String(options.search).trim().toLowerCase() : '';

    const accessCtx = await getStudentAccessContext(connection, userId);

    // Fetch weak subjects from student's evaluated performance for recommendation scoring
    const { attempts: evaluatedHistory } = await loadEvaluatedAttemptsWithMetrics(connection, userId);
    const subjectStatsForRec = new Map();
    for (const att of evaluatedHistory) {
      for (const sb of att.subjectBreakdown) {
        const cur = subjectStatsForRec.get(sb.subject) || { attempted: 0, correct: 0 };
        cur.attempted += sb.attempted;
        cur.correct += sb.correct;
        subjectStatsForRec.set(sb.subject, cur);
      }
    }
    const weakSubjects = new Set();
    for (const [subj, stat] of subjectStatsForRec.entries()) {
      const acc = stat.attempted > 0 ? (stat.correct / stat.attempted) * 100 : 0;
      if (acc < 70) weakSubjects.add(subj.toLowerCase());
    }

    const [testRows] = await connection.query(
      `SELECT
         t.*,
         s.name AS subject_name
       FROM tests t
       LEFT JOIN subjects s ON s.id = t.subject_id
       WHERE t.is_published = 1
         AND t.is_active = 1
         AND (t.end_time IS NULL OR t.end_time >= NOW())
       ORDER BY t.created_at DESC, t.id DESC`
    );

    if (testRows.length === 0) {
      return {
        items: [],
        buckets: {
          newlyPublished: [],
          upcoming: [],
          recommended: [],
          freePractice: [],
          fromPurchasedSeries: [],
        },
        pagination: { page, limit, total: 0, totalPages: 0 },
      };
    }

    const testIds = testRows.map((t) => t.id);
    const questionsMap = await loadTestQuestionsMap(connection, testIds);

    const [seriesLinks] = await connection.query(
      `SELECT
         tst.test_id,
         ts.id,
         ts.title,
         ts.is_paid,
         ts.start_date AS series_start_date,
         ts.end_date AS series_end_date
       FROM test_series_tests tst
       JOIN test_series ts ON ts.id = tst.test_series_id
       WHERE tst.test_id IN (?)
         AND ts.is_published = 1
         AND ts.is_archived = 0
       ORDER BY tst.display_order ASC, ts.id ASC`,
      [testIds]
    );

    const seriesByTestId = new Map();
    for (const link of seriesLinks) {
      if (!seriesByTestId.has(link.test_id)) seriesByTestId.set(link.test_id, []);
      seriesByTestId.get(link.test_id).push(link);
    }

    const [attemptRows] = await connection.query(
      `SELECT id, test_id, status, percentage, obtained_marks, total_marks, started_at, submitted_at
       FROM test_attempts
       WHERE user_id = ? AND test_id IN (?)
       ORDER BY COALESCE(submitted_at, started_at) DESC, id DESC`,
      [userId, testIds]
    );

    const attemptsByTestId = new Map();
    for (const row of attemptRows) {
      if (!attemptsByTestId.has(row.test_id)) attemptsByTestId.set(row.test_id, []);
      attemptsByTestId.get(row.test_id).push(row);
    }

    const nowMs = Date.now();
    const fourteenDaysMs = 14 * 24 * 60 * 60 * 1000;

    const allCards = [];
    for (const test of testRows) {
      const linkedSeries = seriesByTestId.get(test.id) || [];
      const enrolledSeries = linkedSeries.find((s) => accessCtx.activeSeriesIds.has(s.id)) || null;
      const primarySeries = enrolledSeries || linkedSeries[0] || null;

      if (seriesIdFilter && !linkedSeries.some((s) => s.id === seriesIdFilter)) {
        continue;
      }

      const qList = questionsMap.get(test.id) || [];
      const tAttempts = attemptsByTestId.get(test.id) || [];
      const stats = buildTestAttemptStats(test, qList, tAttempts, accessCtx, linkedSeries, nowMs);

      if (!includeLocked && !stats.hasAccess) {
        continue;
      }

      if (searchFilter) {
        const hay = `${test.name || ''} ${primarySeries?.title || ''} ${test.subject_name || ''}`.toLowerCase();
        if (!hay.includes(searchFilter)) continue;
      }

      const createdAtMs = test.created_at ? new Date(test.created_at).getTime() : 0;
      const isNew = Boolean(createdAtMs && nowMs - createdAtMs <= fourteenDaysMs);
      const isFree = Boolean(test.is_free);
      const isFromPurchasedSeries = stats.isFromPurchasedSeries;

      const testSubjectLower = String(test.subject_name || '').toLowerCase();
      const questionSubjects = new Set(
        qList.map((q) => String(q.subject || '').trim().toLowerCase()).filter(Boolean)
      );
      const matchesWeakSubject =
        weakSubjects.has(testSubjectLower) ||
        [...questionSubjects].some((qs) => weakSubjects.has(qs));

      const isUnattempted = stats.attemptsUsed === 0;
      const isRecommended =
        stats.hasAccess &&
        !stats.isEnded &&
        (matchesWeakSubject || (isUnattempted && (isFromPurchasedSeries || isFree)));

      const tags = [];
      if (stats.isUpcoming) tags.push('UPCOMING');
      if (isNew) tags.push('NEW');
      if (isFromPurchasedSeries) tags.push('PURCHASED_SERIES');
      if (isFree) tags.push('FREE');
      if (isRecommended) tags.push('RECOMMENDED');

      allCards.push({
        id: test.id,
        name: test.name,
        description: test.description || null,
        testSeriesId: primarySeries ? primarySeries.id : null,
        testSeriesTitle: primarySeries ? primarySeries.title : null,
        subjectId: test.subject_id,
        subjectName: test.subject_name || 'General',
        difficulty: test.difficulty || null,
        testType: test.test_type || null,
        durationMinutes: toNumber(test.duration_minutes, 0),
        passingMarks: test.passing_marks ?? null,
        startTime: test.start_time || null,
        endTime: test.end_time || null,
        isFree,
        isPublished: Boolean(test.is_published),
        createdAt: test.created_at,
        isNew,
        isRecommended,
        tags,
        ...stats,
      });
    }

    // Sort: active in-progress first, then startable purchased/recommended/new, then upcoming, then rest
    allCards.sort((a, b) => {
      const score = (c) => {
        if (c.attemptStatus === 'IN_PROGRESS') return 6;
        if (c.canStart && c.isFromPurchasedSeries) return 5;
        if (c.canStart && c.isRecommended) return 4;
        if (c.canStart) return 3;
        if (c.isUpcoming) return 2;
        return 1;
      };
      const diff = score(b) - score(a);
      if (diff !== 0) return diff;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

    const buckets = {
      newlyPublished: allCards.filter((c) => c.isNew),
      upcoming: allCards.filter((c) => c.isUpcoming),
      recommended: allCards.filter((c) => c.isRecommended),
      freePractice: allCards.filter((c) => c.isFree),
      fromPurchasedSeries: allCards.filter((c) => c.isFromPurchasedSeries),
    };

    let filteredCards = allCards;
    if (bucketFilter === 'new' || bucketFilter === 'newly_published') {
      filteredCards = buckets.newlyPublished;
    } else if (bucketFilter === 'upcoming') {
      filteredCards = buckets.upcoming;
    } else if (bucketFilter === 'recommended') {
      filteredCards = buckets.recommended;
    } else if (bucketFilter === 'free' || bucketFilter === 'free_practice') {
      filteredCards = buckets.freePractice;
    } else if (bucketFilter === 'purchased' || bucketFilter === 'enrolled') {
      filteredCards = buckets.fromPurchasedSeries;
    }

    const total = filteredCards.length;
    const items = filteredCards.slice(offset, offset + limit);

    return {
      items,
      buckets,
      pagination: {
        page,
        limit,
        total,
        totalPages: total > 0 ? Math.ceil(total / limit) : 0,
      },
    };
  });
}

/**
 * Section 3 Action: Validate all 5 rules & Start Test Attempt
 */
async function validateAndStartTest(userId, rawTestId, options = {}) {
  const testId = parsePositiveInt(rawTestId);
  if (!testId) {
    const err = new Error('Invalid testId parameter');
    err.status = 400;
    err.code = 'INVALID_TEST_ID';
    throw err;
  }

  const requestedSeriesId = parsePositiveInt(options.testSeriesId ?? options.test_series_id);

  return withConnection(null, async (connection) => {
    await connection.beginTransaction();
    try {
      // 0. Check user status
      const [userRows] = await connection.query(
        'SELECT id, status FROM users WHERE id = ?',
        [userId]
      );
      if (userRows.length === 0) {
        const err = new Error('User not found');
        err.status = 404;
        err.code = 'USER_NOT_FOUND';
        throw err;
      }
      if (userRows[0].status && userRows[0].status !== 'active') {
        const err = new Error(`User account is ${userRows[0].status}`);
        err.status = 403;
        err.code = 'USER_INACTIVE';
        throw err;
      }

      // 1. Validate test is published and available
      const [testRows] = await connection.query('SELECT * FROM tests WHERE id = ?', [testId]);
      if (testRows.length === 0) {
        const err = new Error('Test not found');
        err.status = 404;
        err.code = 'TEST_NOT_FOUND';
        throw err;
      }
      const test = testRows[0];

      if (!test.is_published || !test.is_active) {
        const err = new Error('Test is not published or currently unavailable');
        err.status = 403;
        err.code = 'TEST_UNAVAILABLE';
        throw err;
      }

      const [linkedSeries] = await connection.query(
        `SELECT ts.id, ts.title, ts.is_paid, ts.is_published, ts.is_archived, ts.start_date, ts.end_date
         FROM test_series_tests tst
         JOIN test_series ts ON ts.id = tst.test_series_id
         WHERE tst.test_id = ?`,
        [testId]
      );

      let resolvedSeries = null;
      if (requestedSeriesId) {
        resolvedSeries = linkedSeries.find((s) => s.id === requestedSeriesId) || null;
        if (!resolvedSeries || !resolvedSeries.is_published || resolvedSeries.is_archived) {
          const err = new Error('Test is not available in the requested test series');
          err.status = 404;
          err.code = 'SERIES_TEST_NOT_FOUND';
          throw err;
        }
      }

      // 2. Validate student access or free-test eligibility
      const accessCtx = await getStudentAccessContext(connection, userId);
      const activeLinkedSeries = linkedSeries.find(
        (s) => s.is_published && !s.is_archived && accessCtx.activeSeriesIds.has(s.id)
      );
      if (!resolvedSeries && activeLinkedSeries) {
        resolvedSeries = activeLinkedSeries;
      }

      const hasRequestedSeriesAccess = requestedSeriesId
        ? accessCtx.activeSeriesIds.has(requestedSeriesId) || accessCtx.hasGlobalActiveSubscription
        : false;
      const hasAnySeriesAccess = Boolean(activeLinkedSeries) || accessCtx.hasGlobalActiveSubscription;

      if (requestedSeriesId && !hasRequestedSeriesAccess && !test.is_free) {
        const isExpired = accessCtx.expiredSeriesIds.has(requestedSeriesId);
        const isPending = accessCtx.pendingSeriesIds.has(requestedSeriesId);
        const err = new Error(
          isExpired
            ? 'Your test series access has expired'
            : isPending
              ? 'Your enrollment payment is pending confirmation'
              : 'You do not have active access to this test series'
        );
        err.status = 403;
        err.code = isExpired ? 'SERIES_ACCESS_EXPIRED' : isPending ? 'ACCESS_PENDING' : 'ACCESS_DENIED';
        throw err;
      }

      if (!test.is_free && !hasAnySeriesAccess) {
        const hasExpired = linkedSeries.some((s) => accessCtx.expiredSeriesIds.has(s.id));
        const hasPending = linkedSeries.some((s) => accessCtx.pendingSeriesIds.has(s.id));
        const err = new Error(
          hasExpired
            ? 'Your test series access has expired'
            : hasPending
              ? 'Your enrollment payment is pending confirmation'
              : 'Enrollment or purchase is required to start this test'
        );
        err.status = 403;
        err.code = hasExpired ? 'SERIES_ACCESS_EXPIRED' : hasPending ? 'ACCESS_PENDING' : 'ACCESS_DENIED';
        throw err;
      }

      // 3. Validate test schedule (and series schedule if applicable)
      const nowMs = Date.now();
      if (test.start_time && new Date(test.start_time).getTime() > nowMs) {
        const err = new Error('Test has not started yet');
        err.status = 400;
        err.code = 'TEST_NOT_STARTED';
        err.details = { startTime: test.start_time };
        throw err;
      }
      if (test.end_time && new Date(test.end_time).getTime() < nowMs) {
        const err = new Error('Test schedule window has expired');
        err.status = 400;
        err.code = 'TEST_ENDED';
        err.details = { endTime: test.end_time };
        throw err;
      }
      if (resolvedSeries) {
        if (resolvedSeries.start_date && new Date(resolvedSeries.start_date).getTime() > nowMs) {
          const err = new Error('Test series has not started yet');
          err.status = 400;
          err.code = 'SERIES_NOT_STARTED';
          throw err;
        }
        if (resolvedSeries.end_date && new Date(resolvedSeries.end_date).getTime() < nowMs) {
          const err = new Error('Test series has ended');
          err.status = 400;
          err.code = 'SERIES_ENDED';
          throw err;
        }
      }

      // 5 (checked alongside 4). Validate no conflicting active attempt
      const [activeSameTest] = await connection.query(
        `SELECT id, test_id, started_at
         FROM test_attempts
         WHERE user_id = ? AND test_id = ? AND UPPER(status) = 'IN_PROGRESS'
         ORDER BY started_at DESC, id DESC
         LIMIT 1`,
        [userId, testId]
      );
      if (activeSameTest.length > 0) {
        const err = new Error('You already have an active attempt in progress for this test');
        err.status = 409;
        err.code = 'ACTIVE_ATTEMPT_EXISTS';
        err.conflictingAttemptId = activeSameTest[0].id;
        throw err;
      }

      // Check concurrent non-expired active attempt on any other test
      const [activeOtherTests] = await connection.query(
        `SELECT ta.id, ta.test_id, ta.started_at, t.name AS test_name, t.duration_minutes
         FROM test_attempts ta
         JOIN tests t ON t.id = ta.test_id
         WHERE ta.user_id = ?
           AND ta.test_id != ?
           AND UPPER(ta.status) = 'IN_PROGRESS'
           AND DATE_ADD(ta.started_at, INTERVAL COALESCE(NULLIF(t.duration_minutes, 0), 60) MINUTE) > NOW()
         ORDER BY ta.started_at DESC
         LIMIT 1`,
        [userId, testId]
      );
      if (activeOtherTests.length > 0) {
        const err = new Error(
          `You already have an active attempt in progress (${activeOtherTests[0].test_name || `Test #${activeOtherTests[0].test_id}`})`
        );
        err.status = 409;
        err.code = 'CONFLICTING_ACTIVE_ATTEMPT';
        err.conflictingAttemptId = activeOtherTests[0].id;
        err.conflictingTestId = activeOtherTests[0].test_id;
        throw err;
      }

      // 4. Validate attempt limit has not been reached (completed + evaluating attempts)
      const maxAttempts = test.max_attempts !== null && test.max_attempts !== undefined ? toNumber(test.max_attempts, 0) : null;
      if (maxAttempts && maxAttempts > 0) {
        const [[usedRow]] = await connection.query(
          `SELECT COUNT(*) AS usedAttempts
           FROM test_attempts
           WHERE user_id = ?
             AND test_id = ?
             AND UPPER(status) IN ('COMPLETED', 'EVALUATED', 'SUBMITTED', 'PENDING_EVALUATION', 'EVALUATING')`,
          [userId, testId]
        );
        const usedAttempts = toNumber(usedRow?.usedAttempts);
        if (usedAttempts >= maxAttempts) {
          const err = new Error(`Attempt limit (${maxAttempts}) reached for this test`);
          err.status = 403;
          err.code = 'ATTEMPT_LIMIT_REACHED';
          throw err;
        }
      }

      const questionsMap = await loadTestQuestionsMap(connection, [testId]);
      const testQuestions = questionsMap.get(testId) || [];
      const totalQuestions = testQuestions.length > 0 ? testQuestions.length : toNumber(test.total_questions, 0);
      const totalMarks =
        testQuestions.length > 0
          ? roundTwo(
              testQuestions.reduce(
                (sum, q) => sum + (toNumber(q.marks, 1) > 0 ? toNumber(q.marks, 1) : 1),
                0
              )
            )
          : toNumber(test.total_marks, 0);

      const finalSeriesId = resolvedSeries ? resolvedSeries.id : null;

      const [insertResult] = await connection.query(
        `INSERT INTO test_attempts (user_id, test_id, test_series_id, total_questions, total_marks, status)
         VALUES (?, ?, ?, ?, ?, 'IN_PROGRESS')`,
        [userId, testId, finalSeriesId, totalQuestions, totalMarks]
      );

      await connection.query('UPDATE users SET last_active_at = NOW() WHERE id = ?', [userId]);
      await connection.query(
        'INSERT INTO user_activity_logs (user_id, activity_type, reference_id, metadata) VALUES (?, ?, ?, ?)',
        [
          userId,
          'TEST_START',
          testId,
          JSON.stringify({ attemptId: insertResult.insertId, testSeriesId: finalSeriesId }),
        ]
      );

      await connection.commit();

      return {
        attemptId: insertResult.insertId,
        testId,
        testSeriesId: finalSeriesId,
        durationMinutes: toNumber(test.duration_minutes, 0),
        totalQuestions,
        totalMarks,
        startedAt: new Date().toISOString(),
      };
    } catch (error) {
      await connection.rollback();
      throw error;
    }
  });
}

async function abandonTestAttempt(userId, rawAttemptId) {
  const attemptId = parsePositiveInt(rawAttemptId);
  if (!attemptId) {
    const err = new Error('Invalid attemptId parameter');
    err.status = 400;
    throw err;
  }

  return withConnection(null, async (connection) => {
    const [rows] = await connection.query(
      'SELECT id, status FROM test_attempts WHERE id = ? AND user_id = ?',
      [attemptId, userId]
    );
    if (rows.length === 0) {
      return null;
    }
    const attempt = rows[0];
    if (String(attempt.status).toUpperCase() !== 'IN_PROGRESS') {
      const err = new Error('Only in-progress attempts can be abandoned');
      err.status = 400;
      throw err;
    }

    await connection.query(
      "UPDATE test_attempts SET status = 'ABANDONED' WHERE id = ? AND user_id = ?",
      [attemptId, userId]
    );
    return { attemptId, status: 'ABANDONED' };
  });
}

/**
 * Section 4: Recent Attempts (Latest 5) & Full Paginated Attempt History
 */
function formatAttemptListItem(a) {
  return {
    attemptId: a.attemptId,
    testId: a.testId,
    testName: a.testName,
    testSeriesId: a.testSeriesId,
    testSeriesTitle: a.testSeriesTitle,
    subjectName: a.subjectName,
    submittedAt: a.submittedAt,
    startedAt: a.startedAt,
    obtainedMarks: a.obtainedMarks,
    totalMarks: a.totalMarks,
    percentage: a.percentage,
    accuracy: a.accuracy,
    timeTakenSeconds: a.timeTakenSeconds,
    timeTakenMinutes: a.timeTakenMinutes,
    correctAnswers: a.correctAnswers,
    wrongAnswers: a.wrongAnswers,
    skippedQuestions: a.skippedQuestions,
    totalQuestions: a.totalQuestions,
    resultStatus: a.resultStatus,
    passed: a.passed,
    rank: a.rank,
  };
}

async function getRecentAttempts(userId, options = {}, existingConnection = null) {
  return withConnection(existingConnection, async (connection) => {
    const { attempts } = await loadEvaluatedAttemptsWithMetrics(connection, userId, options);
    const limitRaw = Number.parseInt(options.limit, 10);
    const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 5) : 5;
    const items = attempts.slice(0, limit).map(formatAttemptListItem);

    return {
      items,
      totalEvaluatedAttempts: attempts.length,
    };
  });
}

async function getAllEvaluatedAttempts(userId, options = {}, existingConnection = null) {
  return withConnection(existingConnection, async (connection) => {
    const { page, limit, offset } = parsePagination(options, 10, 100);
    const { attempts, filters } = await loadEvaluatedAttemptsWithMetrics(connection, userId, options);

    let filtered = attempts;
    if (options.resultStatus && String(options.resultStatus).trim() && String(options.resultStatus).toUpperCase() !== 'ALL') {
      const target = String(options.resultStatus).trim().toLowerCase();
      filtered = filtered.filter((a) => a.resultStatus.toLowerCase() === target);
    }

    const total = filtered.length;
    const items = filtered.slice(offset, offset + limit).map(formatAttemptListItem);

    return {
      items,
      filters,
      pagination: {
        page,
        limit,
        total,
        totalPages: total > 0 ? Math.ceil(total / limit) : 0,
      },
    };
  });
}

/**
 * Section 4 View Result Page (full breakdown + question-wise review)
 */
async function getAttemptResultDetail(userId, rawAttemptId) {
  const attemptId = parsePositiveInt(rawAttemptId);
  if (!attemptId) {
    const err = new Error('Invalid attemptId parameter');
    err.status = 400;
    throw err;
  }

  return withConnection(null, async (connection) => {
    const [attemptRows] = await connection.query(
      `SELECT
         ta.*,
         COALESCE(t.name, CONCAT('Test #', ta.test_id)) AS test_name,
         t.duration_minutes,
         t.total_questions AS test_total_questions,
         t.total_marks AS test_total_marks,
         t.passing_marks,
         t.negative_marking AS test_negative_marking,
         COALESCE(s.name, 'General') AS test_subject_name,
         COALESCE(
           ta.test_series_id,
           (SELECT tst2.test_series_id FROM test_series_tests tst2 WHERE tst2.test_id = ta.test_id ORDER BY tst2.display_order ASC, tst2.test_series_id ASC LIMIT 1)
         ) AS resolved_series_id,
         COALESCE(
           ts.title,
           (SELECT ts2.title FROM test_series_tests tst2 JOIN test_series ts2 ON tst2.test_series_id = ts2.id WHERE tst2.test_id = ta.test_id ORDER BY tst2.display_order ASC, tst2.test_series_id ASC LIMIT 1)
         ) AS test_series_title
       FROM test_attempts ta
       LEFT JOIN tests t ON t.id = ta.test_id
       LEFT JOIN subjects s ON s.id = t.subject_id
       LEFT JOIN test_series ts ON ts.id = ta.test_series_id
       WHERE ta.id = ? AND ta.user_id = ?`,
      [attemptId, userId]
    );

    if (attemptRows.length === 0) return null;
    const attempt = attemptRows[0];

    if (!isAttemptEvaluated(attempt)) {
      const err = new Error('Result is not available until test evaluation is complete');
      err.status = 403;
      err.code = 'EVALUATION_PENDING';
      err.attemptStatus = attempt.status;
      throw err;
    }

    const questionsMap = await loadTestQuestionsMap(connection, [attempt.test_id]);
    const testQuestions = questionsMap.get(Number(attempt.test_id)) || [];

    let optionsByQuestion = {};
    if (testQuestions.length > 0) {
      const [options] = await connection.query(
        `SELECT id, question_id, option_text, option_key, is_correct, display_order
         FROM question_options
         WHERE question_id IN (?)
         ORDER BY display_order ASC, id ASC`,
        [testQuestions.map((q) => q.id)]
      );
      optionsByQuestion = options.reduce((acc, opt) => {
        if (!acc[opt.question_id]) acc[opt.question_id] = [];
        acc[opt.question_id].push({
          id: opt.id,
          optionKey: opt.option_key || null,
          optionText: opt.option_text,
          isCorrect: Boolean(opt.is_correct),
        });
        return acc;
      }, {});
    }

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
       WHERE aa.attempt_id = ?
       ORDER BY aa.id ASC`,
      [attemptId]
    );

    const evalMetrics = computeAttemptEvaluation(attempt, testQuestions, answerRows);

    const answersByQuestionId = new Map();
    for (const ans of answerRows) {
      answersByQuestionId.set(Number(ans.question_id), ans);
    }

    const testNegativeMarking = toNumber(attempt.test_negative_marking, 0);
    const questions = testQuestions.map((q, index) => {
      const qOptions = optionsByQuestion[q.id] || [];
      const userAns = answersByQuestionId.get(Number(q.id)) || null;
      const correctOpt = qOptions.find((o) => o.isCorrect) || null;
      const selectedOpt =
        userAns && userAns.selected_option_id
          ? qOptions.find((o) => o.id === userAns.selected_option_id) || null
          : null;

      const qMarks = toNumber(q.marks, 1) > 0 ? toNumber(q.marks, 1) : 1;
      const qNeg = toNumber(q.negative_marks, 0) > 0 ? toNumber(q.negative_marks, 0) : testNegativeMarking;

      const isSkipped =
        !userAns || userAns.selected_option_id === null || userAns.selected_option_id === undefined;
      const isCorrect = !isSkipped && (selectedOpt ? selectedOpt.isCorrect : Boolean(userAns.is_correct));
      const marksObtained = isSkipped ? 0 : isCorrect ? qMarks : -qNeg;

      return {
        questionId: q.id,
        questionNumber: index + 1,
        questionText: q.question_text,
        questionType: q.question_type || 'MCQ',
        subject: q.subject && String(q.subject).trim() ? String(q.subject).trim() : attempt.test_subject_name,
        topic: q.topic || null,
        difficulty: q.difficulty || null,
        marks: roundTwo(qMarks),
        negativeMarks: roundTwo(qNeg),
        options: qOptions,
        selectedOptionId: userAns?.selected_option_id ?? null,
        selectedOptionKey: selectedOpt?.optionKey ?? null,
        selectedOptionText: selectedOpt?.optionText ?? null,
        correctOptionId: correctOpt?.id ?? null,
        correctOptionKey: correctOpt?.optionKey ?? null,
        correctOptionText: correctOpt?.optionText ?? null,
        answerStatus: isSkipped ? 'skipped' : isCorrect ? 'correct' : 'wrong',
        isCorrect,
        isSkipped,
        marksObtained: roundTwo(marksObtained),
        explanation: q.explanation || '',
        answeredAt: userAns?.answered_at ?? null,
      };
    });

    return {
      summary: {
        attemptId: attempt.id,
        testId: attempt.test_id,
        testName: attempt.test_name,
        testSeriesId: attempt.resolved_series_id || null,
        testSeriesTitle: attempt.test_series_title || null,
        subjectName: attempt.test_subject_name,
        durationMinutes: attempt.duration_minutes ?? null,
        status: attempt.status,
        startedAt: attempt.started_at,
        submittedAt: attempt.submitted_at,
        rank: attempt.rank ?? null,
        totalQuestions: evalMetrics.totalQuestions,
        attemptedQuestions: evalMetrics.attemptedQuestions,
        correctAnswers: evalMetrics.correctAnswers,
        wrongAnswers: evalMetrics.wrongAnswers,
        skippedQuestions: evalMetrics.skippedQuestions,
        totalMarks: evalMetrics.totalMarks,
        obtainedMarks: evalMetrics.obtainedMarks,
        percentage: evalMetrics.percentage,
        accuracy: evalMetrics.accuracy,
        passingMarks: evalMetrics.passingMarks,
        resultStatus: evalMetrics.resultStatus,
        passed: evalMetrics.passed,
        timeTakenSeconds: evalMetrics.timeTakenSeconds,
        timeTakenMinutes: evalMetrics.timeTakenMinutes,
      },
      subjectWisePerformance: evalMetrics.subjectBreakdown,
      questions,
    };
  });
}

/**
 * Section 5: Performance Analytics
 */
async function getPerformanceAnalytics(userId, options = {}, existingConnection = null) {
  return withConnection(existingConnection, async (connection) => {
    const { attempts, filters } = await loadEvaluatedAttemptsWithMetrics(connection, userId, options);

    if (attempts.length === 0) {
      return {
        filters,
        scoreTrend: [],
        subjectWisePerformance: [],
        metrics: {
          highestScore: 0,
          highestScoreDetail: null,
          averageScore: 0,
          overallAccuracy: 0,
          averageTimePerTestSeconds: 0,
          averageTimePerTestMinutes: 0,
          totalCompletedTests: 0,
          totalCorrectAnswers: 0,
          totalIncorrectAnswers: 0,
          totalSkippedQuestions: 0,
          totalAttemptedQuestions: 0,
        },
      };
    }

    // Score trend: latest 10 evaluated attempts plotted oldest-to-newest (T1..T10)
    const latestTenChrono = [...attempts].slice(0, 10).reverse();
    const scoreTrend = latestTenChrono.map((a, idx) => ({
      label: `T${idx + 1}`,
      attemptId: a.attemptId,
      testId: a.testId,
      testName: a.testName,
      submittedAt: a.submittedAt,
      obtainedMarks: a.obtainedMarks,
      totalMarks: a.totalMarks,
      percentage: a.percentage,
      accuracy: a.accuracy,
      timeTakenSeconds: a.timeTakenSeconds,
    }));

    // Subject-wise performance aggregated across filtered evaluated attempts
    const subjectMap = new Map();
    const filterSubjectLower = filters.subject ? filters.subject.toLowerCase() : null;

    for (const a of attempts) {
      for (const sb of a.subjectBreakdown) {
        if (filterSubjectLower && sb.subject.toLowerCase() !== filterSubjectLower) continue;

        const existing = subjectMap.get(sb.subject) || {
          subject: sb.subject,
          attempts: 0,
          totalQuestions: 0,
          attempted: 0,
          correct: 0,
          wrong: 0,
          skipped: 0,
          obtainedMarks: 0,
          totalMarks: 0,
        };
        existing.attempts += 1;
        existing.totalQuestions += sb.totalQuestions;
        existing.attempted += sb.attempted;
        existing.correct += sb.correct;
        existing.wrong += sb.wrong;
        existing.skipped += sb.skipped;
        existing.obtainedMarks += sb.obtainedMarks;
        existing.totalMarks += sb.totalMarks;
        subjectMap.set(sb.subject, existing);
      }
    }

    const subjectWisePerformance = Array.from(subjectMap.values())
      .map((entry) => {
        const accuracy = entry.attempted > 0 ? roundTwo((entry.correct / entry.attempted) * 100) : 0;
        const scorePercentage = entry.totalMarks > 0 ? roundTwo((entry.obtainedMarks / entry.totalMarks) * 100) : 0;
        return {
          subject: entry.subject,
          attempts: entry.attempts,
          totalQuestions: entry.totalQuestions,
          attempted: entry.attempted,
          correct: entry.correct,
          wrong: entry.wrong,
          skipped: entry.skipped,
          obtainedMarks: roundTwo(entry.obtainedMarks),
          totalMarks: roundTwo(entry.totalMarks),
          scorePercentage,
          accuracy,
          status: getSubjectStatus(accuracy),
        };
      })
      .sort((a, b) => b.accuracy - a.accuracy || b.attempted - a.attempted);

    let bestAttempt = attempts[0];
    let sumPercentage = 0;
    let totalCorrect = 0;
    let totalWrong = 0;
    let totalSkipped = 0;
    let totalAttempted = 0;
    let totalTimeSeconds = 0;

    for (const a of attempts) {
      if (
        a.percentage > bestAttempt.percentage ||
        (a.percentage === bestAttempt.percentage && a.obtainedMarks > bestAttempt.obtainedMarks)
      ) {
        bestAttempt = a;
      }
      sumPercentage += a.percentage;
      totalCorrect += a.correctAnswers;
      totalWrong += a.wrongAnswers;
      totalSkipped += a.skippedQuestions;
      totalAttempted += a.attemptedQuestions;
      totalTimeSeconds += a.timeTakenSeconds;
    }

    const avgTimeSeconds = Math.round(totalTimeSeconds / attempts.length);

    return {
      filters,
      scoreTrend,
      subjectWisePerformance,
      metrics: {
        highestScore: bestAttempt.percentage,
        highestScoreDetail: {
          attemptId: bestAttempt.attemptId,
          testId: bestAttempt.testId,
          testName: bestAttempt.testName,
          obtainedMarks: bestAttempt.obtainedMarks,
          totalMarks: bestAttempt.totalMarks,
          percentage: bestAttempt.percentage,
          submittedAt: bestAttempt.submittedAt,
        },
        averageScore: roundTwo(sumPercentage / attempts.length),
        overallAccuracy: totalAttempted > 0 ? roundTwo((totalCorrect / totalAttempted) * 100) : 0,
        averageTimePerTestSeconds: avgTimeSeconds,
        averageTimePerTestMinutes: roundTwo(avgTimeSeconds / 60),
        totalCompletedTests: attempts.length,
        totalCorrectAnswers: totalCorrect,
        totalIncorrectAnswers: totalWrong,
        totalSkippedQuestions: totalSkipped,
        totalAttemptedQuestions: totalAttempted,
      },
    };
  });
}

/**
 * Combined Dashboard Endpoint (all 6 sections)
 */
async function getFullDashboard(userId, options = {}) {
  await ensureStudentDashboardTables();

  return withConnection(null, async (connection) => {
    const summary = await getDashboardSummary(userId, connection);
    const testSeries = await getMyTestSeries(
      userId,
      { page: 1, limit: options.seriesLimit || 6 },
      connection
    );
    const availableTests = await getAvailableTests(
      userId,
      { page: 1, limit: options.testsLimit || 6 },
      connection
    );
    const recentAttempts = await getRecentAttempts(userId, { limit: 5 }, connection);
    const performance = await getPerformanceAnalytics(userId, options, connection);
    const notifications = await notificationModel.getUserNotifications(
      userId,
      { page: 1, limit: 5 },
      connection
    );

    return {
      summary,
      testSeries,
      availableTests,
      recentAttempts,
      performance,
      notifications,
    };
  });
}

module.exports = {
  EVALUATED_ATTEMPT_STATUSES,
  EXCLUDED_ATTEMPT_STATUSES,
  PENDING_EVALUATION_STATUSES,
  isAttemptEvaluated,
  parsePositiveInt,
  parsePagination,
  loadTestQuestionsMap,
  computeAttemptEvaluation,
  getDashboardSummary,
  getMyTestSeries,
  getStudentTestSeriesDetail,
  getAvailableTests,
  validateAndStartTest,
  abandonTestAttempt,
  getRecentAttempts,
  getAllEvaluatedAttempts,
  getAttemptResultDetail,
  getPerformanceAnalytics,
  getFullDashboard,
};
