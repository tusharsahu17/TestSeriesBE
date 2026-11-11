const { createDbConnection } = require('../config/db');

const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const SHORT_DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function toNumber(val, fallback = 0) {
  const num = Number(val);
  return Number.isFinite(num) ? num : fallback;
}

function roundTwo(val) {
  return Math.round((toNumber(val) + Number.EPSILON) * 100) / 100;
}

function calculateCumulativeGrowth(total, addedThisMonth) {
  const previousTotal = total - addedThisMonth;
  if (previousTotal > 0) {
    return roundTwo((addedThisMonth / previousTotal) * 100);
  }
  return addedThisMonth > 0 ? 100 : 0;
}

function calculateMomGrowth(currentValue, previousValue) {
  if (previousValue > 0) {
    return roundTwo(((currentValue - previousValue) / previousValue) * 100);
  }
  return currentValue > 0 ? 100 : 0;
}

function formatDateYMD(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatMonthYM(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

function clampInt(value, defaultVal, minVal, maxVal) {
  const parsed = parseInt(value, 10);
  if (!Number.isFinite(parsed)) return defaultVal;
  return Math.min(Math.max(parsed, minVal), maxVal);
}

/**
 * Helper to execute a callback with either a provided DB connection or a fresh one.
 */
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

/**
 * Section 1: Overview Statistics (Top Cards)
 */
async function getOverviewStats(existingConnection = null) {
  return withConnection(existingConnection, async (connection) => {
    const [[studentStats]] = await connection.query(`
      SELECT
        COUNT(*) AS totalStudents,
        SUM(CASE WHEN YEAR(created_at) = YEAR(CURDATE()) AND MONTH(created_at) = MONTH(CURDATE()) THEN 1 ELSE 0 END) AS addedThisMonth,
        SUM(CASE WHEN YEAR(created_at) = YEAR(DATE_SUB(CURDATE(), INTERVAL 1 MONTH)) AND MONTH(created_at) = MONTH(DATE_SUB(CURDATE(), INTERVAL 1 MONTH)) THEN 1 ELSE 0 END) AS addedLastMonth,
        SUM(CASE WHEN status = 'active' AND (
          last_active_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
          OR last_login_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
          OR EXISTS (SELECT 1 FROM test_attempts ta WHERE ta.user_id = users.id AND (ta.started_at >= DATE_SUB(NOW(), INTERVAL 30 DAY) OR ta.submitted_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)))
          OR EXISTS (SELECT 1 FROM user_activity_logs ual WHERE ual.user_id = users.id AND ual.created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY))
        ) THEN 1 ELSE 0 END) AS activeStudentsLast30Days
      FROM users
      WHERE role = 'student'
    `);

    const [[seriesStats]] = await connection.query(`
      SELECT
        COUNT(*) AS totalTestSeries,
        SUM(CASE WHEN YEAR(created_at) = YEAR(CURDATE()) AND MONTH(created_at) = MONTH(CURDATE()) THEN 1 ELSE 0 END) AS addedThisMonth,
        SUM(CASE WHEN is_published = 1 THEN 1 ELSE 0 END) AS publishedCount
      FROM test_series
      WHERE is_archived = 0
    `);

    const [[testStats]] = await connection.query(`
      SELECT
        COUNT(*) AS totalTests,
        SUM(CASE WHEN is_published = 1 AND (start_time IS NULL OR start_time <= NOW()) THEN 1 ELSE 0 END) AS publishedTests,
        SUM(CASE WHEN is_published = 0 AND (start_time IS NULL OR start_time <= NOW()) THEN 1 ELSE 0 END) AS draftTests,
        SUM(CASE WHEN start_time IS NOT NULL AND start_time > NOW() THEN 1 ELSE 0 END) AS scheduledTests
      FROM tests
    `);

    const [[questionStats]] = await connection.query(`
      SELECT COUNT(*) AS totalQuestions FROM questions
    `);

    const [[attemptStats]] = await connection.query(`
      SELECT
        COUNT(*) AS totalAttempts,
        SUM(CASE WHEN YEAR(started_at) = YEAR(CURDATE()) AND MONTH(started_at) = MONTH(CURDATE()) THEN 1 ELSE 0 END) AS thisMonth,
        SUM(CASE WHEN YEAR(started_at) = YEAR(DATE_SUB(CURDATE(), INTERVAL 1 MONTH)) AND MONTH(started_at) = MONTH(DATE_SUB(CURDATE(), INTERVAL 1 MONTH)) THEN 1 ELSE 0 END) AS lastMonth
      FROM test_attempts
    `);

    const [[revenueStats]] = await connection.query(`
      SELECT
        COALESCE(SUM(CASE WHEN status = 'SUCCESS' THEN amount - refund_amount ELSE 0 END), 0) AS totalRevenue,
        COALESCE(SUM(CASE WHEN status = 'SUCCESS' AND YEAR(COALESCE(paid_at, created_at)) = YEAR(CURDATE()) AND MONTH(COALESCE(paid_at, created_at)) = MONTH(CURDATE()) THEN amount - refund_amount ELSE 0 END), 0) AS thisMonthRevenue,
        COALESCE(SUM(CASE WHEN status = 'SUCCESS' AND YEAR(COALESCE(paid_at, created_at)) = YEAR(DATE_SUB(CURDATE(), INTERVAL 1 MONTH)) AND MONTH(COALESCE(paid_at, created_at)) = MONTH(DATE_SUB(CURDATE(), INTERVAL 1 MONTH)) THEN amount - refund_amount ELSE 0 END), 0) AS lastMonthRevenue
      FROM payments
    `);

    const totalStudents = toNumber(studentStats.totalStudents);
    const studentsAddedThisMonth = toNumber(studentStats.addedThisMonth);
    const studentsAddedLastMonth = toNumber(studentStats.addedLastMonth);

    const totalAttempts = toNumber(attemptStats.totalAttempts);
    const attemptsThisMonth = toNumber(attemptStats.thisMonth);
    const attemptsLastMonth = toNumber(attemptStats.lastMonth);

    const totalRevenue = roundTwo(revenueStats.totalRevenue);
    const revenueThisMonth = roundTwo(revenueStats.thisMonthRevenue);
    const revenueLastMonth = roundTwo(revenueStats.lastMonthRevenue);

    return {
      totalStudents: {
        count: totalStudents,
        addedThisMonth: studentsAddedThisMonth,
        previousMonthAdded: studentsAddedLastMonth,
        growthPercentage: calculateCumulativeGrowth(totalStudents, studentsAddedThisMonth),
        momGrowthPercentage: calculateMomGrowth(studentsAddedThisMonth, studentsAddedLastMonth)
      },
      totalTestSeries: {
        count: toNumber(seriesStats.totalTestSeries),
        addedThisMonth: toNumber(seriesStats.addedThisMonth),
        publishedCount: toNumber(seriesStats.publishedCount)
      },
      totalTests: {
        count: toNumber(testStats.totalTests),
        publishedCount: toNumber(testStats.publishedTests),
        draftCount: toNumber(testStats.draftTests),
        scheduledCount: toNumber(testStats.scheduledTests)
      },
      totalQuestions: {
        count: toNumber(questionStats.totalQuestions)
      },
      totalTestAttempts: {
        count: totalAttempts,
        thisMonth: attemptsThisMonth,
        lastMonth: attemptsLastMonth,
        growthPercentage: calculateCumulativeGrowth(totalAttempts, attemptsThisMonth),
        momGrowthPercentage: calculateMomGrowth(attemptsThisMonth, attemptsLastMonth)
      },
      activeStudents: {
        count: toNumber(studentStats.activeStudentsLast30Days),
        periodDays: 30
      },
      totalRevenue: {
        amount: totalRevenue,
        thisMonthAmount: revenueThisMonth,
        lastMonthAmount: revenueLastMonth,
        growthPercentage: calculateCumulativeGrowth(totalRevenue, revenueThisMonth),
        momGrowthPercentage: calculateMomGrowth(revenueThisMonth, revenueLastMonth),
        currency: 'INR'
      }
    };
  });
}

/**
 * Section 2: Student Analytics & Registration Growth Chart
 */
async function getStudentAnalytics(options = {}, existingConnection = null) {
  const days = clampInt(options.days, 30, 1, 365);
  const weeks = clampInt(options.weeks, 12, 1, 52);
  const months = clampInt(options.months, 12, 1, 24);

  return withConnection(existingConnection, async (connection) => {
    const [[summary]] = await connection.query(`
      SELECT
        COUNT(*) AS totalStudents,
        SUM(CASE WHEN DATE(u.created_at) = CURDATE() THEN 1 ELSE 0 END) AS newRegistrationsToday,
        SUM(CASE WHEN DATE(u.created_at) >= DATE_SUB(CURDATE(), INTERVAL WEEKDAY(CURDATE()) DAY) THEN 1 ELSE 0 END) AS newRegistrationsThisWeek,
        SUM(CASE WHEN YEAR(u.created_at) = YEAR(CURDATE()) AND MONTH(u.created_at) = MONTH(CURDATE()) THEN 1 ELSE 0 END) AS newRegistrationsThisMonth,
        SUM(CASE WHEN (
          u.last_active_at >= CURDATE()
          OR u.last_login_at >= CURDATE()
          OR EXISTS (SELECT 1 FROM test_attempts ta WHERE ta.user_id = u.id AND (ta.started_at >= CURDATE() OR ta.submitted_at >= CURDATE()))
          OR EXISTS (SELECT 1 FROM user_activity_logs ual WHERE ual.user_id = u.id AND ual.created_at >= CURDATE())
        ) THEN 1 ELSE 0 END) AS activeStudentsToday,
        SUM(CASE WHEN u.status = 'active' AND (
          u.last_active_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
          OR u.last_login_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
          OR EXISTS (SELECT 1 FROM test_attempts ta WHERE ta.user_id = u.id AND (ta.started_at >= DATE_SUB(NOW(), INTERVAL 30 DAY) OR ta.submitted_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)))
          OR EXISTS (SELECT 1 FROM user_activity_logs ual WHERE ual.user_id = u.id AND ual.created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY))
        ) THEN 1 ELSE 0 END) AS activeStudentsLast30Days,
        SUM(CASE WHEN (
          u.subscription_status = 'active'
          OR EXISTS (SELECT 1 FROM test_series_enrollments tse WHERE tse.user_id = u.id AND tse.enrollment_type = 'PAID' AND tse.status = 'ACTIVE' AND (tse.expires_at IS NULL OR tse.expires_at > NOW()))
          OR EXISTS (SELECT 1 FROM subscriptions sub WHERE sub.user_id = u.id AND sub.status = 'ACTIVE' AND (sub.expires_at IS NULL OR sub.expires_at > NOW()))
          OR EXISTS (SELECT 1 FROM payments p WHERE p.user_id = u.id AND p.status = 'SUCCESS')
        ) THEN 1 ELSE 0 END) AS paidStudents
      FROM users u
      WHERE u.role = 'student'
    `);

    const [[attemptCounts]] = await connection.query(`
      SELECT COUNT(*) AS totalStudentAttempts
      FROM test_attempts ta
      JOIN users u ON ta.user_id = u.id
      WHERE u.role = 'student'
    `);

    // Retention rate: 30-day cohort retention (fallback to multi-day engagement when cohort is empty)
    const [[cohortStats]] = await connection.query(`
      SELECT
        COUNT(*) AS olderCohortTotal,
        SUM(CASE WHEN (
          u.last_active_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
          OR u.last_login_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
          OR EXISTS (SELECT 1 FROM test_attempts ta WHERE ta.user_id = u.id AND (ta.started_at >= DATE_SUB(NOW(), INTERVAL 30 DAY) OR ta.submitted_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)))
          OR EXISTS (SELECT 1 FROM user_activity_logs ual WHERE ual.user_id = u.id AND ual.created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY))
        ) THEN 1 ELSE 0 END) AS olderCohortRetained
      FROM users u
      WHERE u.role = 'student' AND u.created_at < DATE_SUB(NOW(), INTERVAL 30 DAY)
    `);

    let studentRetentionRate = 0;
    const olderCohortTotal = toNumber(cohortStats.olderCohortTotal);
    const olderCohortRetained = toNumber(cohortStats.olderCohortRetained);

    if (olderCohortTotal > 0) {
      studentRetentionRate = roundTwo((olderCohortRetained / olderCohortTotal) * 100);
    } else if (toNumber(summary.totalStudents) > 0) {
      const [[repeatEngagement]] = await connection.query(`
        SELECT COUNT(*) AS returningStudents
        FROM users u
        WHERE u.role = 'student'
          AND (
            (SELECT COUNT(DISTINCT DATE(ta.started_at)) FROM test_attempts ta WHERE ta.user_id = u.id) >= 2
            OR (u.last_active_at IS NOT NULL AND DATE(u.last_active_at) > DATE(u.created_at))
          )
      `);
      studentRetentionRate = roundTwo(
        (toNumber(repeatEngagement.returningStudents) / toNumber(summary.totalStudents)) * 100
      );
    }

    // Daily registration growth
    const [dailyRows] = await connection.query(
      `SELECT DATE_FORMAT(created_at, '%Y-%m-%d') AS dateKey, COUNT(*) AS count
       FROM users
       WHERE role = 'student' AND created_at >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
       GROUP BY DATE_FORMAT(created_at, '%Y-%m-%d')
       ORDER BY dateKey ASC`,
      [days - 1]
    );
    const dailyMap = new Map(dailyRows.map((r) => [r.dateKey, toNumber(r.count)]));
    const daily = [];
    const today = new Date();
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i);
      const key = formatDateYMD(d);
      daily.push({
        date: key,
        label: `${SHORT_MONTHS[d.getMonth()]} ${d.getDate()}`,
        count: dailyMap.get(key) || 0
      });
    }

    // Weekly registration growth (aligned to Monday of each week)
    const [weeklyRows] = await connection.query(
      `SELECT
         DATE_FORMAT(DATE_SUB(DATE(created_at), INTERVAL WEEKDAY(created_at) DAY), '%Y-%m-%d') AS weekStart,
         COUNT(*) AS count
       FROM users
       WHERE role = 'student'
         AND created_at >= DATE_SUB(DATE_SUB(CURDATE(), INTERVAL WEEKDAY(CURDATE()) DAY), INTERVAL ? WEEK)
       GROUP BY weekStart
       ORDER BY weekStart ASC`,
      [weeks - 1]
    );
    const weeklyMap = new Map(weeklyRows.map((r) => [r.weekStart, toNumber(r.count)]));
    const weekly = [];
    const jsDay = today.getDay();
    const diffToMonday = jsDay === 0 ? 6 : jsDay - 1;
    const currentMonday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - diffToMonday);
    for (let i = weeks - 1; i >= 0; i--) {
      const monday = new Date(
        currentMonday.getFullYear(),
        currentMonday.getMonth(),
        currentMonday.getDate() - i * 7
      );
      const key = formatDateYMD(monday);
      weekly.push({
        weekStart: key,
        label: `${SHORT_MONTHS[monday.getMonth()]} ${monday.getDate()}`,
        count: weeklyMap.get(key) || 0
      });
    }

    // Monthly registration growth
    const [monthlyRows] = await connection.query(
      `SELECT DATE_FORMAT(created_at, '%Y-%m') AS monthKey, COUNT(*) AS count
       FROM users
       WHERE role = 'student'
         AND created_at >= DATE_FORMAT(DATE_SUB(CURDATE(), INTERVAL ? MONTH), '%Y-%m-01')
       GROUP BY monthKey
       ORDER BY monthKey ASC`,
      [months - 1]
    );
    const monthlyMap = new Map(monthlyRows.map((r) => [r.monthKey, toNumber(r.count)]));
    const monthly = [];
    for (let i = months - 1; i >= 0; i--) {
      const m = new Date(today.getFullYear(), today.getMonth() - i, 1);
      const key = formatMonthYM(m);
      monthly.push({
        month: key,
        label: SHORT_MONTHS[m.getMonth()],
        year: m.getFullYear(),
        count: monthlyMap.get(key) || 0
      });
    }

    const totalStudents = toNumber(summary.totalStudents);
    const activeStudentsLast30Days = toNumber(summary.activeStudentsLast30Days);
    const paidStudents = toNumber(summary.paidStudents);
    const totalStudentAttempts = toNumber(attemptCounts.totalStudentAttempts);

    return {
      totalStudents,
      newRegistrationsToday: toNumber(summary.newRegistrationsToday),
      newRegistrationsThisWeek: toNumber(summary.newRegistrationsThisWeek),
      newRegistrationsThisMonth: toNumber(summary.newRegistrationsThisMonth),
      activeStudentsToday: toNumber(summary.activeStudentsToday),
      activeStudentsLast30Days,
      inactiveStudents: Math.max(totalStudents - activeStudentsLast30Days, 0),
      paidStudents,
      freeStudents: Math.max(totalStudents - paidStudents, 0),
      averageTestsAttemptedPerStudent: totalStudents > 0 ? roundTwo(totalStudentAttempts / totalStudents) : 0,
      studentRetentionRate,
      registrationGrowth: {
        daily,
        weekly,
        monthly
      }
    };
  });
}

