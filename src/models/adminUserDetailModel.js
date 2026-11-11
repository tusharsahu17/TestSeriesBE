const { createDbConnection } = require('../config/db');

function toNumber(val, fallback = 0) {
  const num = Number(val);
  return Number.isFinite(num) ? num : fallback;
}

function roundTwo(val) {
  return Math.round((toNumber(val) + Number.EPSILON) * 100) / 100;
}

function parsePositiveInt(val) {
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

function appendDateRange(conditions, params, columnExpr, dateFrom, dateTo) {
  if (dateFrom && String(dateFrom).trim()) {
    conditions.push(`DATE(${columnExpr}) >= ?`);
    params.push(String(dateFrom).trim().slice(0, 10));
  }
  if (dateTo && String(dateTo).trim()) {
    conditions.push(`DATE(${columnExpr}) <= ?`);
    params.push(String(dateTo).trim().slice(0, 10));
  }
}

function parseMetadata(raw) {
  if (!raw) return null;
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function maxDate(dates) {
  let latest = null;
  for (const d of dates) {
    if (!d) continue;
    const parsed = new Date(d);
    if (Number.isNaN(parsed.getTime())) continue;
    if (!latest || parsed.getTime() > latest.getTime()) {
      latest = parsed;
    }
  }
  return latest;
}

function diffDaysFromNow(dateValue) {
  if (!dateValue) return null;
  const d = new Date(dateValue);
  if (Number.isNaN(d.getTime())) return null;
  const diffMs = Date.now() - d.getTime();
  return Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
}

function computeEngagementStatus({
  userStatus,
  createdAt,
  lastLoginAt,
  lastActiveAt,
  latestAttemptAt,
  latestLogAt,
  recentPercentages = [],
  activeEnrollmentsCount = 0,
  totalAttempts = 0,
}) {
  const lastActivityDate = maxDate([lastActiveAt, lastLoginAt, latestAttemptAt, latestLogAt]);
  const daysSinceLastActive = diffDaysFromNow(lastActivityDate);
  const daysSinceLastLogin = diffDaysFromNow(lastLoginAt);
  const daysSinceJoined = diffDaysFromNow(createdAt) ?? 0;

  if (userStatus === 'blocked') {
    return {
      status: 'inactive',
      reason: 'Account is blocked by administrator',
      daysSinceLastActive,
      daysSinceLastLogin,
      lastActivityAt: lastActivityDate ? lastActivityDate.toISOString() : null,
    };
  }

  if (userStatus === 'inactive') {
    return {
      status: 'inactive',
      reason: 'Account is deactivated',
      daysSinceLastActive,
      daysSinceLastLogin,
      lastActivityAt: lastActivityDate ? lastActivityDate.toISOString() : null,
    };
  }

  if (daysSinceLastActive === null) {
    if (daysSinceJoined > 30) {
      return {
        status: 'inactive',
        reason: `No recorded activity in ${daysSinceJoined} days since registration`,
        daysSinceLastActive: null,
        daysSinceLastLogin: null,
        lastActivityAt: null,
      };
    }
    if (daysSinceJoined > 7) {
      return {
        status: 'at_risk',
        reason: `Registered ${daysSinceJoined} days ago with no login or test activity`,
        daysSinceLastActive: null,
        daysSinceLastLogin: null,
        lastActivityAt: null,
      };
    }
    return {
      status: 'active',
      reason: 'Recently registered student',
      daysSinceLastActive: null,
      daysSinceLastLogin: null,
      lastActivityAt: null,
    };
  }

  if (daysSinceLastActive > 30) {
    return {
      status: 'inactive',
      reason: `No activity for ${daysSinceLastActive} days`,
      daysSinceLastActive,
      daysSinceLastLogin,
      lastActivityAt: lastActivityDate.toISOString(),
    };
  }

  if (daysSinceLastActive > 14) {
    return {
      status: 'at_risk',
      reason: `Low engagement (${daysSinceLastActive} days since last activity)`,
      daysSinceLastActive,
      daysSinceLastLogin,
      lastActivityAt: lastActivityDate.toISOString(),
    };
  }

  if (recentPercentages.length >= 2) {
    const avgRecent = recentPercentages.reduce((sum, val) => sum + toNumber(val), 0) / recentPercentages.length;
    if (avgRecent < 40) {
      return {
        status: 'at_risk',
        reason: `Low recent test average (${roundTwo(avgRecent)}%)`,
        daysSinceLastActive,
        daysSinceLastLogin,
        lastActivityAt: lastActivityDate.toISOString(),
      };
    }
  }

  if (activeEnrollmentsCount > 0 && totalAttempts === 0 && daysSinceJoined > 7) {
    return {
      status: 'at_risk',
      reason: 'Enrolled in test series with no test attempts yet',
      daysSinceLastActive,
      daysSinceLastLogin,
      lastActivityAt: lastActivityDate.toISOString(),
    };
  }

  return {
    status: 'active',
    reason:
      daysSinceLastActive === 0
        ? 'Active today'
        : `Active ${daysSinceLastActive} day${daysSinceLastActive === 1 ? '' : 's'} ago`,
    daysSinceLastActive,
    daysSinceLastLogin,
    lastActivityAt: lastActivityDate.toISOString(),
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

async function fetchBaseUser(connection, userId) {
  const [rows] = await connection.query(
    `SELECT id, username, role, status, subscription_status, name, email, phone, last_login_at, last_active_at, created_at
     FROM users
     WHERE id = ?`,
    [userId]
  );
  return rows.length ? rows[0] : null;
}

async function getEngagementContext(connection, user) {
  const userId = user.id;

  const [[attemptAgg]] = await connection.query(
    `SELECT
       COUNT(*) AS totalAttempts,
       SUM(CASE WHEN status = 'COMPLETED' THEN 1 ELSE 0 END) AS completedAttempts,
       MAX(COALESCE(submitted_at, started_at)) AS latestAttemptAt
     FROM test_attempts
     WHERE user_id = ?`,
    [userId]
  );

  const [[enrollmentAgg]] = await connection.query(
    `SELECT
       SUM(CASE WHEN status = 'ACTIVE' AND (expires_at IS NULL OR expires_at > NOW()) THEN 1 ELSE 0 END) AS activeEnrollments,
       SUM(CASE WHEN enrollment_type = 'PAID' AND status = 'ACTIVE' AND (expires_at IS NULL OR expires_at > NOW()) THEN 1 ELSE 0 END) AS activePaidEnrollments
     FROM test_series_enrollments
     WHERE user_id = ?`,
    [userId]
  );

  const [[subscriptionAgg]] = await connection.query(
    `SELECT
       SUM(CASE WHEN status = 'ACTIVE' AND (expires_at IS NULL OR expires_at > NOW()) THEN 1 ELSE 0 END) AS activeSubscriptions,
       MAX(CASE WHEN status = 'ACTIVE' AND (expires_at IS NULL OR expires_at > NOW()) THEN plan_name ELSE NULL END) AS activePlanName
     FROM subscriptions
     WHERE user_id = ?`,
    [userId]
  );

  const [[paymentAgg]] = await connection.query(
    `SELECT
       SUM(CASE WHEN status = 'SUCCESS' THEN 1 ELSE 0 END) AS successfulPayments,
       COALESCE(SUM(CASE WHEN status = 'SUCCESS' THEN amount - refund_amount ELSE 0 END), 0) AS totalSpent
     FROM payments
     WHERE user_id = ?`,
    [userId]
  );

  const [[logAgg]] = await connection.query(
    `SELECT MAX(created_at) AS latestLogAt
     FROM user_activity_logs
     WHERE user_id = ?`,
    [userId]
  );

  const [recentAttemptRows] = await connection.query(
    `SELECT percentage
     FROM test_attempts
     WHERE user_id = ? AND status = 'COMPLETED'
     ORDER BY COALESCE(submitted_at, started_at) DESC, id DESC
     LIMIT 3`,
    [userId]
  );

  const totalAttempts = toNumber(attemptAgg.totalAttempts);
  const completedAttempts = toNumber(attemptAgg.completedAttempts);
  const activeEnrollments = toNumber(enrollmentAgg.activeEnrollments);
  const activePaidEnrollments = toNumber(enrollmentAgg.activePaidEnrollments);
  const activeSubscriptions = toNumber(subscriptionAgg.activeSubscriptions);
  const successfulPayments = toNumber(paymentAgg.successfulPayments);
  const totalSpent = roundTwo(paymentAgg.totalSpent);

  const isPremium = Boolean(
    user.subscription_status === 'active' ||
      activePaidEnrollments > 0 ||
      activeSubscriptions > 0
  );

  const engagement = computeEngagementStatus({
    userStatus: user.status,
    createdAt: user.created_at,
    lastLoginAt: user.last_login_at,
    lastActiveAt: user.last_active_at,
    latestAttemptAt: attemptAgg.latestAttemptAt,
    latestLogAt: logAgg.latestLogAt,
    recentPercentages: recentAttemptRows.map((r) => toNumber(r.percentage)),
    activeEnrollmentsCount: activeEnrollments,
    totalAttempts,
  });

  return {
    isPremium,
    planLabel: subscriptionAgg.activePlanName || (isPremium ? 'Premium' : 'Free'),
    engagement,
    quickStats: {
      totalAttempts,
      completedAttempts,
      activeEnrollments,
      activeSubscriptions,
      successfulPayments,
      totalSpent,
    },
  };
}

async function getStudentProfileDetails(userId, existingConnection = null) {
  return withConnection(existingConnection, async (connection) => {
    const user = await fetchBaseUser(connection, userId);
    if (!user) return null;

    const ctx = await getEngagementContext(connection, user);

    return {
      ...user,
      is_premium: ctx.isPremium,
      plan_label: ctx.planLabel,
      engagement_status: ctx.engagement.status,
      engagement: ctx.engagement,
      quick_stats: ctx.quickStats,
    };
  });
}

async function getStudentAnalytics(userId, existingConnection = null) {
  return withConnection(existingConnection, async (connection) => {
    const user = await fetchBaseUser(connection, userId);
    if (!user) return null;

    const ctx = await getEngagementContext(connection, user);

    const [[attemptStats]] = await connection.query(
      `SELECT
         COUNT(*) AS testsAttempted,
         SUM(CASE WHEN status = 'COMPLETED' THEN 1 ELSE 0 END) AS completedAttempts,
         SUM(CASE WHEN status != 'COMPLETED' THEN 1 ELSE 0 END) AS inProgressAttempts,
         COALESCE(SUM(CASE WHEN status = 'COMPLETED' THEN attempted_questions ELSE 0 END), 0) AS totalAttemptedQuestions,
         COALESCE(SUM(CASE WHEN status = 'COMPLETED' THEN correct_answers ELSE 0 END), 0) AS totalCorrect,
         COALESCE(SUM(CASE WHEN status = 'COMPLETED' THEN wrong_answers ELSE 0 END), 0) AS totalWrong,
         COALESCE(SUM(CASE WHEN status = 'COMPLETED' THEN skipped_questions ELSE 0 END), 0) AS totalSkipped,
         COALESCE(AVG(CASE WHEN status = 'COMPLETED' THEN percentage ELSE NULL END), 0) AS averageScorePercentage,
         COALESCE(MAX(CASE WHEN status = 'COMPLETED' THEN percentage ELSE NULL END), 0) AS bestScorePercentage,
         COALESCE(AVG(
           CASE
             WHEN status = 'COMPLETED' THEN
               CASE
                 WHEN time_taken_seconds > 0 THEN time_taken_seconds
                 WHEN submitted_at IS NOT NULL THEN GREATEST(TIMESTAMPDIFF(SECOND, started_at, submitted_at), 0)
                 ELSE NULL
               END
             ELSE NULL
           END
         ), 0) AS avgTestDurationSeconds
       FROM test_attempts
       WHERE user_id = ?`,
      [userId]
    );

    const [bestRows] = await connection.query(
      `SELECT
         ta.id AS attempt_id,
         ta.test_id,
         t.name AS test_name,
         ta.obtained_marks,
         ta.total_marks,
         ta.percentage,
         ta.submitted_at
       FROM test_attempts ta
       LEFT JOIN tests t ON ta.test_id = t.id
       WHERE ta.user_id = ? AND ta.status = 'COMPLETED'
       ORDER BY ta.percentage DESC, ta.obtained_marks DESC, ta.time_taken_seconds ASC
       LIMIT 1`,
      [userId]
    );

    const [subjectQuestionRows] = await connection.query(
      `SELECT
         COALESCE(NULLIF(TRIM(q.subject), ''), s.name, 'General') AS subjectName,
         COUNT(DISTINCT ta.id) AS attempts,
         COUNT(q.id) AS totalQuestions,
         SUM(CASE WHEN aa.id IS NOT NULL AND aa.selected_option_id IS NOT NULL THEN 1 ELSE 0 END) AS attempted,
         SUM(CASE WHEN aa.is_correct = 1 THEN 1 ELSE 0 END) AS correct,
         SUM(CASE WHEN aa.id IS NOT NULL AND aa.selected_option_id IS NOT NULL AND aa.is_correct = 0 THEN 1 ELSE 0 END) AS wrong,
         SUM(CASE WHEN aa.id IS NULL OR aa.selected_option_id IS NULL THEN 1 ELSE 0 END) AS skipped,
         COALESCE(SUM(COALESCE(aa.marks_obtained, 0)), 0) AS obtainedMarks,
         COALESCE(SUM(COALESCE(q.marks, 0)), 0) AS totalMarks
       FROM test_attempts ta
       JOIN questions q ON q.test_id = ta.test_id
       LEFT JOIN tests t ON ta.test_id = t.id
       LEFT JOIN subjects s ON t.subject_id = s.id
       LEFT JOIN attempt_answers aa ON aa.attempt_id = ta.id AND aa.question_id = q.id
       WHERE ta.user_id = ? AND ta.status = 'COMPLETED'
       GROUP BY subjectName`,
      [userId]
    );

    const [subjectFallbackRows] = await connection.query(
      `SELECT
         COALESCE(s.name, 'General') AS subjectName,
         COUNT(ta.id) AS attempts,
         COALESCE(SUM(ta.total_questions), 0) AS totalQuestions,
         COALESCE(SUM(ta.attempted_questions), 0) AS attempted,
         COALESCE(SUM(ta.correct_answers), 0) AS correct,
         COALESCE(SUM(ta.wrong_answers), 0) AS wrong,
         COALESCE(SUM(ta.skipped_questions), 0) AS skipped,
         COALESCE(SUM(ta.obtained_marks), 0) AS obtainedMarks,
         COALESCE(SUM(ta.total_marks), 0) AS totalMarks
       FROM test_attempts ta
       LEFT JOIN tests t ON ta.test_id = t.id
       LEFT JOIN subjects s ON t.subject_id = s.id
       WHERE ta.user_id = ?
         AND ta.status = 'COMPLETED'
         AND NOT EXISTS (SELECT 1 FROM questions q WHERE q.test_id = ta.test_id)
       GROUP BY subjectName`,
      [userId]
    );

    const subjectMap = new Map();
    for (const row of [...subjectQuestionRows, ...subjectFallbackRows]) {
      const key = row.subjectName || 'General';
      const existing = subjectMap.get(key) || {
        subject: key,
        attempts: 0,
        totalQuestions: 0,
        attempted: 0,
        correct: 0,
        wrong: 0,
        skipped: 0,
        obtainedMarks: 0,
        totalMarks: 0,
      };
      existing.attempts += toNumber(row.attempts);
      existing.totalQuestions += toNumber(row.totalQuestions);
      existing.attempted += toNumber(row.attempted);
      existing.correct += toNumber(row.correct);
      existing.wrong += toNumber(row.wrong);
      existing.skipped += toNumber(row.skipped);
      existing.obtainedMarks += toNumber(row.obtainedMarks);
      existing.totalMarks += toNumber(row.totalMarks);
      subjectMap.set(key, existing);
    }

    const subjectPerformance = Array.from(subjectMap.values())
      .map((entry) => ({
        subject: entry.subject,
        attempts: entry.attempts,
        totalQuestions: entry.totalQuestions,
        attempted: entry.attempted,
        correct: entry.correct,
        wrong: entry.wrong,
        skipped: entry.skipped,
        accuracy: entry.attempted > 0 ? roundTwo((entry.correct / entry.attempted) * 100) : 0,
        avgScore: entry.totalMarks > 0 ? roundTwo((entry.obtainedMarks / entry.totalMarks) * 100) : 0,
        obtainedMarks: roundTwo(entry.obtainedMarks),
        totalMarks: roundTwo(entry.totalMarks),
      }))
      .sort((a, b) => b.attempts - a.attempts || b.accuracy - a.accuracy);

    const [trendRows] = await connection.query(
      `SELECT
         ta.id AS attempt_id,
         ta.test_id,
         COALESCE(t.name, CONCAT('Test #', ta.test_id)) AS test_name,
         COALESCE(s.name, 'General') AS subject_name,
         COALESCE(ta.submitted_at, ta.started_at, ta.created_at) AS attempt_date,
         ta.obtained_marks,
         ta.total_marks,
         ta.percentage,
         ta.attempted_questions,
         ta.correct_answers,
         CASE
           WHEN ta.time_taken_seconds > 0 THEN ta.time_taken_seconds
           WHEN ta.submitted_at IS NOT NULL THEN GREATEST(TIMESTAMPDIFF(SECOND, ta.started_at, ta.submitted_at), 0)
           ELSE 0
         END AS duration_seconds
       FROM test_attempts ta
       LEFT JOIN tests t ON ta.test_id = t.id
       LEFT JOIN subjects s ON t.subject_id = s.id
       WHERE ta.user_id = ? AND ta.status = 'COMPLETED'
       ORDER BY attempt_date ASC, ta.id ASC`,
      [userId]
    );

    const scoreTrend = trendRows.map((row) => {
      const attempted = toNumber(row.attempted_questions);
      const correct = toNumber(row.correct_answers);
      return {
        attempt_id: row.attempt_id,
        test_id: row.test_id,
        test_name: row.test_name,
        subject_name: row.subject_name,
        date: row.attempt_date,
        obtained_marks: roundTwo(row.obtained_marks),
        total_marks: roundTwo(row.total_marks),
        percentage: roundTwo(row.percentage),
        accuracy: attempted > 0 ? roundTwo((correct / attempted) * 100) : 0,
        time_taken_seconds: toNumber(row.duration_seconds),
      };
    });

    const latestFive = scoreTrend.slice(-5);
    let improvementTracker = {
      latestFive,
      trendDirection: 'insufficient_data',
      deltaPercentage: 0,
      latestAverage: latestFive.length > 0 ? roundTwo(latestFive.reduce((s, a) => s + a.percentage, 0) / latestFive.length) : 0,
      previousAverage: null,
    };

    if (latestFive.length >= 2) {
      const splitIdx = Math.floor(latestFive.length / 2);
      const prevSlice = latestFive.slice(0, splitIdx);
      const recentSlice = latestFive.slice(splitIdx);
      const previousAverage = roundTwo(prevSlice.reduce((s, a) => s + a.percentage, 0) / prevSlice.length);
      const latestAverage = roundTwo(recentSlice.reduce((s, a) => s + a.percentage, 0) / recentSlice.length);
      const deltaPercentage = roundTwo(latestAverage - previousAverage);
      const trendDirection = deltaPercentage > 2 ? 'improving' : deltaPercentage < -2 ? 'declining' : 'stable';
      improvementTracker = {
        latestFive,
        trendDirection,
        deltaPercentage,
        latestAverage,
        previousAverage,
      };
    }

    const attemptedSubjects = subjectPerformance.filter((s) => s.attempted > 0);
    const weakSubjects = [...attemptedSubjects]
      .filter((s) => s.accuracy < 65)
      .sort((a, b) => a.accuracy - b.accuracy || a.avgScore - b.avgScore);

    const strongestSubject =
      attemptedSubjects.length > 0
        ? [...attemptedSubjects].sort((a, b) => b.accuracy - a.accuracy || b.avgScore - a.avgScore)[0]
        : null;

    const weakestSubject =
      attemptedSubjects.length > 0
        ? [...attemptedSubjects].sort((a, b) => a.accuracy - b.accuracy || a.avgScore - b.avgScore)[0]
        : null;

    const totalAttemptedQuestions = toNumber(attemptStats.totalAttemptedQuestions);
    const totalCorrect = toNumber(attemptStats.totalCorrect);
    const avgDurationSeconds = Math.round(toNumber(attemptStats.avgTestDurationSeconds));
    const bestRow = bestRows[0] || null;

    return {
      summary: {
        testsAttempted: toNumber(attemptStats.testsAttempted),
        completedAttempts: toNumber(attemptStats.completedAttempts),
        inProgressAttempts: toNumber(attemptStats.inProgressAttempts),
        averageAccuracy: totalAttemptedQuestions > 0 ? roundTwo((totalCorrect / totalAttemptedQuestions) * 100) : 0,
        averageScorePercentage: roundTwo(attemptStats.averageScorePercentage),
        bestScorePercentage: roundTwo(attemptStats.bestScorePercentage),
        bestScoreMarks: bestRow
          ? {
              attempt_id: bestRow.attempt_id,
              test_id: bestRow.test_id,
              test_name: bestRow.test_name || `Test #${bestRow.test_id}`,
              obtained_marks: roundTwo(bestRow.obtained_marks),
              total_marks: roundTwo(bestRow.total_marks),
              percentage: roundTwo(bestRow.percentage),
              submitted_at: bestRow.submitted_at,
            }
          : null,
        avgTestDurationSeconds: avgDurationSeconds,
        avgTestDurationMinutes: roundTwo(avgDurationSeconds / 60),
        totalAttemptedQuestions,
        totalCorrect,
        totalWrong: toNumber(attemptStats.totalWrong),
        totalSkipped: toNumber(attemptStats.totalSkipped),
      },
      subjectPerformance,
      scoreTrend,
      improvementTracker,
      weakSubjects,
      strongestSubject,
      weakestSubject,
      engagement: ctx.engagement,
    };
  });
}

async function getStudentTestHistory(userId, filters = {}, existingConnection = null) {
  return withConnection(existingConnection, async (connection) => {
    const user = await fetchBaseUser(connection, userId);
    if (!user) return null;

    const { page, limit, offset } = parsePagination(filters, 10, 100);
    const conditions = ['ta.user_id = ?'];
    const params = [userId];

    if (filters.status && String(filters.status).trim() && String(filters.status).toUpperCase() !== 'ALL') {
      conditions.push('UPPER(ta.status) = ?');
      params.push(String(filters.status).trim().toUpperCase());
    }

    if (filters.testSeriesId) {
      const seriesId = parsePositiveInt(filters.testSeriesId);
      if (seriesId) {
        conditions.push(
          '(ta.test_series_id = ? OR EXISTS (SELECT 1 FROM test_series_tests tst_f WHERE tst_f.test_id = ta.test_id AND tst_f.test_series_id = ?))'
        );
        params.push(seriesId, seriesId);
      }
    }

    if (filters.search && String(filters.search).trim()) {
      const like = `%${String(filters.search).trim()}%`;
      conditions.push('(t.name LIKE ? OR ts.title LIKE ? OR s.name LIKE ?)');
      params.push(like, like, like);
    }

    appendDateRange(conditions, params, 'COALESCE(ta.submitted_at, ta.started_at, ta.created_at)', filters.dateFrom, filters.dateTo);

    const whereSql = conditions.join(' AND ');

    const [[countRow]] = await connection.query(
      `SELECT COUNT(*) AS total
       FROM test_attempts ta
       LEFT JOIN tests t ON ta.test_id = t.id
       LEFT JOIN subjects s ON t.subject_id = s.id
       LEFT JOIN test_series ts ON ta.test_series_id = ts.id
       WHERE ${whereSql}`,
      params
    );

    const total = toNumber(countRow.total);

    const [rows] = await connection.query(
      `SELECT
         ta.id,
         ta.user_id,
         ta.test_id,
         COALESCE(t.name, CONCAT('Test #', ta.test_id)) AS test_name,
         COALESCE(
           ta.test_series_id,
           (SELECT tst2.test_series_id FROM test_series_tests tst2 WHERE tst2.test_id = ta.test_id ORDER BY tst2.display_order ASC, tst2.test_series_id ASC LIMIT 1)
         ) AS test_series_id,
         COALESCE(
           ts.title,
           (SELECT ts2.title FROM test_series_tests tst2 JOIN test_series ts2 ON tst2.test_series_id = ts2.id WHERE tst2.test_id = ta.test_id ORDER BY tst2.display_order ASC, tst2.test_series_id ASC LIMIT 1)
         ) AS test_series_title,
         COALESCE(s.name, 'General') AS subject_name,
         ta.total_questions,
         ta.attempted_questions,
         ta.correct_answers,
         ta.wrong_answers,
         ta.skipped_questions,
         COALESCE(ta.total_marks, t.total_marks, 0) AS total_marks,
         COALESCE(ta.obtained_marks, 0) AS obtained_marks,
         COALESCE(ta.percentage, 0) AS percentage,
         ta.rank,
         CASE
           WHEN ta.time_taken_seconds > 0 THEN ta.time_taken_seconds
           WHEN ta.submitted_at IS NOT NULL THEN GREATEST(TIMESTAMPDIFF(SECOND, ta.started_at, ta.submitted_at), 0)
           ELSE 0
         END AS time_taken_seconds,
         ta.status,
         ta.started_at,
         ta.submitted_at,
         ta.created_at
       FROM test_attempts ta
       LEFT JOIN tests t ON ta.test_id = t.id
       LEFT JOIN subjects s ON t.subject_id = s.id
       LEFT JOIN test_series ts ON ta.test_series_id = ts.id
       WHERE ${whereSql}
       ORDER BY COALESCE(ta.submitted_at, ta.started_at, ta.created_at) DESC, ta.id DESC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    const items = rows.map((row) => {
      const attempted = toNumber(row.attempted_questions);
      const correct = toNumber(row.correct_answers);
      const accuracy = attempted > 0 ? roundTwo((correct / attempted) * 100) : 0;
      const isCompleted = String(row.status || '').toUpperCase() === 'COMPLETED';
      return {
        id: row.id,
        attempt_id: row.id,
        user_id: row.user_id,
        test_id: row.test_id,
        test_name: row.test_name,
        test_series_id: row.test_series_id || null,
        test_series_title: row.test_series_title || null,
        subject_name: row.subject_name,
        total_questions: toNumber(row.total_questions),
        attempted_questions: attempted,
        correct_answers: correct,
        wrong_answers: toNumber(row.wrong_answers),
        skipped_questions: toNumber(row.skipped_questions),
        total_marks: roundTwo(row.total_marks),
        obtained_marks: isCompleted ? roundTwo(row.obtained_marks) : null,
        percentage: isCompleted ? roundTwo(row.percentage) : null,
        accuracy: isCompleted ? accuracy : null,
        rank: row.rank ?? null,
        time_taken_seconds: toNumber(row.time_taken_seconds),
        status: row.status || 'IN_PROGRESS',
        started_at: row.started_at,
        submitted_at: row.submitted_at,
        created_at: row.created_at,
      };
    });

    return {
      items,
      pagination: {
        page,
        limit,
        total,
        totalPages: total > 0 ? Math.ceil(total / limit) : 0,
      },
    };
  });
}

async function getStudentAttemptDetail(userId, attemptId, existingConnection = null) {
  return withConnection(existingConnection, async (connection) => {
    const [attemptRows] = await connection.query(
      `SELECT
         ta.*,
         COALESCE(t.name, CONCAT('Test #', ta.test_id)) AS test_name,
         t.duration_minutes,
         t.passing_marks,
         COALESCE(s.name, 'General') AS subject_name,
         COALESCE(
           ts.title,
           (SELECT ts2.title FROM test_series_tests tst2 JOIN test_series ts2 ON tst2.test_series_id = ts2.id WHERE tst2.test_id = ta.test_id ORDER BY tst2.display_order ASC, tst2.test_series_id ASC LIMIT 1)
         ) AS test_series_title
       FROM test_attempts ta
       LEFT JOIN tests t ON ta.test_id = t.id
       LEFT JOIN subjects s ON t.subject_id = s.id
       LEFT JOIN test_series ts ON ta.test_series_id = ts.id
       WHERE ta.id = ? AND ta.user_id = ?`,
      [attemptId, userId]
    );

    if (attemptRows.length === 0) return null;
    const attempt = attemptRows[0];

    const [questions] = await connection.query(
      `SELECT * FROM questions WHERE test_id = ? ORDER BY display_order ASC, id ASC`,
      [attempt.test_id]
    );

    let optionsByQuestion = {};
    if (questions.length > 0) {
      const [options] = await connection.query(
        `SELECT id, question_id, option_text, option_key, is_correct, display_order
         FROM question_options
         WHERE question_id IN (?)
         ORDER BY display_order ASC, id ASC`,
        [questions.map((q) => q.id)]
      );

      optionsByQuestion = options.reduce((acc, opt) => {
        if (!acc[opt.question_id]) acc[opt.question_id] = [];
        acc[opt.question_id].push({
          id: opt.id,
          option_key: opt.option_key || null,
          option_text: opt.option_text,
          is_correct: Boolean(opt.is_correct),
        });
        return acc;
      }, {});
    }

    const [answers] = await connection.query(
      `SELECT * FROM attempt_answers WHERE attempt_id = ?`,
      [attemptId]
    );

    const answersByQuestion = answers.reduce((acc, ans) => {
      acc[ans.question_id] = ans;
      return acc;
    }, {});

    const mappedQuestions = questions.map((q, index) => {
      const qOptions = optionsByQuestion[q.id] || [];
      const userAns = answersByQuestion[q.id] || null;
      const correctOpt = qOptions.find((o) => o.is_correct) || null;
      const selectedOpt = userAns?.selected_option_id
        ? qOptions.find((o) => o.id === userAns.selected_option_id) || null
        : null;

      const isSkipped = !userAns || userAns.selected_option_id === null || userAns.selected_option_id === undefined;
      const isCorrect = !isSkipped && Boolean(userAns.is_correct);
      const answerStatus = isSkipped ? 'skipped' : isCorrect ? 'correct' : 'wrong';

      return {
        question_id: q.id,
        question_number: index + 1,
        question_text: q.question_text,
        question_type: q.question_type || 'MCQ',
        subject: q.subject || attempt.subject_name || null,
        topic: q.topic || null,
        difficulty: q.difficulty || null,
        marks: roundTwo(q.marks),
        negative_marks: roundTwo(q.negative_marks),
        explanation: q.explanation || '',
        options: qOptions,
        selected_option_id: userAns?.selected_option_id ?? null,
        selected_option_key: selectedOpt?.option_key ?? null,
        selected_option_text: selectedOpt?.option_text ?? null,
        correct_option_id: correctOpt?.id ?? null,
        correct_option_key: correctOpt?.option_key ?? null,
        correct_option_text: correctOpt?.option_text ?? null,
        answer_status: answerStatus,
        is_correct: isCorrect,
        is_skipped: isSkipped,
        marks_obtained: userAns && userAns.marks_obtained !== null ? roundTwo(userAns.marks_obtained) : 0,
        answered_at: userAns?.answered_at ?? null,
        time_taken_seconds:
          userAns && userAns.time_taken_seconds !== undefined && userAns.time_taken_seconds !== null
            ? toNumber(userAns.time_taken_seconds)
            : null,
      };
    });

    const attemptedCount = toNumber(attempt.attempted_questions);
    const correctCount = toNumber(attempt.correct_answers);
    const durationSeconds =
      toNumber(attempt.time_taken_seconds) > 0
        ? toNumber(attempt.time_taken_seconds)
        : attempt.submitted_at && attempt.started_at
          ? Math.max(0, Math.floor((new Date(attempt.submitted_at) - new Date(attempt.started_at)) / 1000))
          : 0;

    return {
      summary: {
        id: attempt.id,
        attempt_id: attempt.id,
        user_id: attempt.user_id,
        test_id: attempt.test_id,
        test_name: attempt.test_name,
        test_series_id: attempt.test_series_id || null,
        test_series_title: attempt.test_series_title || null,
        subject_name: attempt.subject_name,
        duration_minutes: attempt.duration_minutes ?? null,
        passing_marks: attempt.passing_marks !== null && attempt.passing_marks !== undefined ? roundTwo(attempt.passing_marks) : null,
        status: attempt.status,
        started_at: attempt.started_at,
        submitted_at: attempt.submitted_at,
        time_taken_seconds: durationSeconds,
        total_questions: toNumber(attempt.total_questions || mappedQuestions.length),
        attempted_questions: attemptedCount,
        correct_answers: correctCount,
        wrong_answers: toNumber(attempt.wrong_answers),
        skipped_questions: toNumber(attempt.skipped_questions),
        total_marks: roundTwo(attempt.total_marks),
        obtained_marks: roundTwo(attempt.obtained_marks),
        percentage: roundTwo(attempt.percentage),
        accuracy: attemptedCount > 0 ? roundTwo((correctCount / attemptedCount) * 100) : 0,
        rank: attempt.rank ?? null,
      },
      questions: mappedQuestions,
    };
  });
}

async function getStudentTestSeries(userId, filters = {}, existingConnection = null) {
  return withConnection(existingConnection, async (connection) => {
    const user = await fetchBaseUser(connection, userId);
    if (!user) return null;

    const { page, limit, offset } = parsePagination(filters, 20, 100);
    const conditions = ['e.user_id = ?'];
    const params = [userId];

    if (filters.status && String(filters.status).trim() && String(filters.status).toUpperCase() !== 'ALL') {
      const upper = String(filters.status).trim().toUpperCase();
      if (upper === 'EXPIRED') {
        conditions.push("(e.status = 'EXPIRED' OR (e.status = 'ACTIVE' AND e.expires_at IS NOT NULL AND e.expires_at <= NOW()))");
      } else if (upper === 'ACTIVE') {
        conditions.push("(e.status = 'ACTIVE' AND (e.expires_at IS NULL OR e.expires_at > NOW()))");
      } else {
        conditions.push('e.status = ?');
        params.push(upper);
      }
    }

    if (filters.search && String(filters.search).trim()) {
      conditions.push('(ts.title LIKE ? OR c.name LIKE ?)');
      const like = `%${String(filters.search).trim()}%`;
      params.push(like, like);
    }

    const whereSql = conditions.join(' AND ');

    const [[summaryRow]] = await connection.query(
      `SELECT
         COUNT(*) AS total,
         SUM(CASE WHEN e.status = 'ACTIVE' AND (e.expires_at IS NULL OR e.expires_at > NOW()) THEN 1 ELSE 0 END) AS active,
         SUM(CASE WHEN e.status = 'EXPIRED' OR (e.status = 'ACTIVE' AND e.expires_at IS NOT NULL AND e.expires_at <= NOW()) THEN 1 ELSE 0 END) AS expired,
         SUM(CASE WHEN e.status = 'CANCELLED' THEN 1 ELSE 0 END) AS cancelled
       FROM test_series_enrollments e
       WHERE e.user_id = ?`,
      [userId]
    );

    const [[countRow]] = await connection.query(
      `SELECT COUNT(*) AS total
       FROM test_series_enrollments e
       JOIN test_series ts ON e.test_series_id = ts.id
       LEFT JOIN categories c ON ts.category_id = c.id
       WHERE ${whereSql}`,
      params
    );

    const total = toNumber(countRow.total);

    const [rows] = await connection.query(
      `SELECT
         e.id,
         e.user_id,
         e.test_series_id,
         e.payment_id,
         e.enrollment_type,
         e.status,
         e.enrolled_at,
         e.expires_at,
         e.created_at,
         e.updated_at,
         ts.title AS test_series_title,
         ts.description AS test_series_description,
         ts.price AS test_series_price,
         ts.is_paid,
         ts.validity_days,
         ts.difficulty_level,
         c.name AS category_name,
         p.order_id,
         p.transaction_id,
         p.amount AS paid_amount,
         p.status AS payment_status,
         p.paid_at,
         (SELECT COUNT(*) FROM test_series_tests tst WHERE tst.test_series_id = ts.id) AS total_tests,
         (
           SELECT COUNT(DISTINCT ta.test_id)
           FROM test_attempts ta
           WHERE ta.user_id = e.user_id
             AND ta.status = 'COMPLETED'
             AND (
               ta.test_series_id = ts.id
               OR EXISTS (
                 SELECT 1 FROM test_series_tests tst2
                 WHERE tst2.test_series_id = ts.id AND tst2.test_id = ta.test_id
               )
             )
         ) AS completed_tests
       FROM test_series_enrollments e
       JOIN test_series ts ON e.test_series_id = ts.id
       LEFT JOIN categories c ON ts.category_id = c.id
       LEFT JOIN payments p ON e.payment_id = p.id
       WHERE ${whereSql}
       ORDER BY e.enrolled_at DESC, e.id DESC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    const now = Date.now();
    const items = rows.map((row) => {
      const expiresTime = row.expires_at ? new Date(row.expires_at).getTime() : null;
      const isDateExpired = Boolean(expiresTime && expiresTime <= now);
      const effectiveStatus =
        row.status === 'ACTIVE' && isDateExpired ? 'EXPIRED' : row.status;
      return {
        id: row.id,
        user_id: row.user_id,
        test_series_id: row.test_series_id,
        test_series_title: row.test_series_title,
        test_series_description: row.test_series_description || null,
        category_name: row.category_name || null,
        difficulty_level: row.difficulty_level || null,
        test_series_price: roundTwo(row.test_series_price),
        is_paid: Boolean(row.is_paid),
        validity_days: row.validity_days ?? null,
        enrollment_type: row.enrollment_type,
        status: row.status,
        effective_status: effectiveStatus,
        is_expired: effectiveStatus === 'EXPIRED',
        enrolled_at: row.enrolled_at,
        purchase_date: row.paid_at || row.enrolled_at,
        expires_at: row.expires_at,
        payment_id: row.payment_id || null,
        order_id: row.order_id || null,
        transaction_id: row.transaction_id || null,
        paid_amount: row.paid_amount !== null && row.paid_amount !== undefined ? roundTwo(row.paid_amount) : null,
        payment_status: row.payment_status || null,
        total_tests: toNumber(row.total_tests),
        completed_tests: toNumber(row.completed_tests),
      };
    });

    return {
      items,
      summary: {
        total: toNumber(summaryRow.total),
        active: toNumber(summaryRow.active),
        expired: toNumber(summaryRow.expired),
        cancelled: toNumber(summaryRow.cancelled),
      },
      pagination: {
        page,
        limit,
        total,
        totalPages: total > 0 ? Math.ceil(total / limit) : 0,
      },
    };
  });
}

async function assignTestSeriesToStudent(userId, payload = {}) {
  let connection;
  try {
    connection = await createDbConnection();
    await connection.beginTransaction();

    const user = await fetchBaseUser(connection, userId);
    if (!user) {
      const err = new Error('User not found');
      err.status = 404;
      throw err;
    }

    const testSeriesId = parsePositiveInt(payload.test_series_id ?? payload.testSeriesId);
    if (!testSeriesId) {
      const err = new Error('Valid test_series_id is required');
      err.status = 400;
      throw err;
    }

    const [seriesRows] = await connection.query(
      'SELECT id, title, is_paid, validity_days FROM test_series WHERE id = ?',
      [testSeriesId]
    );
    if (seriesRows.length === 0) {
      const err = new Error('Test series not found');
      err.status = 404;
      throw err;
    }
    const series = seriesRows[0];

    const [activeExisting] = await connection.query(
      `SELECT id FROM test_series_enrollments
       WHERE user_id = ? AND test_series_id = ? AND status = 'ACTIVE'
         AND (expires_at IS NULL OR expires_at > NOW())`,
      [userId, testSeriesId]
    );
    if (activeExisting.length > 0) {
      const err = new Error('Student already has active access to this test series. Extend access instead.');
      err.status = 409;
      throw err;
    }

    const enrollmentType = payload.enrollment_type || (series.is_paid ? 'PAID' : 'FREE');
    if (!['FREE', 'PAID'].includes(enrollmentType)) {
      const err = new Error('enrollment_type must be FREE or PAID');
      err.status = 400;
      throw err;
    }

    const status = payload.status || 'ACTIVE';
    if (!['ACTIVE', 'EXPIRED', 'CANCELLED'].includes(status)) {
      const err = new Error('status must be ACTIVE, EXPIRED, or CANCELLED');
      err.status = 400;
      throw err;
    }

    let resolvedExpiresAt = payload.expires_at ?? payload.expiresAt ?? null;
    const customDays = parsePositiveInt(payload.validity_days ?? payload.validityDays);
    if (!resolvedExpiresAt && (customDays || series.validity_days)) {
      const days = customDays || Number(series.validity_days);
      const expiry = new Date();
      expiry.setDate(expiry.getDate() + days);
      resolvedExpiresAt = expiry;
    }

    const [insertRes] = await connection.query(
      `INSERT INTO test_series_enrollments
        (user_id, test_series_id, payment_id, enrollment_type, status, expires_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [userId, testSeriesId, payload.payment_id || null, enrollmentType, status, resolvedExpiresAt]
    );

    if (enrollmentType === 'PAID' && status === 'ACTIVE') {
      await connection.query(
        "UPDATE users SET subscription_status = 'active', last_active_at = NOW() WHERE id = ?",
        [userId]
      );
    }

    await connection.query(
      'INSERT INTO user_activity_logs (user_id, activity_type, reference_id, metadata) VALUES (?, ?, ?, ?)',
      [
        userId,
        'SERIES_ENROLL',
        testSeriesId,
        JSON.stringify({
          enrollmentId: insertRes.insertId,
          seriesTitle: series.title,
          enrollmentType,
          assignedByAdmin: true,
        }),
      ]
    );

    await connection.commit();

    const [createdRows] = await connection.query(
      `SELECT e.*, ts.title AS test_series_title
       FROM test_series_enrollments e
       JOIN test_series ts ON e.test_series_id = ts.id
       WHERE e.id = ?`,
      [insertRes.insertId]
    );
    return createdRows[0];
  } catch (err) {
    if (connection) await connection.rollback();
    throw err;
  } finally {
    if (connection) await connection.end();
  }
}

async function extendTestSeriesAccess(userId, enrollmentId, payload = {}) {
  let connection;
  try {
    connection = await createDbConnection();
    await connection.beginTransaction();

    const [existingRows] = await connection.query(
      `SELECT e.*, ts.title AS test_series_title
       FROM test_series_enrollments e
       JOIN test_series ts ON e.test_series_id = ts.id
       WHERE e.id = ? AND e.user_id = ?`,
      [enrollmentId, userId]
    );
    if (existingRows.length === 0) {
      await connection.rollback();
      return null;
    }
    const enrollment = existingRows[0];

    const extendDays = parsePositiveInt(payload.extend_days ?? payload.extendDays);
    const explicitExpiresAt = payload.expires_at ?? payload.expiresAt ?? null;
    const nextStatus = payload.status || 'ACTIVE';

    if (!['ACTIVE', 'EXPIRED', 'CANCELLED'].includes(nextStatus)) {
      const err = new Error('status must be ACTIVE, EXPIRED, or CANCELLED');
      err.status = 400;
      throw err;
    }

    if (!extendDays && !explicitExpiresAt) {
      const err = new Error('Either extend_days (positive integer) or expires_at is required');
      err.status = 400;
      throw err;
    }

    if (explicitExpiresAt) {
      const parsedDate = new Date(explicitExpiresAt);
      if (Number.isNaN(parsedDate.getTime())) {
        const err = new Error('Invalid expires_at date');
        err.status = 400;
        throw err;
      }
      await connection.query(
        'UPDATE test_series_enrollments SET expires_at = ?, status = ? WHERE id = ? AND user_id = ?',
        [parsedDate, nextStatus, enrollmentId, userId]
      );
    } else {
      await connection.query(
        `UPDATE test_series_enrollments
         SET expires_at = DATE_ADD(GREATEST(COALESCE(expires_at, NOW()), NOW()), INTERVAL ? DAY),
             status = ?
         WHERE id = ? AND user_id = ?`,
        [extendDays, nextStatus, enrollmentId, userId]
      );
    }

    if (enrollment.enrollment_type === 'PAID' && nextStatus === 'ACTIVE') {
      await connection.query(
        "UPDATE users SET subscription_status = 'active' WHERE id = ?",
        [userId]
      );
    }

    const [updatedRows] = await connection.query(
      `SELECT e.*, ts.title AS test_series_title
       FROM test_series_enrollments e
       JOIN test_series ts ON e.test_series_id = ts.id
       WHERE e.id = ?`,
      [enrollmentId]
    );
    const updated = updatedRows[0];

    await connection.query(
      'INSERT INTO user_activity_logs (user_id, activity_type, reference_id, metadata) VALUES (?, ?, ?, ?)',
      [
        userId,
        'SERIES_ACCESS_EXTENDED',
        enrollment.test_series_id,
        JSON.stringify({
          enrollmentId: Number(enrollmentId),
          seriesTitle: enrollment.test_series_title,
          extendDays: extendDays || null,
          expiresAt: updated.expires_at,
        }),
      ]
    );

    await connection.commit();
    return updated;
  } catch (err) {
    if (connection) await connection.rollback();
    throw err;
  } finally {
    if (connection) await connection.end();
  }
}

async function updateStudentEnrollmentStatus(userId, enrollmentId, status) {
  let connection;
  try {
    connection = await createDbConnection();
    await connection.beginTransaction();

    const [rows] = await connection.query(
      `SELECT e.*, ts.title AS test_series_title
       FROM test_series_enrollments e
       JOIN test_series ts ON e.test_series_id = ts.id
       WHERE e.id = ? AND e.user_id = ?`,
      [enrollmentId, userId]
    );
    if (rows.length === 0) {
      await connection.rollback();
      return null;
    }

    await connection.query(
      'UPDATE test_series_enrollments SET status = ? WHERE id = ? AND user_id = ?',
      [status, enrollmentId, userId]
    );

    await connection.query(
      'INSERT INTO user_activity_logs (user_id, activity_type, reference_id, metadata) VALUES (?, ?, ?, ?)',
      [
        userId,
        'SERIES_STATUS_UPDATED',
        rows[0].test_series_id,
        JSON.stringify({
          enrollmentId: Number(enrollmentId),
          seriesTitle: rows[0].test_series_title,
          status,
        }),
      ]
    );

    await connection.commit();
    return { ...rows[0], status };
  } catch (err) {
    if (connection) await connection.rollback();
    throw err;
  } finally {
    if (connection) await connection.end();
  }
}

async function getStudentPayments(userId, filters = {}, existingConnection = null) {
  return withConnection(existingConnection, async (connection) => {
    const user = await fetchBaseUser(connection, userId);
    if (!user) return null;

    const { page, limit, offset } = parsePagination(filters, 10, 100);
    const conditions = ['p.user_id = ?'];
    const params = [userId];

    if (filters.status && String(filters.status).trim() && String(filters.status).toUpperCase() !== 'ALL') {
      conditions.push('UPPER(p.status) = ?');
      params.push(String(filters.status).trim().toUpperCase());
    }

    if (filters.search && String(filters.search).trim()) {
      const like = `%${String(filters.search).trim()}%`;
      conditions.push('(p.order_id LIKE ? OR p.transaction_id LIKE ? OR ts.title LIKE ? OR sub.plan_name LIKE ?)');
      params.push(like, like, like, like);
    }

    appendDateRange(conditions, params, 'COALESCE(p.paid_at, p.created_at)', filters.dateFrom, filters.dateTo);

    const whereSql = conditions.join(' AND ');

    const [[summaryRow]] = await connection.query(
      `SELECT
         COUNT(*) AS totalTransactions,
         SUM(CASE WHEN status = 'SUCCESS' THEN 1 ELSE 0 END) AS successfulTransactions,
         SUM(CASE WHEN status = 'PENDING' THEN 1 ELSE 0 END) AS pendingTransactions,
         SUM(CASE WHEN status = 'FAILED' THEN 1 ELSE 0 END) AS failedTransactions,
         SUM(CASE WHEN status = 'REFUNDED' THEN 1 ELSE 0 END) AS refundedTransactions,
         COALESCE(SUM(CASE WHEN status = 'SUCCESS' THEN amount ELSE 0 END), 0) AS totalPaidAmount,
         COALESCE(SUM(CASE WHEN status = 'REFUNDED' THEN (CASE WHEN refund_amount > 0 THEN refund_amount ELSE amount END) ELSE refund_amount END), 0) AS totalRefundedAmount,
         COALESCE(SUM(CASE WHEN status = 'SUCCESS' THEN amount - refund_amount ELSE 0 END), 0) AS netPaidAmount
       FROM payments
       WHERE user_id = ?`,
      [userId]
    );

    const [[countRow]] = await connection.query(
      `SELECT COUNT(*) AS total
       FROM payments p
       LEFT JOIN test_series ts ON p.test_series_id = ts.id
       LEFT JOIN subscriptions sub ON p.subscription_id = sub.id
       WHERE ${whereSql}`,
      params
    );

    const total = toNumber(countRow.total);

    const [rows] = await connection.query(
      `SELECT
         p.id,
         p.user_id,
         p.test_series_id,
         p.subscription_id,
         p.order_id,
         p.transaction_id,
         p.amount,
         p.currency,
         p.payment_method,
         p.payment_gateway,
         p.status,
         p.refund_amount,
         p.refund_reason,
         p.paid_at,
         p.refunded_at,
         p.notes,
         p.created_at,
         p.updated_at,
         ts.title AS test_series_title,
         sub.plan_name
       FROM payments p
       LEFT JOIN test_series ts ON p.test_series_id = ts.id
       LEFT JOIN subscriptions sub ON p.subscription_id = sub.id
       WHERE ${whereSql}
       ORDER BY COALESCE(p.paid_at, p.created_at) DESC, p.id DESC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    const items = rows.map((row) => ({
      ...row,
      amount: roundTwo(row.amount),
      refund_amount: roundTwo(row.refund_amount),
    }));

    return {
      items,
      summary: {
        totalTransactions: toNumber(summaryRow.totalTransactions),
        successfulTransactions: toNumber(summaryRow.successfulTransactions),
        pendingTransactions: toNumber(summaryRow.pendingTransactions),
        failedTransactions: toNumber(summaryRow.failedTransactions),
        refundedTransactions: toNumber(summaryRow.refundedTransactions),
        totalPaidAmount: roundTwo(summaryRow.totalPaidAmount),
        totalRefundedAmount: roundTwo(summaryRow.totalRefundedAmount),
        netPaidAmount: roundTwo(summaryRow.netPaidAmount),
        currency: 'INR',
      },
      pagination: {
        page,
        limit,
        total,
        totalPages: total > 0 ? Math.ceil(total / limit) : 0,
      },
    };
  });
}

async function getStudentPaymentDetail(userId, paymentId, existingConnection = null) {
  return withConnection(existingConnection, async (connection) => {
    const [rows] = await connection.query(
      `SELECT
         p.id,
         p.user_id,
         p.test_series_id,
         p.subscription_id,
         p.order_id,
         p.transaction_id,
         p.amount,
         p.currency,
         p.payment_method,
         p.payment_gateway,
         p.status,
         p.refund_amount,
         p.refund_reason,
         p.paid_at,
         p.refunded_at,
         p.notes,
         p.created_at,
         p.updated_at,
         ts.title AS test_series_title,
         sub.plan_name,
         u.name AS user_name,
         u.email AS user_email
       FROM payments p
       JOIN users u ON p.user_id = u.id
       LEFT JOIN test_series ts ON p.test_series_id = ts.id
       LEFT JOIN subscriptions sub ON p.subscription_id = sub.id
       WHERE p.id = ? AND p.user_id = ?`,
      [paymentId, userId]
    );
    if (rows.length === 0) return null;
    const p = rows[0];
    return {
      ...p,
      amount: roundTwo(p.amount),
      refund_amount: roundTwo(p.refund_amount),
    };
  });
}

function buildActivityDescription(row, metadata, targetTitle) {
  switch (row.activity_type) {
    case 'LOGIN':
      return 'Student logged in';
    case 'TEST_START':
      return targetTitle ? `Started test: ${targetTitle}` : row.reference_id ? `Started Test #${row.reference_id}` : 'Started a test';
    case 'TEST_SUBMIT':
      return targetTitle ? `Submitted test: ${targetTitle}` : row.reference_id ? `Submitted Attempt #${row.reference_id}` : 'Submitted a test';
    case 'SERIES_ENROLL':
      return targetTitle
        ? `Enrolled in test series: ${targetTitle}`
        : metadata?.seriesTitle
          ? `Enrolled in test series: ${metadata.seriesTitle}`
          : 'Enrolled in test series';
    case 'SERIES_ACCESS_EXTENDED':
      return metadata?.seriesTitle
        ? `Access extended for ${metadata.seriesTitle}${metadata.extendDays ? ` (+${metadata.extendDays} days)` : ''}`
        : 'Test series access extended';
    case 'SERIES_STATUS_UPDATED':
      return metadata?.seriesTitle
        ? `${metadata.seriesTitle} enrollment set to ${metadata.status || 'updated'}`
        : `Enrollment status updated to ${metadata?.status || 'updated'}`;
    case 'STATUS_CHANGED':
      return `Account status updated to ${metadata?.status || 'updated'}`;
    case 'PROFILE_UPDATED':
      return 'Student profile details updated by admin';
    case 'PASSWORD_RESET':
      return 'Account password reset by admin';
    case 'SUBSCRIPTION_UPDATED':
      return `Subscription status updated to ${metadata?.status || 'updated'}`;
    default:
      return row.activity_type;
  }
}

async function getStudentActivity(userId, filters = {}, existingConnection = null) {
  return withConnection(existingConnection, async (connection) => {
    const user = await fetchBaseUser(connection, userId);
    if (!user) return null;

    const { page, limit, offset } = parsePagination(filters, 20, 100);
    const conditions = ['ual.user_id = ?'];
    const params = [userId];

    if (filters.type && String(filters.type).trim() && String(filters.type).toUpperCase() !== 'ALL') {
      conditions.push('UPPER(ual.activity_type) = ?');
      params.push(String(filters.type).trim().toUpperCase());
    }

    appendDateRange(conditions, params, 'ual.created_at', filters.dateFrom, filters.dateTo);

    const whereSql = conditions.join(' AND ');

    const [[countRow]] = await connection.query(
      `SELECT COUNT(*) AS total
       FROM user_activity_logs ual
       WHERE ${whereSql}`,
      params
    );

    const total = toNumber(countRow.total);

    const [logRows] = await connection.query(
      `SELECT
         ual.id,
         ual.user_id,
         ual.activity_type,
         ual.reference_id,
         ual.metadata,
         ual.created_at,
         t_start.name AS start_test_name,
         t_sub.name AS submit_test_name,
         ts.title AS series_title
       FROM user_activity_logs ual
       LEFT JOIN tests t_start
         ON ual.activity_type = 'TEST_START' AND ual.reference_id = t_start.id
       LEFT JOIN test_attempts ta_sub
         ON ual.activity_type = 'TEST_SUBMIT' AND ual.reference_id = ta_sub.id
       LEFT JOIN tests t_sub
         ON ta_sub.test_id = t_sub.id
       LEFT JOIN test_series ts
         ON ual.activity_type IN ('SERIES_ENROLL', 'SERIES_ACCESS_EXTENDED', 'SERIES_STATUS_UPDATED')
        AND ual.reference_id = ts.id
       WHERE ${whereSql}
       ORDER BY ual.created_at DESC, ual.id DESC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    const logs = logRows.map((row) => {
      const metadata = parseMetadata(row.metadata);
      const targetTitle = row.start_test_name || row.submit_test_name || row.series_title || null;
      return {
        id: row.id,
        user_id: row.user_id,
        activity_type: row.activity_type,
        reference_id: row.reference_id ?? null,
        target_title: targetTitle,
        metadata,
        description: buildActivityDescription(row, metadata, targetTitle),
        created_at: row.created_at,
      };
    });

    const [loginRows] = await connection.query(
      `SELECT id, created_at, metadata
       FROM user_activity_logs
       WHERE user_id = ? AND activity_type = 'LOGIN'
       ORDER BY created_at DESC, id DESC
       LIMIT 20`,
      [userId]
    );

    const [[firstLoginRow]] = await connection.query(
      `SELECT MIN(created_at) AS first_login_at
       FROM user_activity_logs
       WHERE user_id = ? AND activity_type = 'LOGIN'`,
      [userId]
    );

    const [firstPurchaseRows] = await connection.query(
      `SELECT
         p.id,
         p.order_id,
         p.amount,
         p.currency,
         COALESCE(p.paid_at, p.created_at) AS purchased_at,
         ts.title AS test_series_title
       FROM payments p
       LEFT JOIN test_series ts ON p.test_series_id = ts.id
       WHERE p.user_id = ? AND p.status = 'SUCCESS'
       ORDER BY COALESCE(p.paid_at, p.created_at) ASC, p.id ASC
       LIMIT 1`,
      [userId]
    );

    const [firstAttemptRows] = await connection.query(
      `SELECT
         ta.id,
         ta.test_id,
         ta.started_at,
         COALESCE(t.name, CONCAT('Test #', ta.test_id)) AS test_name
       FROM test_attempts ta
       LEFT JOIN tests t ON ta.test_id = t.id
       WHERE ta.user_id = ?
       ORDER BY ta.started_at ASC, ta.id ASC
       LIMIT 1`,
      [userId]
    );

    const [[latestLogRow]] = await connection.query(
      `SELECT activity_type, created_at
       FROM user_activity_logs
       WHERE user_id = ?
       ORDER BY created_at DESC, id DESC
       LIMIT 1`,
      [userId]
    );

    const [[latestAttemptRow]] = await connection.query(
      `SELECT ta.id, COALESCE(ta.submitted_at, ta.started_at) AS activity_at, t.name AS test_name
       FROM test_attempts ta
       LEFT JOIN tests t ON ta.test_id = t.id
       WHERE ta.user_id = ?
       ORDER BY COALESCE(ta.submitted_at, ta.started_at) DESC, ta.id DESC
       LIMIT 1`,
      [userId]
    );

    const firstLoginAt = firstLoginRow?.first_login_at || user.last_login_at || null;
    const firstPurchase = firstPurchaseRows[0] || null;
    const firstTest = firstAttemptRows[0] || null;

    const latestActivityDate = maxDate([
      user.last_active_at,
      user.last_login_at,
      latestLogRow?.created_at,
      latestAttemptRow?.activity_at,
      firstPurchase?.purchased_at,
    ]);

    let latestDetail = null;
    if (latestLogRow) {
      latestDetail = latestLogRow.activity_type;
    } else if (latestAttemptRow) {
      latestDetail = latestAttemptRow.test_name || `Attempt #${latestAttemptRow.id}`;
    }

    const timeline = [
      {
        key: 'registration',
        label: 'Registration',
        completed: Boolean(user.created_at),
        timestamp: user.created_at || null,
        detail: `Joined as @${user.username}`,
      },
      {
        key: 'first_login',
        label: 'First Login',
        completed: Boolean(firstLoginAt),
        timestamp: firstLoginAt,
        detail: firstLoginAt ? 'First recorded login' : 'No login recorded yet',
      },
      {
        key: 'first_purchase',
        label: 'First Purchase',
        completed: Boolean(firstPurchase),
        timestamp: firstPurchase ? firstPurchase.purchased_at : null,
        detail: firstPurchase
          ? `${firstPurchase.test_series_title || firstPurchase.order_id || `Payment #${firstPurchase.id}`} (${firstPurchase.currency || 'INR'} ${roundTwo(firstPurchase.amount)})`
          : 'No successful purchase yet',
      },
      {
        key: 'first_test',
        label: 'First Test',
        completed: Boolean(firstTest),
        timestamp: firstTest ? firstTest.started_at : null,
        detail: firstTest ? firstTest.test_name : 'No test attempted yet',
      },
      {
        key: 'latest_activity',
        label: 'Latest Activity',
        completed: Boolean(latestActivityDate),
        timestamp: latestActivityDate ? latestActivityDate.toISOString() : null,
        detail: latestDetail || (latestActivityDate ? 'Account activity recorded' : 'No activity yet'),
      },
    ];

    return {
      profile: user,
      timeline,
      logs,
      logins: loginRows.map((l) => ({
        id: l.id,
        created_at: l.created_at,
        metadata: parseMetadata(l.metadata),
      })),
      summary: {
        totalLogs: total,
        lastLoginAt: user.last_login_at,
        lastActiveAt: user.last_active_at,
        loginCount: loginRows.length,
      },
      pagination: {
        page,
        limit,
        total,
        totalPages: total > 0 ? Math.ceil(total / limit) : 0,
      },
    };
  });
}

async function getStudentReport(userId) {
  let connection;
  try {
    connection = await createDbConnection();
    const profile = await getStudentProfileDetails(userId, connection);
    if (!profile) return null;

    const analytics = await getStudentAnalytics(userId, connection);
    const testHistory = await getStudentTestHistory(userId, { page: 1, limit: 100 }, connection);
    const testSeries = await getStudentTestSeries(userId, { page: 1, limit: 100 }, connection);
    const payments = await getStudentPayments(userId, { page: 1, limit: 100 }, connection);
    const activity = await getStudentActivity(userId, { page: 1, limit: 50 }, connection);

    return {
      generatedAt: new Date().toISOString(),
      profile,
      analytics,
      testHistory: testHistory.items,
      testSeries: testSeries.items,
      paymentSummary: payments.summary,
      payments: payments.items,
      timeline: activity.timeline,
    };
  } finally {
    if (connection) await connection.end();
  }
}

function escapeCsvCell(val) {
  if (val === null || val === undefined) return '';
  const str = String(val);
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function formatStudentReportCsv(report) {
  const lines = [];
  const pushRow = (cols) => lines.push(cols.map(escapeCsvCell).join(','));

  pushRow(['Student Performance & Account Report']);
  pushRow(['Generated At', report.generatedAt]);
  pushRow([]);

  pushRow(['Profile']);
  pushRow(['Student ID', 'Name', 'Username', 'Email', 'Phone', 'Account Status', 'Plan', 'Engagement', 'Joined On', 'Last Login', 'Last Active']);
  pushRow([
    report.profile.id,
    report.profile.name || '',
    report.profile.username,
    report.profile.email || '',
    report.profile.phone || '',
    report.profile.status,
    report.profile.plan_label,
    report.profile.engagement?.status || '',
    report.profile.created_at || '',
    report.profile.last_login_at || '',
    report.profile.last_active_at || '',
  ]);
  pushRow([]);

  pushRow(['Performance Summary']);
  const s = report.analytics.summary;
  pushRow(['Tests Attempted', 'Completed', 'Average Accuracy (%)', 'Average Score (%)', 'Best Score (%)', 'Avg Duration (sec)']);
  pushRow([s.testsAttempted, s.completedAttempts, s.averageAccuracy, s.averageScorePercentage, s.bestScorePercentage, s.avgTestDurationSeconds]);
  pushRow([]);

  pushRow(['Subject Performance']);
  pushRow(['Subject', 'Attempts', 'Correct', 'Wrong', 'Skipped', 'Accuracy (%)', 'Avg Score (%)']);
  for (const subj of report.analytics.subjectPerformance) {
    pushRow([subj.subject, subj.attempts, subj.correct, subj.wrong, subj.skipped, subj.accuracy, subj.avgScore]);
  }
  pushRow([]);

  pushRow(['Test History']);
  pushRow(['Attempt ID', 'Test Name', 'Series', 'Score', 'Percentage (%)', 'Accuracy (%)', 'Time Taken (sec)', 'Status', 'Date']);
  for (const item of report.testHistory) {
    pushRow([
      item.id,
      item.test_name,
      item.test_series_title || '',
      item.obtained_marks !== null ? `${item.obtained_marks}/${item.total_marks}` : '',
      item.percentage ?? '',
      item.accuracy ?? '',
      item.time_taken_seconds,
      item.status,
      item.submitted_at || item.started_at || '',
    ]);
  }
  pushRow([]);

  pushRow(['Enrolled Test Series']);
  pushRow(['Enrollment ID', 'Series Title', 'Type', 'Access Status', 'Enrolled At', 'Expires At']);
  for (const enr of report.testSeries) {
    pushRow([enr.id, enr.test_series_title, enr.enrollment_type, enr.effective_status, enr.enrolled_at, enr.expires_at || 'Lifetime']);
  }
  pushRow([]);

  pushRow(['Payment Summary']);
  pushRow(['Total Transactions', 'Successful', 'Total Paid (INR)', 'Total Refunded (INR)', 'Net Paid (INR)']);
  pushRow([
    report.paymentSummary.totalTransactions,
    report.paymentSummary.successfulTransactions,
    report.paymentSummary.totalPaidAmount,
    report.paymentSummary.totalRefundedAmount,
    report.paymentSummary.netPaidAmount,
  ]);
  pushRow([]);

  pushRow(['Payments']);
  pushRow(['Payment ID', 'Order ID', 'Transaction ID', 'Series/Plan', 'Amount', 'Method', 'Status', 'Date']);
  for (const p of report.payments) {
    pushRow([
      p.id,
      p.order_id || '',
      p.transaction_id || '',
      p.test_series_title || p.plan_name || '',
      `${p.currency || 'INR'} ${p.amount}`,
      p.payment_method || '',
      p.status,
      p.paid_at || p.created_at || '',
    ]);
  }

  return lines.join('\n');
}

module.exports = {
  parsePositiveInt,
  getStudentProfileDetails,
  getStudentAnalytics,
  getStudentTestHistory,
  getStudentAttemptDetail,
  getStudentTestSeries,
  assignTestSeriesToStudent,
  extendTestSeriesAccess,
  updateStudentEnrollmentStatus,
  getStudentPayments,
  getStudentPaymentDetail,
  getStudentActivity,
  getStudentReport,
  formatStudentReportCsv,
  // exported for unit testing
  computeEngagementStatus,
  parsePagination,
};
