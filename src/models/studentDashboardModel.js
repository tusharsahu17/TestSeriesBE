const { createDbConnection } = require("../config/db");
const {
  ensureStudentDashboardTables,
} = require("../config/initStudentDashboardTables");
const notificationModel = require("./notificationModel");

const EVALUATED_ATTEMPT_STATUSES = new Set(["COMPLETED", "EVALUATED"]);
const EXCLUDED_ATTEMPT_STATUSES = new Set([
  "ABANDONED",
  "INVALID",
  "CANCELLED",
]);
const PENDING_EVALUATION_STATUSES = new Set([
  "SUBMITTED",
  "PENDING_EVALUATION",
  "EVALUATING",
]);

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
  return Number.isFinite(parsed) &&
    parsed > 0 &&
    String(parsed) === String(val).trim()
    ? parsed
    : null;
}

function parsePagination(query = {}, defaultLimit = 10, maxLimit = 100) {
  const pageRaw = Number.parseInt(query.page, 10);
  const limitRaw = Number.parseInt(query.limit, 10);
  const page = Number.isFinite(pageRaw) && pageRaw > 0 ? pageRaw : 1;
  const limit =
    Number.isFinite(limitRaw) && limitRaw > 0
      ? Math.min(limitRaw, maxLimit)
      : defaultLimit;
  const offset = (page - 1) * limit;
  return { page, limit, offset };
}

function isAttemptEvaluated(attempt) {
  if (!attempt || !attempt.status) return false;
  return EVALUATED_ATTEMPT_STATUSES.has(
    String(attempt.status).trim().toUpperCase(),
  );
}

function resolveDateRangeFilter(filters = {}) {
  const range = filters.range
    ? String(filters.range).trim().toLowerCase()
    : "all";
  let dateFrom = filters.dateFrom
    ? String(filters.dateFrom).trim().slice(0, 10)
    : null;
  const dateTo = filters.dateTo
    ? String(filters.dateTo).trim().slice(0, 10)
    : null;

  if (!dateFrom && range && range !== "all") {
    const now = new Date();
    const daysMap = {
      "7d": 7,
      "30d": 30,
      "90d": 90,
      "6m": 180,
      "1y": 365,
    };
    const days = daysMap[range];
    if (days) {
      const start = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate() - (days - 1),
      );
      const y = start.getFullYear();
      const m = String(start.getMonth() + 1).padStart(2, "0");
      const d = String(start.getDate()).padStart(2, "0");
      dateFrom = `${y}-${m}-${d}`;
    }
  }

  return {
    range: range || "all",
    dateFrom,
    dateTo,
    subject: filters.subject ? String(filters.subject).trim() : null,
    topicId: parsePositiveInt(filters.topic_id || filters.topicId),
    testType:
      filters.test_type || filters.testType
        ? String(filters.test_type || filters.testType).trim()
        : null,
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

  const uniqueTestIds = [
    ...new Set(testIds.map((id) => Number(id)).filter((id) => id > 0)),
  ];
  if (uniqueTestIds.length === 0) return map;

  for (const id of uniqueTestIds) {
    map.set(id, []);
  }

  const [directRows] = await connection.query(
    `SELECT q.*, q.test_id AS mapped_test_id, COALESCE(q.display_order, 0) AS sort_order
     FROM questions q
     WHERE q.test_id IN (?)
     ORDER BY sort_order ASC, q.id ASC`,
    [uniqueTestIds],
  );

  const [junctionRows] = await connection.query(
    `SELECT q.*, tq.test_id AS mapped_test_id, COALESCE(tq.question_order, q.display_order, 0) AS sort_order
     FROM test_questions tq
     JOIN questions q ON q.id = tq.question_id
     WHERE tq.test_id IN (?)
     ORDER BY sort_order ASC, q.id ASC`,
    [uniqueTestIds],
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
    arr.sort(
      (a, b) => toNumber(a.sort_order) - toNumber(b.sort_order) || a.id - b.id,
    );
    map.set(tId, arr);
  }

  return map;
}

function getSubjectStatus(accuracy) {
  if (accuracy >= 80) return "Strong";
  if (accuracy >= 60) return "Average";
  return "Needs improvement";
}

function computeResultStatus(
  obtainedMarks,
  totalMarks,
  passingMarks,
  testTotalMarks,
) {
  const rawPassing = toNumber(passingMarks, 0);
  if (rawPassing > 0) {
    const effectivePassing =
      toNumber(testTotalMarks, 0) > 0 &&
      totalMarks > 0 &&
      toNumber(testTotalMarks) !== totalMarks
        ? roundTwo((rawPassing / toNumber(testTotalMarks)) * totalMarks)
        : rawPassing;
    const passed = obtainedMarks >= effectivePassing;
    return {
      resultStatus: passed ? "Passed" : "Failed",
      passed,
      effectivePassingMarks: effectivePassing,
    };
  }
  return {
    resultStatus: "Completed",
    passed: null,
    effectivePassingMarks: null,
  };
}