/**
 * Section 3: Test Analytics & Test Attempts Overview Chart
 */
async function getTestAnalytics(options = {}, existingConnection = null) {
  const days = clampInt(options.days, 7, 1, 90);

  return withConnection(existingConnection, async (connection) => {
    const [[testCounts]] = await connection.query(`
      SELECT
        COUNT(*) AS totalTestsCreated,
        SUM(CASE WHEN is_published = 1 AND (start_time IS NULL OR start_time <= NOW()) THEN 1 ELSE 0 END) AS publishedTests,
        SUM(CASE WHEN is_published = 0 AND (start_time IS NULL OR start_time <= NOW()) THEN 1 ELSE 0 END) AS draftTests,
        SUM(CASE WHEN start_time IS NOT NULL AND start_time > NOW() THEN 1 ELSE 0 END) AS scheduledTests
      FROM tests
    `);

    const [[attemptStats]] = await connection.query(`
      SELECT
        COUNT(*) AS totalAttempts,
        SUM(CASE WHEN status = 'COMPLETED' THEN 1 ELSE 0 END) AS completedAttempts,
        SUM(CASE WHEN status = 'IN_PROGRESS' THEN 1 ELSE 0 END) AS ongoingAttempts,
        COALESCE(AVG(CASE WHEN status = 'COMPLETED' THEN percentage ELSE NULL END), 0) AS averageTestScore,
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
        ), 0) AS avgCompletionTimeSeconds
      FROM test_attempts
    `);

    const [dailyAttemptsRows] = await connection.query(
      `SELECT
         DATE_FORMAT(started_at, '%Y-%m-%d') AS dateKey,
         COUNT(*) AS totalAttempts,
         SUM(CASE WHEN status = 'COMPLETED' THEN 1 ELSE 0 END) AS completedAttempts,
         SUM(CASE WHEN status = 'IN_PROGRESS' THEN 1 ELSE 0 END) AS ongoingAttempts
       FROM test_attempts
       WHERE started_at >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
       GROUP BY dateKey
       ORDER BY dateKey ASC`,
      [days - 1]
    );

    const attemptMap = new Map(
      dailyAttemptsRows.map((r) => [
        r.dateKey,
        {
          totalAttempts: toNumber(r.totalAttempts),
          completedAttempts: toNumber(r.completedAttempts),
          ongoingAttempts: toNumber(r.ongoingAttempts)
        }
      ])
    );

    const attemptsOverview = [];
    const today = new Date();
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i);
      const key = formatDateYMD(d);
      const entry = attemptMap.get(key) || { totalAttempts: 0, completedAttempts: 0, ongoingAttempts: 0 };
      attemptsOverview.push({
        date: key,
        day: SHORT_DAYS[d.getDay()],
        totalAttempts: entry.totalAttempts,
        completedAttempts: entry.completedAttempts,
        ongoingAttempts: entry.ongoingAttempts
      });
    }

    const totalAttempts = toNumber(attemptStats.totalAttempts);
    const completedAttempts = toNumber(attemptStats.completedAttempts);
    const avgSeconds = Math.round(toNumber(attemptStats.avgCompletionTimeSeconds));

    return {
      totalTestsCreated: toNumber(testCounts.totalTestsCreated),
      publishedTests: toNumber(testCounts.publishedTests),
      draftTests: toNumber(testCounts.draftTests),
      scheduledTests: toNumber(testCounts.scheduledTests),
      totalAttempts,
      completedAttempts,
      ongoingAttempts: toNumber(attemptStats.ongoingAttempts),
      averageTestScore: roundTwo(attemptStats.averageTestScore),
      averageTestCompletionTimeSeconds: avgSeconds,
      averageTestCompletionTimeMinutes: roundTwo(avgSeconds / 60),
      testCompletionRate: totalAttempts > 0 ? roundTwo((completedAttempts / totalAttempts) * 100) : 0,
      attemptsOverview
    };
  });
}

/**
 * Section 4: Test Series Performance
 */
async function getTestSeriesPerformance(options = {}, existingConnection = null) {
  const limit = clampInt(options.limit, 50, 1, 200);

  return withConnection(existingConnection, async (connection) => {
    const [rows] = await connection.query(`
      SELECT
        ts.id,
        ts.title,
        ts.price,
        ts.is_paid AS isPaid,
        ts.is_published AS isPublished,
        COALESCE(ts.published_at, ts.updated_at, ts.created_at) AS publishedAt,
        ts.created_at AS createdAt,
        COUNT(DISTINCT CASE WHEN e.status != 'CANCELLED' THEN e.user_id END) AS enrolledCount,
        COUNT(DISTINCT ta.id) AS attemptsCount,
        COUNT(DISTINCT CASE WHEN ta.status = 'COMPLETED' THEN ta.id END) AS completedAttemptsCount,
        COALESCE(rev.totalRevenue, 0) AS totalRevenue
      FROM test_series ts
      LEFT JOIN test_series_enrollments e ON e.test_series_id = ts.id
      LEFT JOIN test_series_tests tst ON tst.test_series_id = ts.id
      LEFT JOIN test_attempts ta ON (
        (ta.test_series_id IS NOT NULL AND ta.test_series_id = ts.id)
        OR (ta.test_series_id IS NULL AND ta.test_id = tst.test_id)
      )
      LEFT JOIN (
        SELECT test_series_id, COALESCE(SUM(amount - refund_amount), 0) AS totalRevenue
        FROM payments
        WHERE status = 'SUCCESS' AND test_series_id IS NOT NULL
        GROUP BY test_series_id
      ) rev ON rev.test_series_id = ts.id
      WHERE ts.is_archived = 0
      GROUP BY
        ts.id, ts.title, ts.price, ts.is_paid, ts.is_published,
        COALESCE(ts.published_at, ts.updated_at, ts.created_at),
        ts.created_at, rev.totalRevenue
      ORDER BY enrolledCount DESC, attemptsCount DESC, ts.id ASC
    `);

    const series = rows.map((row) => {
      const enrolled = toNumber(row.enrolledCount);
      const attempts = toNumber(row.attemptsCount);
      const completed = toNumber(row.completedAttemptsCount);
      return {
        id: row.id,
        title: row.title,
        price: roundTwo(row.price),
        isPaid: Boolean(row.isPaid),
        isPublished: Boolean(row.isPublished),
        publishedAt: row.isPublished ? row.publishedAt : null,
        createdAt: row.createdAt,
        enrolled,
        attempts,
        completedAttempts: completed,
        completionRate: attempts > 0 ? roundTwo((completed / attempts) * 100) : 0,
        totalRevenue: roundTwo(row.totalRevenue)
      };
    });

    const publishedSeries = series.filter((s) => s.isPublished);
    const pool = publishedSeries.length > 0 ? publishedSeries : series;

    const mostPopular =
      pool.length > 0
        ? [...pool].sort((a, b) => b.enrolled - a.enrolled || b.attempts - a.attempts)[0]
        : null;

    const leastPopular =
      pool.length > 0
        ? [...pool].sort((a, b) => a.enrolled - b.enrolled || a.attempts - b.attempts)[0]
        : null;

    const highestRevenue =
      series.length > 0
        ? [...series].sort((a, b) => b.totalRevenue - a.totalRevenue || b.enrolled - a.enrolled)[0]
        : null;

    const seriesWithAttempts = series.filter((s) => s.attempts > 0);
    const highestCompletionRate =
      seriesWithAttempts.length > 0
        ? [...seriesWithAttempts].sort(
            (a, b) => b.completionRate - a.completionRate || b.completedAttempts - a.completedAttempts
          )[0]
        : null;

    const recentlyPublishedSeries = [...publishedSeries]
      .sort((a, b) => new Date(b.publishedAt || b.createdAt) - new Date(a.publishedAt || a.createdAt))
      .slice(0, 5);

    return {
      series: series.slice(0, limit),
      highlights: {
        mostPopularTestSeries: mostPopular,
        leastPopularTestSeries: leastPopular,
        highestRevenueSeries: highestRevenue,
        highestCompletionRateSeries: highestCompletionRate,
        recentlyPublishedSeries: recentlyPublishedSeries[0] || null
      },
      recentlyPublishedSeries
    };
  });
}