function computeAttemptEvaluation(
  attempt,
  testQuestions = [],
  answerRows = [],
) {
  const testSubjectName = attempt.test_subject_name || "General";
  const testTopicName = attempt.test_topic_name || "General";
  const testTopicId = attempt.topic_id ?? null;
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
  const topicMap = new Map();

  const addSubjectStat = (
    subjectName,
    { isSkipped, isCorrect, qMarks, marksObtained },
  ) => {
    const key = subjectName || "General";
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

  const addTopicStat = (
    topicName,
    topicId,
    { isSkipped, isCorrect, qMarks, marksObtained },
  ) => {
    const label = topicName || "General";
    const key = label.toLowerCase();
    const entry = topicMap.get(key) || {
      topicId: topicId ?? null,
      topic: label,
      totalQuestions: 0,
      attempted: 0,
      correct: 0,
      wrong: 0,
      skipped: 0,
      totalMarks: 0,
      obtainedMarks: 0,
    };
    if (!entry.topicId && topicId) entry.topicId = topicId;
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
    topicMap.set(key, entry);
  };

  if (testQuestions.length > 0) {
    const processedQuestionIds = new Set();

    for (const q of testQuestions) {
      processedQuestionIds.add(Number(q.id));
      const ans = answersByQuestionId.get(Number(q.id)) || null;
      const qMarks = toNumber(q.marks, 1) > 0 ? toNumber(q.marks, 1) : 1;
      const qNeg =
        toNumber(q.negative_marks, 0) > 0
          ? toNumber(q.negative_marks, 0)
          : testNegativeMarking;
      const subjectName =
        q.subject && String(q.subject).trim()
          ? String(q.subject).trim()
          : testSubjectName;
      const topicName =
        q.topic && String(q.topic).trim()
          ? String(q.topic).trim()
          : testTopicName;
      const topicId = q.topic_id ?? testTopicId;

      totalQuestions += 1;
      totalMarks += qMarks;

      const isSkipped =
        !ans ||
        ans.selected_option_id === null ||
        ans.selected_option_id === undefined;
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

      addSubjectStat(subjectName, {
        isSkipped,
        isCorrect,
        qMarks,
        marksObtained,
      });
      addTopicStat(topicName, topicId, {
        isSkipped,
        isCorrect,
        qMarks,
        marksObtained,
      });
    }

    // Handle any orphan answers for deleted questions that still belong to this attempt
    for (const ans of answerRows) {
      if (processedQuestionIds.has(Number(ans.question_id))) continue;
      if (
        ans.selected_option_id === null ||
        ans.selected_option_id === undefined
      )
        continue;
      const qMarks =
        toNumber(ans.question_marks, 1) > 0
          ? toNumber(ans.question_marks, 1)
          : 1;
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
      const topicName =
        ans.question_topic && String(ans.question_topic).trim()
          ? String(ans.question_topic).trim()
          : testTopicName;
      const topicId = ans.question_topic_id ?? testTopicId;

      totalQuestions += 1;
      attemptedQuestions += 1;
      totalMarks += qMarks;
      if (isCorrect) correctAnswers += 1;
      else wrongAnswers += 1;
      obtainedMarks += marksObtained;

      addSubjectStat(subjectName, {
        isSkipped: false,
        isCorrect,
        qMarks,
        marksObtained,
      });
      addTopicStat(topicName, topicId, {
        isSkipped: false,
        isCorrect,
        qMarks,
        marksObtained,
      });
    }
  } else {
    totalQuestions = toNumber(
      attempt.total_questions || attempt.test_total_questions,
      0,
    );
    attemptedQuestions = toNumber(attempt.attempted_questions, 0);
    correctAnswers = toNumber(attempt.correct_answers, 0);
    wrongAnswers = toNumber(attempt.wrong_answers, 0);
    skippedQuestions = Math.max(
      totalQuestions - attemptedQuestions,
      toNumber(attempt.skipped_questions, 0),
    );
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
      topicMap.set(testTopicName.toLowerCase(), {
        topicId: testTopicId,
        topic: testTopicName,
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
  const percentage =
    totalMarks > 0 ? roundTwo((obtainedMarks / totalMarks) * 100) : 0;
  const accuracy =
    attemptedQuestions > 0
      ? roundTwo((correctAnswers / attemptedQuestions) * 100)
      : 0;

  const timeTakenSeconds =
    toNumber(attempt.time_taken_seconds) > 0
      ? toNumber(attempt.time_taken_seconds)
      : attempt.submitted_at && attempt.started_at
        ? Math.max(
            0,
            Math.floor(
              (new Date(attempt.submitted_at) - new Date(attempt.started_at)) /
                1000,
            ),
          )
        : 0;

  const { resultStatus, passed, effectivePassingMarks } = computeResultStatus(
    obtainedMarks,
    totalMarks,
    attempt.passing_marks,
    attempt.test_total_marks,
  );

  const subjectBreakdown = Array.from(subjectMap.values()).map((entry) => {
    const subjAccuracy =
      entry.attempted > 0
        ? roundTwo((entry.correct / entry.attempted) * 100)
        : 0;
    const subjPercentage =
      entry.totalMarks > 0
        ? roundTwo((entry.obtainedMarks / entry.totalMarks) * 100)
        : 0;
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

  const topicBreakdown = Array.from(topicMap.values()).map((entry) => {
    const topicAccuracy =
      entry.attempted > 0
        ? roundTwo((entry.correct / entry.attempted) * 100)
        : 0;
    const topicPercentage =
      entry.totalMarks > 0
        ? roundTwo((entry.obtainedMarks / entry.totalMarks) * 100)
        : 0;
    return {
      topicId: entry.topicId,
      topic: entry.topic,
      totalQuestions: entry.totalQuestions,
      attempted: entry.attempted,
      correct: entry.correct,
      wrong: entry.wrong,
      skipped: entry.skipped,
      totalMarks: roundTwo(entry.totalMarks),
      obtainedMarks: roundTwo(entry.obtainedMarks),
      percentage: topicPercentage,
      accuracy: topicAccuracy,
      status: getSubjectStatus(topicAccuracy),
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
    topicBreakdown,
  };
}

async function loadEvaluatedAttemptsWithMetrics(
  connection,
  userId,
  rawFilters = {},
) {
  const filters = resolveDateRangeFilter(rawFilters);

  const conditions = [
    "ta.user_id = ?",
    "UPPER(ta.status) IN ('COMPLETED', 'EVALUATED')",
  ];
  const params = [userId];

  if (filters.dateFrom) {
    conditions.push(
      "DATE(COALESCE(ta.submitted_at, ta.started_at, ta.created_at)) >= ?",
    );
    params.push(filters.dateFrom);
  }
  if (filters.dateTo) {
    conditions.push(
      "DATE(COALESCE(ta.submitted_at, ta.started_at, ta.created_at)) <= ?",
    );
    params.push(filters.dateTo);
  }
  if (rawFilters.search && String(rawFilters.search).trim()) {
    const like = `%${String(rawFilters.search).trim()}%`;
    conditions.push(
      "(t.name LIKE ? OR s.name LIKE ? OR top.name LIKE ? OR st.name LIKE ?)",
    );
    params.push(like, like, like, like);
  }
  if (filters.topicId) {
    conditions.push(
      "(t.topic_id = ? OR t.id IN (SELECT test_id FROM test_topics WHERE topic_id = ?))",
    );
    params.push(filters.topicId, filters.topicId);
  }
  if (filters.testType) {
    conditions.push("LOWER(t.test_type) = LOWER(?)");
    params.push(filters.testType);
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
       t.test_type,
       t.topic_id,
       top.name AS test_topic_name,
       t.subtopic_id,
       st.name AS test_subtopic_name,
       COALESCE(s.name, 'General') AS test_subject_name,
       COALESCE(ta.submitted_at, ta.started_at, ta.created_at) AS evaluated_at
     FROM test_attempts ta
     LEFT JOIN tests t ON t.id = ta.test_id
     LEFT JOIN subjects s ON s.id = t.subject_id
     LEFT JOIN topics top ON top.id = t.topic_id
     LEFT JOIN subtopics st ON st.id = t.subtopic_id
     WHERE ${conditions.join(" AND ")}
     ORDER BY COALESCE(ta.submitted_at, ta.started_at, ta.created_at) DESC, ta.id DESC`,
    params,
  );

  if (attemptRows.length === 0) {
    return { attempts: [], filters };
  }

  const attemptIds = attemptRows.map((a) => a.id);
  const testIds = [
    ...new Set(attemptRows.map((a) => a.test_id).filter(Boolean)),
  ];

  const questionsMap = await loadTestQuestionsMap(connection, testIds);

  const [answerRows] = await connection.query(
    `SELECT
       aa.*,
       qo.is_correct AS option_is_correct,
       q.marks AS question_marks,
       q.negative_marks AS question_negative_marks,
       q.subject AS question_subject,
       q.topic_id AS question_topic_id,
       q.topic AS question_topic
     FROM attempt_answers aa
     LEFT JOIN question_options qo ON qo.id = aa.selected_option_id
     LEFT JOIN questions q ON q.id = aa.question_id
     WHERE aa.attempt_id IN (?)
     ORDER BY aa.id ASC`,
    [attemptIds],
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
    const evalMetrics = computeAttemptEvaluation(
      attempt,
      testQuestions,
      answers,
    );

    return {
      attemptId: attempt.id,
      testId: attempt.test_id,
      testName: attempt.test_name,
      testType: attempt.test_type || null,
      testSeriesId: null,
      testSeriesTitle: null,
      subjectName: attempt.test_subject_name,
      topicId: attempt.topic_id || null,
      topicName: attempt.test_topic_name || null,
      subtopicId: attempt.subtopic_id || null,
      subtopicName: attempt.test_subtopic_name || null,
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
      a.subjectBreakdown.some((s) => s.subject.toLowerCase() === subjectLower),
    );
  }

  return { attempts, filters };
}

async function getActiveTestSeriesCount(connection, userId) {
  return 0;
}

/**
 * Section 1: Overview Cards
 */
async function getDashboardSummary(userId, existingConnection = null) {
  return withConnection(existingConnection, async (connection) => {
    const [userRows] = await connection.query(
      "SELECT id, username, name, email, subscription_status FROM users WHERE id = ?",
      [userId],
    );
    const user = userRows[0] || {
      id: userId,
      username: "",
      name: null,
      email: null,
      subscription_status: "free",
    };

    const { attempts } = await loadEvaluatedAttemptsWithMetrics(
      connection,
      userId,
    );

    const [[inProgressRow]] = await connection.query(
      `SELECT COUNT(*) AS inProgressCount
       FROM test_attempts
       WHERE user_id = ? AND UPPER(status) = 'IN_PROGRESS'`,
      [userId],
    );

    const activeTestSeries = await getActiveTestSeriesCount(connection, userId);

    if (attempts.length === 0) {
      return {
        student: {
          id: user.id,
          username: user.username,
          name: user.name || user.username,
          email: user.email || null,
          subscriptionStatus: user.subscription_status || "free",
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
      totalAttemptedQuestions > 0
        ? roundTwo((totalCorrectAnswers / totalAttemptedQuestions) * 100)
        : 0;

    return {
      student: {
        id: user.id,
        username: user.username,
        name: user.name || user.username,
        email: user.email || null,
        subscriptionStatus: user.subscription_status || "free",
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
  const paymentStatus = row.payment_status
    ? String(row.payment_status).toUpperCase()
    : null;
  const rawStatus = String(row.status || "ACTIVE").toUpperCase();
  const expiresMs = row.expires_at ? new Date(row.expires_at).getTime() : null;
  const seriesEndMs = row.series_end_date
    ? new Date(row.series_end_date).getTime()
    : null;

  if (
    rawStatus === "CANCELLED" ||
    paymentStatus === "REFUNDED" ||
    paymentStatus === "FAILED"
  ) {
    return {
      accessStatus: "CANCELLED",
      accessLabel: "Cancelled",
      canAttempt: false,
    };
  }
  if (paymentStatus === "PENDING") {
    return {
      accessStatus: "PENDING",
      accessLabel: "Pending",
      canAttempt: false,
    };
  }
  if (
    rawStatus === "EXPIRED" ||
    (expiresMs && expiresMs <= nowMs) ||
    (seriesEndMs && seriesEndMs <= nowMs)
  ) {
    return {
      accessStatus: "EXPIRED",
      accessLabel: "Expired",
      canAttempt: false,
    };
  }
  if (rawStatus === "ACTIVE") {
    return {
      accessStatus: "ACTIVE",
      accessLabel: "Available",
      canAttempt: true,
    };
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
 * Section 2: My Test Series (Removed / Deprecated)
 */
async function getMyTestSeries(
  userId,
  options = {},
  existingConnection = null,
) {
  const { page, limit } = parsePagination(options, 20, 100);
  return {
    items: [],
    summary: {
      total: 0,
      active: 0,
      expired: 0,
      pending: 0,
      cancelled: 0,
    },
    pagination: {
      page,
      limit,
      total: 0,
      totalPages: 0,
    },
  };
}

async function getStudentAccessContext(connection, userId) {
  return {
    activeSeriesIds: new Set(),
    expiredSeriesIds: new Set(),
    pendingSeriesIds: new Set(),
    hasGlobalActiveSubscription: true,
  };
}

function buildTestAttemptStats(
  test,
  actualQuestions,
  attemptsForTest,
  accessCtx,
  linkedSeries,
  nowMs,
) {
  const questionCount =
    actualQuestions.length > 0
      ? actualQuestions.length
      : toNumber(test.total_questions, 0);
  const sumQuestionMarks = actualQuestions.reduce(
    (sum, q) => sum + (toNumber(q.marks, 1) > 0 ? toNumber(q.marks, 1) : 1),
    0,
  );
  const totalMarks =
    actualQuestions.length > 0
      ? roundTwo(sumQuestionMarks)
      : toNumber(test.total_marks, 0);

  const maxQuestionNegative = actualQuestions.reduce(
    (maxVal, q) => Math.max(maxVal, toNumber(q.negative_marks, 0)),
    0,
  );
  const negativeMarking =
    toNumber(test.negative_marking, 0) > 0
      ? roundTwo(test.negative_marking)
      : roundTwo(maxQuestionNegative);

  const activeAttempt =
    attemptsForTest.find(
      (a) => String(a.status).toUpperCase() === "IN_PROGRESS",
    ) || null;
  const evaluatedAttempts = attemptsForTest.filter((a) =>
    isAttemptEvaluated(a),
  );
  const pendingEvalAttempts = attemptsForTest.filter((a) =>
    PENDING_EVALUATION_STATUSES.has(String(a.status || "").toUpperCase()),
  );

  const attemptsUsed = evaluatedAttempts.length + pendingEvalAttempts.length;
  const maxAttempts =
    test.max_attempts !== null && test.max_attempts !== undefined
      ? toNumber(test.max_attempts, 0)
      : null;
  const attemptsRemaining =
    maxAttempts && maxAttempts > 0
      ? Math.max(maxAttempts - attemptsUsed, 0)
      : null;

  let accessSource = Boolean(test.is_free) ? "FREE" : "OPEN";
  const hasAccess = true;

  const startTimeMs = test.start_time
    ? new Date(test.start_time).getTime()
    : null;
  const endTimeMs = test.end_time ? new Date(test.end_time).getTime() : null;
  const isUpcoming = Boolean(startTimeMs && startTimeMs > nowMs);
  const isEnded = Boolean(endTimeMs && endTimeMs < nowMs);
  const isLimitReached = Boolean(
    maxAttempts && maxAttempts > 0 && attemptsUsed >= maxAttempts,
  );

  let attemptStatus = "NOT_STARTED";
  let canStart = true;
  let cannotStartReason = null;
  let actionLabel = "Start Test";

  if (!test.is_published || !test.is_active) {
    attemptStatus = "UNAVAILABLE";
    canStart = false;
    cannotStartReason = "Test is not published or currently unavailable";
    actionLabel = "Unavailable";
  } else if (isUpcoming) {
    attemptStatus = "UPCOMING";
    canStart = false;
    cannotStartReason = "Test has not started yet";
    actionLabel = "Upcoming";
  } else if (isEnded) {
    attemptStatus = "ENDED";
    canStart = false;
    cannotStartReason = "Test window has ended";
    actionLabel = evaluatedAttempts.length > 0 ? "View Result" : "Expired";
  } else if (activeAttempt) {
    attemptStatus = "IN_PROGRESS";
    canStart = false;
    cannotStartReason = "You already have an active attempt in progress";
    actionLabel = "Resume Test";
  } else if (isLimitReached) {
    attemptStatus = "ATTEMPT_LIMIT_REACHED";
    canStart = false;
    cannotStartReason = `Maximum attempt limit (${maxAttempts}) reached`;
    actionLabel =
      evaluatedAttempts.length > 0 ? "View Result" : "Limit Reached";
  } else if (evaluatedAttempts.length > 0) {
    attemptStatus = "COMPLETED";
    canStart = true;
    actionLabel = "Retake Test";
  }

  const latestEvaluated = evaluatedAttempts[0] || null;
  const bestPercentage =
    evaluatedAttempts.length > 0
      ? roundTwo(
          Math.max(...evaluatedAttempts.map((a) => toNumber(a.percentage, 0))),
        )
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
    isFromPurchasedSeries: false,
    isUpcoming,
    isEnded,
    canStart,
    cannotStartReason,
    actionLabel,
  };
}

/**
 * Section 2 Detail: Single Test Series details (Removed / Deprecated)
 */
async function getStudentTestSeriesDetail(
  userId,
  seriesId,
  existingConnection = null,
) {
  return null;
}

/**
 * Section 3: Available Tests Discovery
 */
async function getAvailableTests(
  userId,
  options = {},
  existingConnection = null,
) {
  return withConnection(existingConnection, async (connection) => {
    const { page, limit, offset } = parsePagination(options, 20, 100);
    const includeLocked =
      String(options.includeLocked || "").toLowerCase() === "true";
    const bucketFilter = options.bucket
      ? String(options.bucket).trim().toLowerCase()
      : "all";
    const searchFilter = options.search
      ? String(options.search).trim().toLowerCase()
      : "";
    const examId = options.exam_id || options.examId;
    const subjectId = options.subject_id || options.subjectId;
    const topicId = options.topic_id || options.topicId;
    const subtopicId = options.subtopic_id || options.subtopicId;
    const testType = options.test_type || options.testType;

    const accessCtx = await getStudentAccessContext(connection, userId);

    // Fetch weak subjects from student's evaluated performance for recommendation scoring
    const { attempts: evaluatedHistory } =
      await loadEvaluatedAttemptsWithMetrics(connection, userId);
    const subjectStatsForRec = new Map();
    for (const att of evaluatedHistory) {
      for (const sb of att.subjectBreakdown) {
        const cur = subjectStatsForRec.get(sb.subject) || {
          attempted: 0,
          correct: 0,
        };
        cur.attempted += sb.attempted;
        cur.correct += sb.correct;
        subjectStatsForRec.set(sb.subject, cur);
      }
    }
    const weakSubjects = new Set();
    for (const [subj, stat] of subjectStatsForRec.entries()) {
      const acc =
        stat.attempted > 0 ? (stat.correct / stat.attempted) * 100 : 0;
      if (acc < 70) weakSubjects.add(subj.toLowerCase());
    }

    let query = `
      SELECT
         t.*,
         s.name AS subject_name,
         e.name AS exam_name,
         top.name AS topic_name,
         st.name AS subtopic_name
       FROM tests t
       LEFT JOIN subjects s ON s.id = t.subject_id
       LEFT JOIN exams e ON e.id = t.exam_id
       LEFT JOIN topics top ON top.id = t.topic_id
       LEFT JOIN subtopics st ON st.id = t.subtopic_id
       WHERE t.is_published = 1
         AND t.is_active = 1
         AND (t.end_time IS NULL OR t.end_time >= NOW())
    `;
    const queryParams = [];

    if (examId) {
      query += " AND t.exam_id = ?";
      queryParams.push(examId);
    }

    if (subjectId) {
      query += " AND t.subject_id = ?";
      queryParams.push(subjectId);
    }

    if (topicId) {
      query +=
        " AND (t.topic_id = ? OR t.id IN (SELECT test_id FROM test_topics WHERE topic_id = ?))";
      queryParams.push(topicId, topicId);
    }

    if (subtopicId) {
      query += " AND t.subtopic_id = ?";
      queryParams.push(subtopicId);
    }

    if (testType) {
      query += " AND LOWER(t.test_type) = LOWER(?)";
      queryParams.push(testType);
    }

    query += " ORDER BY t.created_at DESC, t.id DESC";

    const [testRows] = await connection.query(query, queryParams);

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

    const [attemptRows] = await connection.query(
      `SELECT id, test_id, status, percentage, obtained_marks, total_marks, started_at, submitted_at
       FROM test_attempts
       WHERE user_id = ? AND test_id IN (?)
       ORDER BY COALESCE(submitted_at, started_at) DESC, id DESC`,
      [userId, testIds],
    );

    const attemptsByTestId = new Map();
    for (const row of attemptRows) {
      if (!attemptsByTestId.has(row.test_id))
        attemptsByTestId.set(row.test_id, []);
      attemptsByTestId.get(row.test_id).push(row);
    }

    const nowMs = Date.now();
    const fourteenDaysMs = 14 * 24 * 60 * 60 * 1000;

    const allCards = [];
    for (const test of testRows) {
      const qList = questionsMap.get(test.id) || [];
      const tAttempts = attemptsByTestId.get(test.id) || [];
      const stats = buildTestAttemptStats(
        test,
        qList,
        tAttempts,
        accessCtx,
        [],
        nowMs,
      );

      if (!includeLocked && !stats.hasAccess) {
        continue;
      }

      if (searchFilter) {
        const hay =
          `${test.name || ""} ${test.subject_name || ""} ${test.topic_name || ""} ${test.subtopic_name || ""} ${test.exam_name || ""}`.toLowerCase();
        if (!hay.includes(searchFilter)) continue;
      }

      const createdAtMs = test.created_at
        ? new Date(test.created_at).getTime()
        : 0;
      const isNew = Boolean(
        createdAtMs && nowMs - createdAtMs <= fourteenDaysMs,
      );
      const isFree = Boolean(test.is_free);

      const testSubjectLower = String(test.subject_name || "").toLowerCase();
      const questionSubjects = new Set(
        qList
          .map((q) =>
            String(q.subject || "")
              .trim()
              .toLowerCase(),
          )
          .filter(Boolean),
      );
      const matchesWeakSubject =
        weakSubjects.has(testSubjectLower) ||
        [...questionSubjects].some((qs) => weakSubjects.has(qs));

      const isUnattempted = stats.attemptsUsed === 0;
      const isRecommended =
        stats.hasAccess &&
        !stats.isEnded &&
        (matchesWeakSubject || (isUnattempted && isFree));

      const tags = [];
      if (stats.isUpcoming) tags.push("UPCOMING");
      if (isNew) tags.push("NEW");
      if (isFree) tags.push("FREE");
      if (isRecommended) tags.push("RECOMMENDED");

      allCards.push({
        id: test.id,
        name: test.name,
        description: test.description || null,
        testSeriesId: null,
        testSeriesTitle: null,
        examId: test.exam_id || null,
        exam_id: test.exam_id || null,
        examName: test.exam_name || null,
        exam_name: test.exam_name || null,
        subjectId: test.subject_id,
        subjectName: test.subject_name || "General",
        topicId: test.topic_id || null,
        topic_id: test.topic_id || null,
        topicName: test.topic_name || null,
        topic_name: test.topic_name || null,
        subtopicId: test.subtopic_id || null,
        subtopic_id: test.subtopic_id || null,
        subtopicName: test.subtopic_name || null,
        subtopic_name: test.subtopic_name || null,
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
        if (c.attemptStatus === "IN_PROGRESS") return 6;
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
    if (bucketFilter === "new" || bucketFilter === "newly_published") {
      filteredCards = buckets.newlyPublished;
    } else if (bucketFilter === "upcoming") {
      filteredCards = buckets.upcoming;
    } else if (bucketFilter === "recommended") {
      filteredCards = buckets.recommended;
    } else if (bucketFilter === "free" || bucketFilter === "free_practice") {
      filteredCards = buckets.freePractice;
    } else if (bucketFilter === "purchased" || bucketFilter === "enrolled") {
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
    const err = new Error("Invalid testId parameter");
    err.status = 400;
    err.code = "INVALID_TEST_ID";
    throw err;
  }

  return withConnection(null, async (connection) => {
    await connection.beginTransaction();
    try {
      // 0. Check user status
      const [userRows] = await connection.query(
        "SELECT id, status FROM users WHERE id = ?",
        [userId],
      );
      if (userRows.length === 0) {
        const err = new Error("User not found");
        err.status = 404;
        err.code = "USER_NOT_FOUND";
        throw err;
      }
      if (userRows[0].status && userRows[0].status !== "active") {
        const err = new Error(`User account is ${userRows[0].status}`);
        err.status = 403;
        err.code = "USER_INACTIVE";
        throw err;
      }

      // 1. Validate test is published and available
      const [testRows] = await connection.query(
        "SELECT * FROM tests WHERE id = ?",
        [testId],
      );
      if (testRows.length === 0) {
        const err = new Error("Test not found");
        err.status = 404;
        err.code = "TEST_NOT_FOUND";
        throw err;
      }
      const test = testRows[0];

      if (!test.is_published || !test.is_active) {
        const err = new Error("Test is not published or currently unavailable");
        err.status = 403;
        err.code = "TEST_UNAVAILABLE";
        throw err;
      }

      // 2. Validate test schedule
      const nowMs = Date.now();
      if (test.start_time && new Date(test.start_time).getTime() > nowMs) {
        const err = new Error("Test has not started yet");
        err.status = 400;
        err.code = "TEST_NOT_STARTED";
        err.details = { startTime: test.start_time };
        throw err;
      }
      if (test.end_time && new Date(test.end_time).getTime() < nowMs) {
        const err = new Error("Test schedule window has expired");
        err.status = 400;
        err.code = "TEST_ENDED";
        err.details = { endTime: test.end_time };
        throw err;
      }

      // 5 (checked alongside 4). Validate no conflicting active attempt
      const [activeSameTest] = await connection.query(
        `SELECT id, test_id, started_at
         FROM test_attempts
         WHERE user_id = ? AND test_id = ? AND UPPER(status) = 'IN_PROGRESS'
         ORDER BY started_at DESC, id DESC
         LIMIT 1`,
        [userId, testId],
      );
      if (activeSameTest.length > 0) {
        const err = new Error(
          "You already have an active attempt in progress for this test",
        );
        err.status = 409;
        err.code = "ACTIVE_ATTEMPT_EXISTS";
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
        [userId, testId],
      );
      if (activeOtherTests.length > 0) {
        const err = new Error(
          `You already have an active attempt in progress (${activeOtherTests[0].test_name || `Test #${activeOtherTests[0].test_id}`})`,
        );
        err.status = 409;
        err.code = "CONFLICTING_ACTIVE_ATTEMPT";
        err.conflictingAttemptId = activeOtherTests[0].id;
        err.conflictingTestId = activeOtherTests[0].test_id;
        throw err;
      }

      // 4. Validate attempt limit has not been reached (completed + evaluating attempts)
      const maxAttempts =
        test.max_attempts !== null && test.max_attempts !== undefined
          ? toNumber(test.max_attempts, 0)
          : null;
      if (maxAttempts && maxAttempts > 0) {
        const [[usedRow]] = await connection.query(
          `SELECT COUNT(*) AS usedAttempts
           FROM test_attempts
           WHERE user_id = ?
             AND test_id = ?
             AND UPPER(status) IN ('COMPLETED', 'EVALUATED', 'SUBMITTED', 'PENDING_EVALUATION', 'EVALUATING')`,
          [userId, testId],
        );
        const usedAttempts = toNumber(usedRow?.usedAttempts);
        if (usedAttempts >= maxAttempts) {
          const err = new Error(
            `Attempt limit (${maxAttempts}) reached for this test`,
          );
          err.status = 403;
          err.code = "ATTEMPT_LIMIT_REACHED";
          throw err;
        }
      }

      const questionsMap = await loadTestQuestionsMap(connection, [testId]);
      const testQuestions = questionsMap.get(testId) || [];
      const totalQuestions =
        testQuestions.length > 0
          ? testQuestions.length
          : toNumber(test.total_questions, 0);
      const totalMarks =
        testQuestions.length > 0
          ? roundTwo(
              testQuestions.reduce(
                (sum, q) =>
                  sum + (toNumber(q.marks, 1) > 0 ? toNumber(q.marks, 1) : 1),
                0,
              ),
            )
          : toNumber(test.total_marks, 0);

      const [insertResult] = await connection.query(
        `INSERT INTO test_attempts (user_id, test_id, total_questions, total_marks, status)
         VALUES (?, ?, ?, ?, 'IN_PROGRESS')`,
        [userId, testId, totalQuestions, totalMarks],
      );

      await connection.query(
        "UPDATE users SET last_active_at = NOW() WHERE id = ?",
        [userId],
      );
      await connection.query(
        "INSERT INTO user_activity_logs (user_id, activity_type, reference_id, metadata) VALUES (?, ?, ?, ?)",
        [
          userId,
          "TEST_START",
          testId,
          JSON.stringify({ attemptId: insertResult.insertId }),
        ],
      );

      await connection.commit();

      return {
        attemptId: insertResult.insertId,
        testId,
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
    const err = new Error("Invalid attemptId parameter");
    err.status = 400;
    throw err;
  }

  return withConnection(null, async (connection) => {
    const [rows] = await connection.query(
      "SELECT id, status FROM test_attempts WHERE id = ? AND user_id = ?",
      [attemptId, userId],
    );
    if (rows.length === 0) {
      return null;
    }
    const attempt = rows[0];
    if (String(attempt.status).toUpperCase() !== "IN_PROGRESS") {
      const err = new Error("Only in-progress attempts can be abandoned");
      err.status = 400;
      throw err;
    }

    await connection.query(
      "UPDATE test_attempts SET status = 'ABANDONED' WHERE id = ? AND user_id = ?",
      [attemptId, userId],
    );
    return { attemptId, status: "ABANDONED" };
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
    testType: a.testType ?? null,
    testSeriesId: a.testSeriesId,
    testSeriesTitle: a.testSeriesTitle,
    subjectName: a.subjectName,
    topicId: a.topicId ?? null,
    topicName: a.topicName ?? null,
    subtopicId: a.subtopicId ?? null,
    subtopicName: a.subtopicName ?? null,
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

async function getRecentAttempts(
  userId,
  options = {},
  existingConnection = null,
) {
  return withConnection(existingConnection, async (connection) => {
    const { attempts } = await loadEvaluatedAttemptsWithMetrics(
      connection,
      userId,
      options,
    );
    const limitRaw = Number.parseInt(options.limit, 10);
    const limit =
      Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 5) : 5;
    const items = attempts.slice(0, limit).map(formatAttemptListItem);

    return {
      items,
      totalEvaluatedAttempts: attempts.length,
    };
  });
}

async function getAllEvaluatedAttempts(
  userId,
  options = {},
  existingConnection = null,
) {
  return withConnection(existingConnection, async (connection) => {
    const { page, limit, offset } = parsePagination(options, 10, 100);
    const { attempts, filters } = await loadEvaluatedAttemptsWithMetrics(
      connection,
      userId,
      options,
    );

    let filtered = attempts;
    if (
      options.resultStatus &&
      String(options.resultStatus).trim() &&
      String(options.resultStatus).toUpperCase() !== "ALL"
    ) {
      const target = String(options.resultStatus).trim().toLowerCase();
      filtered = filtered.filter(
        (a) => a.resultStatus.toLowerCase() === target,
      );
    }

    const total = filtered.length;
    const items = filtered
      .slice(offset, offset + limit)
      .map(formatAttemptListItem);

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
    const err = new Error("Invalid attemptId parameter");
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
         t.test_type,
         t.topic_id,
         top.name AS test_topic_name,
         t.subtopic_id,
         st.name AS test_subtopic_name,
         COALESCE(s.name, 'General') AS test_subject_name
       FROM test_attempts ta
       LEFT JOIN tests t ON t.id = ta.test_id
       LEFT JOIN subjects s ON s.id = t.subject_id
       LEFT JOIN topics top ON top.id = t.topic_id
       LEFT JOIN subtopics st ON st.id = t.subtopic_id
       WHERE ta.id = ? AND ta.user_id = ?`,
      [attemptId, userId],
    );

    if (attemptRows.length === 0) return null;
    const attempt = attemptRows[0];

    if (!isAttemptEvaluated(attempt)) {
      const err = new Error(
        "Result is not available until test evaluation is complete",
      );
      err.status = 403;
      err.code = "EVALUATION_PENDING";
      err.attemptStatus = attempt.status;
      throw err;
    }

    const questionsMap = await loadTestQuestionsMap(connection, [
      attempt.test_id,
    ]);
    const testQuestions = questionsMap.get(Number(attempt.test_id)) || [];

    let optionsByQuestion = {};
    if (testQuestions.length > 0) {
      const [options] = await connection.query(
        `SELECT id, question_id, option_text, option_key, is_correct, display_order
         FROM question_options
         WHERE question_id IN (?)
         ORDER BY display_order ASC, id ASC`,
        [testQuestions.map((q) => q.id)],
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
         q.subject AS question_subject,
         q.topic_id AS question_topic_id,
         q.topic AS question_topic
       FROM attempt_answers aa
       LEFT JOIN question_options qo ON qo.id = aa.selected_option_id
       LEFT JOIN questions q ON q.id = aa.question_id
       WHERE aa.attempt_id = ?
       ORDER BY aa.id ASC`,
      [attemptId],
    );

    const evalMetrics = computeAttemptEvaluation(
      attempt,
      testQuestions,
      answerRows,
    );

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
      const qNeg =
        toNumber(q.negative_marks, 0) > 0
          ? toNumber(q.negative_marks, 0)
          : testNegativeMarking;

      const isSkipped =
        !userAns ||
        userAns.selected_option_id === null ||
        userAns.selected_option_id === undefined;
      const isCorrect =
        !isSkipped &&
        (selectedOpt ? selectedOpt.isCorrect : Boolean(userAns.is_correct));
      const marksObtained = isSkipped ? 0 : isCorrect ? qMarks : -qNeg;

      return {
        questionId: q.id,
        questionNumber: index + 1,
        questionText: q.question_text,
        questionType: q.question_type || "MCQ",
        subject:
          q.subject && String(q.subject).trim()
            ? String(q.subject).trim()
            : attempt.test_subject_name,
        topicId: q.topic_id ?? null,
        topic: q.topic || null,
        subtopicId: q.subtopic_id ?? null,
        subtopic: q.subtopic || null,
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
        answerStatus: isSkipped ? "skipped" : isCorrect ? "correct" : "wrong",
        isCorrect,
        isSkipped,
        marksObtained: roundTwo(marksObtained),
        explanation: q.explanation || "",
        answeredAt: userAns?.answered_at ?? null,
      };
    });

    return {
      summary: {
        attemptId: attempt.id,
        testId: attempt.test_id,
        testName: attempt.test_name,
        testType: attempt.test_type || null,
        testSeriesId: null,
        testSeriesTitle: null,
        subjectName: attempt.test_subject_name,
        topicId: attempt.topic_id || null,
        topicName: attempt.test_topic_name || null,
        subtopicId: attempt.subtopic_id || null,
        subtopicName: attempt.test_subtopic_name || null,
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
      topicWisePerformance: evalMetrics.topicBreakdown,
      questions,
    };
  });
}

/**
 * Section 5: Performance Analytics
 */
async function getPerformanceAnalytics(
  userId,
  options = {},
  existingConnection = null,
) {
  return withConnection(existingConnection, async (connection) => {
    const { attempts, filters } = await loadEvaluatedAttemptsWithMetrics(
      connection,
      userId,
      options,
    );

    if (attempts.length === 0) {
      return {
        filters,
        scoreTrend: [],
        subjectWisePerformance: [],
        topicWisePerformance: [],
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
    const filterSubjectLower = filters.subject
      ? filters.subject.toLowerCase()
      : null;

    for (const a of attempts) {
      for (const sb of a.subjectBreakdown) {
        if (
          filterSubjectLower &&
          sb.subject.toLowerCase() !== filterSubjectLower
        )
          continue;

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
        const accuracy =
          entry.attempted > 0
            ? roundTwo((entry.correct / entry.attempted) * 100)
            : 0;
        const scorePercentage =
          entry.totalMarks > 0
            ? roundTwo((entry.obtainedMarks / entry.totalMarks) * 100)
            : 0;
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

    // Topic-wise performance aggregated across filtered evaluated attempts
    const topicMap = new Map();
    for (const a of attempts) {
      for (const tb of a.topicBreakdown || []) {
        if (
          filters.topicId &&
          tb.topicId &&
          Number(tb.topicId) !== filters.topicId
        )
          continue;

        const key = tb.topic.toLowerCase();
        const existing = topicMap.get(key) || {
          topicId: tb.topicId ?? null,
          topic: tb.topic,
          attempts: 0,
          totalQuestions: 0,
          attempted: 0,
          correct: 0,
          wrong: 0,
          skipped: 0,
          obtainedMarks: 0,
          totalMarks: 0,
        };
        if (!existing.topicId && tb.topicId) existing.topicId = tb.topicId;
        existing.attempts += 1;
        existing.totalQuestions += tb.totalQuestions;
        existing.attempted += tb.attempted;
        existing.correct += tb.correct;
        existing.wrong += tb.wrong;
        existing.skipped += tb.skipped;
        existing.obtainedMarks += tb.obtainedMarks;
        existing.totalMarks += tb.totalMarks;
        topicMap.set(key, existing);
      }
    }

    const topicWisePerformance = Array.from(topicMap.values())
      .map((entry) => {
        const accuracy =
          entry.attempted > 0
            ? roundTwo((entry.correct / entry.attempted) * 100)
            : 0;
        const scorePercentage =
          entry.totalMarks > 0
            ? roundTwo((entry.obtainedMarks / entry.totalMarks) * 100)
            : 0;
        return {
          topicId: entry.topicId,
          topic: entry.topic,
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
        (a.percentage === bestAttempt.percentage &&
          a.obtainedMarks > bestAttempt.obtainedMarks)
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
      topicWisePerformance,
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
        overallAccuracy:
          totalAttempted > 0
            ? roundTwo((totalCorrect / totalAttempted) * 100)
            : 0,
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
    const availableTests = await getAvailableTests(
      userId,
      {
        page: 1,
        limit: options.testsLimit || 6,
        exam_id: options.exam_id || options.examId,
        subject_id: options.subject_id || options.subjectId,
        topic_id: options.topic_id || options.topicId,
        subtopic_id: options.subtopic_id || options.subtopicId,
        test_type: options.test_type || options.testType,
        bucket: options.bucket,
        search: options.search,
      },
      connection,
    );
    const recentAttempts = await getRecentAttempts(
      userId,
      { limit: 5 },
      connection,
    );
    const performance = await getPerformanceAnalytics(
      userId,
      options,
      connection,
    );
    const notifications = await notificationModel.getUserNotifications(
      userId,
      { page: 1, limit: 5 },
      connection,
    );

    return {
      summary,
      testSeries: {
        items: [],
        pagination: { page: 1, limit: 0, total: 0, totalPages: 0 },
      },
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