/**
 * Section 5: Revenue Analytics & Monthly Revenue Chart
 */
async function getRevenueAnalytics(options = {}, existingConnection = null) {
  const months = clampInt(options.months, 6, 1, 24);

  return withConnection(existingConnection, async (connection) => {
    const [[paymentSummary]] = await connection.query(`
      SELECT
        COALESCE(SUM(CASE WHEN status = 'SUCCESS' THEN amount - refund_amount ELSE 0 END), 0) AS totalRevenue,
        COALESCE(SUM(CASE WHEN status = 'SUCCESS' AND DATE(COALESCE(paid_at, created_at)) = CURDATE() THEN amount - refund_amount ELSE 0 END), 0) AS revenueToday,
        COALESCE(SUM(CASE WHEN status = 'SUCCESS' AND YEAR(COALESCE(paid_at, created_at)) = YEAR(CURDATE()) AND MONTH(COALESCE(paid_at, created_at)) = MONTH(CURDATE()) THEN amount - refund_amount ELSE 0 END), 0) AS revenueThisMonth,
        SUM(CASE WHEN status = 'SUCCESS' THEN 1 ELSE 0 END) AS successfulPayments,
        COALESCE(SUM(CASE WHEN status = 'SUCCESS' THEN amount ELSE 0 END), 0) AS successfulPaymentsAmount,
        SUM(CASE WHEN status = 'FAILED' THEN 1 ELSE 0 END) AS failedPayments,
        COALESCE(SUM(CASE WHEN status = 'FAILED' THEN amount ELSE 0 END), 0) AS failedPaymentsAmount,
        SUM(CASE WHEN status = 'PENDING' THEN 1 ELSE 0 END) AS pendingPayments,
        COALESCE(SUM(CASE WHEN status = 'PENDING' THEN amount ELSE 0 END), 0) AS pendingPaymentsAmount,
        SUM(CASE WHEN status = 'REFUNDED' THEN 1 ELSE 0 END) AS refundsCount,
        COALESCE(SUM(CASE WHEN status = 'REFUNDED' THEN (CASE WHEN refund_amount > 0 THEN refund_amount ELSE amount END) ELSE 0 END), 0) AS refundsAmount,
        COALESCE(AVG(CASE WHEN status = 'SUCCESS' THEN amount ELSE NULL END), 0) AS averageOrderValue
      FROM payments
    `);

    const [[subscriptionCounts]] = await connection.query(`
      SELECT
        (SELECT COUNT(*) FROM subscriptions WHERE status = 'ACTIVE' AND (expires_at IS NULL OR expires_at > NOW())) AS activePlanSubscriptions,
        (SELECT COUNT(*) FROM test_series_enrollments WHERE enrollment_type = 'PAID' AND status = 'ACTIVE' AND (expires_at IS NULL OR expires_at > NOW())) AS activePaidEnrollments
    `);

    const [monthlyRows] = await connection.query(
      `SELECT
         DATE_FORMAT(COALESCE(paid_at, created_at), '%Y-%m') AS monthKey,
         COALESCE(SUM(amount - refund_amount), 0) AS revenue,
         COUNT(*) AS transactions
       FROM payments
       WHERE status = 'SUCCESS'
         AND COALESCE(paid_at, created_at) >= DATE_FORMAT(DATE_SUB(CURDATE(), INTERVAL ? MONTH), '%Y-%m-01')
       GROUP BY monthKey
       ORDER BY monthKey ASC`,
      [months - 1]
    );

    const revMap = new Map(
      monthlyRows.map((r) => [
        r.monthKey,
        { revenue: roundTwo(r.revenue), transactions: toNumber(r.transactions) }
      ])
    );

    const monthlyRevenue = [];
    const today = new Date();
    for (let i = months - 1; i >= 0; i--) {
      const m = new Date(today.getFullYear(), today.getMonth() - i, 1);
      const key = formatMonthYM(m);
      const entry = revMap.get(key) || { revenue: 0, transactions: 0 };
      monthlyRevenue.push({
        monthKey: key,
        month: SHORT_MONTHS[m.getMonth()],
        year: m.getFullYear(),
        revenue: entry.revenue,
        transactions: entry.transactions
      });
    }

    const activePlanSubscriptions = toNumber(subscriptionCounts.activePlanSubscriptions);
    const activePaidEnrollments = toNumber(subscriptionCounts.activePaidEnrollments);

    return {
      totalRevenue: roundTwo(paymentSummary.totalRevenue),
      revenueToday: roundTwo(paymentSummary.revenueToday),
      revenueThisMonth: roundTwo(paymentSummary.revenueThisMonth),
      successfulPayments: toNumber(paymentSummary.successfulPayments),
      successfulPaymentsAmount: roundTwo(paymentSummary.successfulPaymentsAmount),
      failedPayments: toNumber(paymentSummary.failedPayments),
      failedPaymentsAmount: roundTwo(paymentSummary.failedPaymentsAmount),
      pendingPayments: toNumber(paymentSummary.pendingPayments),
      pendingPaymentsAmount: roundTwo(paymentSummary.pendingPaymentsAmount),
      refundsCount: toNumber(paymentSummary.refundsCount),
      refundsAmount: roundTwo(paymentSummary.refundsAmount),
      totalPaidSubscriptions: activePlanSubscriptions + activePaidEnrollments,
      activePlanSubscriptions,
      activePaidSeriesEnrollments: activePaidEnrollments,
      averageOrderValue: roundTwo(paymentSummary.averageOrderValue),
      currency: 'INR',
      monthlyRevenue
    };
  });
}

/**
 * Section 6: Student Performance Analytics & Subject-wise Performance
 */
async function getStudentPerformanceAnalytics(existingConnection = null) {
  return withConnection(existingConnection, async (connection) => {
    const [[perfSummary]] = await connection.query(`
      SELECT
        COALESCE(AVG(ta.percentage), 0) AS averageStudentScore,
        COALESCE(MAX(ta.percentage), 0) AS highestScore,
        COALESCE(MIN(ta.percentage), 0) AS lowestScore,
        COALESCE(AVG(CASE WHEN ta.attempted_questions > 0 THEN (ta.correct_answers / ta.attempted_questions) * 100 ELSE NULL END), 0) AS averageAccuracy,
        COALESCE(AVG(
          CASE
            WHEN ta.time_taken_seconds > 0 THEN ta.time_taken_seconds
            WHEN ta.submitted_at IS NOT NULL THEN GREATEST(TIMESTAMPDIFF(SECOND, ta.started_at, ta.submitted_at), 0)
            ELSE NULL
          END
        ), 0) AS avgCompletionTimeSeconds,
        COUNT(*) AS totalCompleted,
        SUM(
          CASE
            WHEN (t.passing_marks IS NOT NULL AND t.passing_marks > 0 AND ta.obtained_marks >= t.passing_marks)
              OR ((t.passing_marks IS NULL OR t.passing_marks <= 0) AND ta.percentage >= 40)
            THEN 1 ELSE 0
          END
        ) AS passedAttempts
      FROM test_attempts ta
      JOIN users u ON ta.user_id = u.id
      LEFT JOIN tests t ON ta.test_id = t.id
      WHERE u.role = 'student' AND ta.status = 'COMPLETED'
    `);

    const [studentAttempts] = await connection.query(`
      SELECT
        ta.user_id,
        ta.percentage,
        COALESCE(ta.submitted_at, ta.started_at, ta.created_at) AS attemptTime
      FROM test_attempts ta
      JOIN users u ON ta.user_id = u.id
      WHERE u.role = 'student' AND ta.status = 'COMPLETED'
      ORDER BY ta.user_id ASC, attemptTime ASC, ta.id ASC
    `);

    const byStudent = new Map();
    for (const row of studentAttempts) {
      if (!byStudent.has(row.user_id)) byStudent.set(row.user_id, []);
      byStudent.get(row.user_id).push(toNumber(row.percentage));
    }

    let studentsImproving = 0;
    let studentsStruggling = 0;

    for (const scores of byStudent.values()) {
      const avg = scores.reduce((acc, s) => acc + s, 0) / scores.length;
      const latest = scores[scores.length - 1];

      if (scores.length >= 2) {
        const previous = scores.slice(0, -1);
        const prevAvg = previous.reduce((acc, s) => acc + s, 0) / previous.length;
        if (latest > prevAvg) {
          studentsImproving++;
        } else if (avg < 40 || (latest < prevAvg && latest < 50)) {
          studentsStruggling++;
        }
      } else if (avg < 40) {
        studentsStruggling++;
      }
    }

    // Subject-wise accuracy from answered questions
    const [subjectAnswerRows] = await connection.query(`
      SELECT
        COALESCE(NULLIF(TRIM(q.subject), ''), s.name, 'General') AS subjectName,
        COUNT(aa.id) AS totalAnswered,
        SUM(CASE WHEN aa.is_correct = 1 THEN 1 ELSE 0 END) AS correctAnswers
      FROM attempt_answers aa
      JOIN test_attempts ta ON aa.attempt_id = ta.id
      JOIN users u ON ta.user_id = u.id
      JOIN questions q ON aa.question_id = q.id
      LEFT JOIN tests t ON ta.test_id = t.id
      LEFT JOIN subjects s ON t.subject_id = s.id
      WHERE u.role = 'student' AND aa.selected_option_id IS NOT NULL
      GROUP BY subjectName
    `);

    const [activeSubjects] = await connection.query(`
      SELECT name FROM subjects WHERE is_active = 1 ORDER BY name ASC
    `);

    const subjectMap = new Map();
    for (const sub of activeSubjects) {
      subjectMap.set(sub.name, {
        subject: sub.name,
        averageAccuracy: 0,
        totalAnswered: 0,
        correctAnswers: 0
      });
    }

    for (const row of subjectAnswerRows) {
      const answered = toNumber(row.totalAnswered);
      const correct = toNumber(row.correctAnswers);
      subjectMap.set(row.subjectName, {
        subject: row.subjectName,
        averageAccuracy: answered > 0 ? roundTwo((correct / answered) * 100) : 0,
        totalAnswered: answered,
        correctAnswers: correct
      });
    }

    const subjectWisePerformance = Array.from(subjectMap.values()).sort(
      (a, b) => b.averageAccuracy - a.averageAccuracy || b.totalAnswered - a.totalAnswered
    );

    const totalCompleted = toNumber(perfSummary.totalCompleted);
    const passedAttempts = toNumber(perfSummary.passedAttempts);
    const avgSeconds = Math.round(toNumber(perfSummary.avgCompletionTimeSeconds));

    return {
      averageStudentScore: roundTwo(perfSummary.averageStudentScore),
      highestScore: roundTwo(perfSummary.highestScore),
      lowestScore: roundTwo(perfSummary.lowestScore),
      averageAccuracy: roundTwo(perfSummary.averageAccuracy),
      averageCompletionTimeSeconds: avgSeconds,
      averageCompletionTimeMinutes: roundTwo(avgSeconds / 60),
      passPercentage: totalCompleted > 0 ? roundTwo((passedAttempts / totalCompleted) * 100) : 0,
      studentsImproving,
      studentsStruggling,
      subjectWisePerformance
    };
  });
}

/**
 * Full Combined Admin Dashboard Metrics
 */
async function getDashboardMetrics(options = {}) {
  let connection;
  try {
    connection = await createDbConnection();

    const overview = await getOverviewStats(connection);
    const studentAnalytics = await getStudentAnalytics(
      {
        days: options.studentDays || options.days || 30,
        weeks: options.weeks || 12,
        months: options.studentMonths || 12
      },
      connection
    );
    const testAnalytics = await getTestAnalytics(
      { days: options.testDays || 7 },
      connection
    );
    const testSeriesPerformance = await getTestSeriesPerformance(
      { limit: options.seriesLimit || 50 },
      connection
    );
    const revenueAnalytics = await getRevenueAnalytics(
      { months: options.revenueMonths || 6 },
      connection
    );
    const studentPerformanceAnalytics = await getStudentPerformanceAnalytics(connection);

    return {
      overview,
      studentAnalytics,
      testAnalytics,
      testSeriesPerformance,
      revenueAnalytics,
      studentPerformanceAnalytics
    };
  } finally {
    if (connection) await connection.end();
  }
}

module.exports = {
  getDashboardMetrics,
  getOverviewStats,
  getStudentAnalytics,
  getTestAnalytics,
  getTestSeriesPerformance,
  getRevenueAnalytics,
  getStudentPerformanceAnalytics
};
