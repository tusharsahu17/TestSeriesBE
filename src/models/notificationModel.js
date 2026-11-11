const { createDbConnection } = require('../config/db');
const { ensureStudentDashboardTables } = require('../config/initStudentDashboardTables');

const ALLOWED_NOTIFICATION_TYPES = [
  'NEW_TEST',
  'RESULT_PUBLISHED',
  'SERIES_EXPIRING',
  'PAYMENT_CONFIRMED',
  'ANNOUNCEMENT',
];

const ALLOWED_TARGET_AUDIENCES = ['USER', 'ALL_STUDENTS', 'SERIES_ENROLLED'];

function toNumber(val, fallback = 0) {
  const num = Number(val);
  return Number.isFinite(num) ? num : fallback;
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

function buildVisibilityClause(alias = 'n') {
  return `(
    ${alias}.user_id = ?
    OR (${alias}.user_id IS NULL AND ${alias}.target_audience = 'ALL_STUDENTS')
    OR (
      ${alias}.user_id IS NULL
      AND ${alias}.target_audience = 'SERIES_ENROLLED'
      AND EXISTS (
        SELECT 1
        FROM test_series_enrollments tse_notif
        WHERE tse_notif.user_id = ?
          AND tse_notif.test_series_id = ${alias}.target_series_id
          AND tse_notif.status != 'CANCELLED'
      )
    )
  ) AND (${alias}.expires_at IS NULL OR ${alias}.expires_at > NOW())`;
}

async function createNotification(payload = {}, existingConnection = null) {
  await ensureStudentDashboardTables(existingConnection);

  return withConnection(existingConnection, async (connection) => {
    const type = ALLOWED_NOTIFICATION_TYPES.includes(String(payload.type || '').toUpperCase())
      ? String(payload.type).toUpperCase()
      : 'ANNOUNCEMENT';

    const targetAudience = ALLOWED_TARGET_AUDIENCES.includes(String(payload.targetAudience || '').toUpperCase())
      ? String(payload.targetAudience).toUpperCase()
      : payload.userId
        ? 'USER'
        : 'ALL_STUDENTS';

    const userId = targetAudience === 'USER' ? toNumber(payload.userId, null) : null;
    const targetSeriesId = payload.targetSeriesId ? toNumber(payload.targetSeriesId, null) : null;

    if (targetAudience === 'USER' && !userId) {
      const err = new Error('userId is required for USER notifications');
      err.status = 400;
      throw err;
    }
    if (targetAudience === 'SERIES_ENROLLED' && !targetSeriesId) {
      const err = new Error('targetSeriesId is required for SERIES_ENROLLED notifications');
      err.status = 400;
      throw err;
    }
    if (!payload.title || !payload.message) {
      const err = new Error('Notification title and message are required');
      err.status = 400;
      throw err;
    }

    const dedupeKey = payload.dedupeKey ? String(payload.dedupeKey).slice(0, 150) : null;
    const insertSql = dedupeKey
      ? `INSERT IGNORE INTO notifications
          (user_id, target_audience, target_series_id, type, title, message, reference_type, reference_id, metadata, dedupe_key, expires_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      : `INSERT INTO notifications
          (user_id, target_audience, target_series_id, type, title, message, reference_type, reference_id, metadata, dedupe_key, expires_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

    const [result] = await connection.query(insertSql, [
      userId,
      targetAudience,
      targetSeriesId,
      type,
      String(payload.title).trim().slice(0, 255),
      String(payload.message).trim(),
      payload.referenceType || null,
      payload.referenceId ? toNumber(payload.referenceId, null) : null,
      payload.metadata ? JSON.stringify(payload.metadata) : null,
      dedupeKey,
      payload.expiresAt || null,
    ]);

    return result.insertId || null;
  });
}

async function syncExpiringSeriesNotifications(connection, userId) {
  const [expiringRows] = await connection.query(
    `SELECT
       e.id AS enrollment_id,
       e.test_series_id,
       e.expires_at,
       ts.title AS series_title
     FROM test_series_enrollments e
     JOIN test_series ts ON ts.id = e.test_series_id
     WHERE e.user_id = ?
       AND e.status = 'ACTIVE'
       AND ts.is_archived = 0
       AND e.expires_at IS NOT NULL
       AND e.expires_at > NOW()
       AND e.expires_at <= DATE_ADD(NOW(), INTERVAL 7 DAY)`,
    [userId]
  );

  for (const row of expiringRows) {
    const expiresDate = new Date(row.expires_at);
    const diffMs = expiresDate.getTime() - Date.now();
    const daysLeft = Math.max(1, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
    const expiryKeyDate = expiresDate.toISOString().slice(0, 10);
    const dedupeKey = `series_expiring:${row.enrollment_id}:${expiryKeyDate}`;

    await createNotification(
      {
        userId,
        targetAudience: 'USER',
        targetSeriesId: row.test_series_id,
        type: 'SERIES_EXPIRING',
        title: 'Test Series Expiring',
        message: `${row.series_title} expires in ${daysLeft} day${daysLeft === 1 ? '' : 's'}.`,
        referenceType: 'test_series',
        referenceId: row.test_series_id,
        metadata: {
          enrollmentId: row.enrollment_id,
          testSeriesId: row.test_series_id,
          seriesTitle: row.series_title,
          expiresAt: row.expires_at,
          daysLeft,
        },
        dedupeKey,
      },
      connection
    );
  }
}

async function getUnreadCount(connection, userId) {
  const visibilitySql = buildVisibilityClause('n');
  const [[row]] = await connection.query(
    `SELECT COUNT(*) AS unreadCount
     FROM notifications n
     LEFT JOIN notification_reads nr
       ON nr.notification_id = n.id AND nr.user_id = ?
     WHERE ${visibilitySql}
       AND (
         (n.user_id IS NOT NULL AND n.is_read = 0)
         OR (n.user_id IS NULL AND nr.id IS NULL)
       )`,
    [userId, userId, userId]
  );
  return toNumber(row?.unreadCount);
}

async function getUserNotifications(userId, options = {}, existingConnection = null) {
  await ensureStudentDashboardTables(existingConnection);

  return withConnection(existingConnection, async (connection) => {
    await syncExpiringSeriesNotifications(connection, userId);

    const pageRaw = Number.parseInt(options.page, 10);
    const limitRaw = Number.parseInt(options.limit, 10);
    const page = Number.isFinite(pageRaw) && pageRaw > 0 ? pageRaw : 1;
    const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 100) : 5;
    const offset = (page - 1) * limit;

    const visibilitySql = buildVisibilityClause('n');
    const conditions = [visibilitySql];
    const params = [userId, userId];

    if (options.type && String(options.type).trim() && String(options.type).toUpperCase() !== 'ALL') {
      const upperType = String(options.type).trim().toUpperCase();
      if (ALLOWED_NOTIFICATION_TYPES.includes(upperType)) {
        conditions.push('n.type = ?');
        params.push(upperType);
      }
    }

    if (options.unreadOnly === true || String(options.unreadOnly).toLowerCase() === 'true') {
      conditions.push('((n.user_id IS NOT NULL AND n.is_read = 0) OR (n.user_id IS NULL AND nr.id IS NULL))');
    }

    const whereSql = conditions.join(' AND ');

    const [[countRow]] = await connection.query(
      `SELECT COUNT(*) AS total
       FROM notifications n
       LEFT JOIN notification_reads nr
         ON nr.notification_id = n.id AND nr.user_id = ?
       WHERE ${whereSql}`,
      [userId, ...params]
    );

    const total = toNumber(countRow?.total);

    const [rows] = await connection.query(
      `SELECT
         n.id,
         n.user_id,
         n.target_audience,
         n.target_series_id,
         n.type,
         n.title,
         n.message,
         n.reference_type,
         n.reference_id,
         n.metadata,
         n.created_at,
         n.expires_at,
         CASE
           WHEN n.user_id IS NOT NULL THEN n.is_read
           ELSE (nr.id IS NOT NULL)
         END AS effective_is_read,
         CASE
           WHEN n.user_id IS NOT NULL THEN n.read_at
           ELSE nr.read_at
         END AS effective_read_at
       FROM notifications n
       LEFT JOIN notification_reads nr
         ON nr.notification_id = n.id AND nr.user_id = ?
       WHERE ${whereSql}
       ORDER BY n.created_at DESC, n.id DESC
       LIMIT ? OFFSET ?`,
      [userId, ...params, limit, offset]
    );

    const unreadCount = await getUnreadCount(connection, userId);

    const items = rows.map((row) => ({
      id: row.id,
      type: row.type,
      title: row.title,
      message: row.message,
      isRead: Boolean(row.effective_is_read),
      readAt: row.effective_read_at || null,
      targetAudience: row.target_audience,
      targetSeriesId: row.target_series_id || null,
      referenceType: row.reference_type || null,
      referenceId: row.reference_id || null,
      metadata: parseMetadata(row.metadata),
      createdAt: row.created_at,
      expiresAt: row.expires_at || null,
    }));

    return {
      items,
      unreadCount,
      pagination: {
        page,
        limit,
        total,
        totalPages: total > 0 ? Math.ceil(total / limit) : 0,
      },
    };
  });
}

async function markNotificationAsRead(userId, notificationId) {
  await ensureStudentDashboardTables();

  return withConnection(null, async (connection) => {
    const visibilitySql = buildVisibilityClause('n');
    const [rows] = await connection.query(
      `SELECT n.id, n.user_id
       FROM notifications n
       WHERE n.id = ? AND ${visibilitySql}`,
      [notificationId, userId, userId]
    );

    if (rows.length === 0) {
      return null;
    }

    const notif = rows[0];
    if (notif.user_id !== null) {
      await connection.query(
        'UPDATE notifications SET is_read = 1, read_at = COALESCE(read_at, NOW()) WHERE id = ? AND user_id = ?',
        [notificationId, userId]
      );
    } else {
      await connection.query(
        'INSERT IGNORE INTO notification_reads (notification_id, user_id) VALUES (?, ?)',
        [notificationId, userId]
      );
    }

    const unreadCount = await getUnreadCount(connection, userId);
    return {
      id: Number(notificationId),
      isRead: true,
      unreadCount,
    };
  });
}

async function markAllNotificationsAsRead(userId) {
  await ensureStudentDashboardTables();

  return withConnection(null, async (connection) => {
    await connection.beginTransaction();
    try {
      const [personalRes] = await connection.query(
        `UPDATE notifications
         SET is_read = 1, read_at = COALESCE(read_at, NOW())
         WHERE user_id = ? AND is_read = 0`,
        [userId]
      );

      const visibilitySql = buildVisibilityClause('n');
      const [broadcastRes] = await connection.query(
        `INSERT IGNORE INTO notification_reads (notification_id, user_id)
         SELECT n.id, ?
         FROM notifications n
         LEFT JOIN notification_reads nr
           ON nr.notification_id = n.id AND nr.user_id = ?
         WHERE n.user_id IS NULL
           AND nr.id IS NULL
           AND ${visibilitySql}`,
        [userId, userId, userId, userId]
      );

      await connection.commit();
      return {
        markedCount: (personalRes.affectedRows || 0) + (broadcastRes.affectedRows || 0),
        unreadCount: 0,
      };
    } catch (error) {
      await connection.rollback();
      throw error;
    }
  });
}

async function notifyNewTestPublished(connection, testId) {
  try {
    const [testRows] = await connection.query(
      `SELECT t.id, t.name, t.is_free, t.is_published, t.is_active
       FROM tests t
       WHERE t.id = ?`,
      [testId]
    );
    if (testRows.length === 0) return;
    const test = testRows[0];
    if (!test.is_published || !test.is_active) return;

    const [seriesRows] = await connection.query(
      `SELECT ts.id, ts.title, ts.is_paid
       FROM test_series_tests tst
       JOIN test_series ts ON ts.id = tst.test_series_id
       WHERE tst.test_id = ? AND ts.is_published = 1 AND ts.is_archived = 0`,
      [testId]
    );

    if (seriesRows.length > 0 && !test.is_free) {
      for (const s of seriesRows) {
        await createNotification(
          {
            targetAudience: 'SERIES_ENROLLED',
            targetSeriesId: s.id,
            type: 'NEW_TEST',
            title: 'New Test Available',
            message: `${test.name} is now available in ${s.title}.`,
            referenceType: 'test',
            referenceId: test.id,
            metadata: { testId: test.id, testName: test.name, testSeriesId: s.id, seriesTitle: s.title },
            dedupeKey: `new_test:${test.id}:series:${s.id}`,
          },
          connection
        );
      }
    } else {
      const seriesContext = seriesRows[0] || null;
      await createNotification(
        {
          targetAudience: 'ALL_STUDENTS',
          targetSeriesId: seriesContext ? seriesContext.id : null,
          type: 'NEW_TEST',
          title: 'New Test Available',
          message: seriesContext
            ? `${test.name} (${seriesContext.title}) is now available.`
            : `${test.name} is now available.`,
          referenceType: 'test',
          referenceId: test.id,
          metadata: {
            testId: test.id,
            testName: test.name,
            testSeriesId: seriesContext ? seriesContext.id : null,
            seriesTitle: seriesContext ? seriesContext.title : null,
          },
          dedupeKey: `new_test:${test.id}:all`,
        },
        connection
      );
    }
  } catch (err) {
    console.error('Failed to create new test notification:', err.message);
  }
}

async function notifyResultPublished(connection, attemptId) {
  try {
    const [rows] = await connection.query(
      `SELECT ta.id, ta.user_id, ta.test_id, ta.obtained_marks, ta.total_marks, t.name AS test_name
       FROM test_attempts ta
       LEFT JOIN tests t ON t.id = ta.test_id
       WHERE ta.id = ?`,
      [attemptId]
    );
    if (rows.length === 0) return;
    const row = rows[0];
    const testName = row.test_name || `Test #${row.test_id}`;

    await createNotification(
      {
        userId: row.user_id,
        targetAudience: 'USER',
        type: 'RESULT_PUBLISHED',
        title: 'Result Published',
        message: `Your ${testName} result is ready.`,
        referenceType: 'attempt',
        referenceId: row.id,
        metadata: {
          attemptId: row.id,
          testId: row.test_id,
          testName,
          obtainedMarks: toNumber(row.obtained_marks),
          totalMarks: toNumber(row.total_marks),
        },
        dedupeKey: `result_published:${row.id}`,
      },
      connection
    );
  } catch (err) {
    console.error('Failed to create result notification:', err.message);
  }
}

async function notifyPaymentConfirmed(connection, { userId, paymentId, testSeriesId, amount, currency = 'INR' }) {
  try {
    let seriesTitle = 'your test series';
    if (testSeriesId) {
      const [sRows] = await connection.query('SELECT title FROM test_series WHERE id = ?', [testSeriesId]);
      if (sRows.length > 0) seriesTitle = sRows[0].title;
    }

    await createNotification(
      {
        userId,
        targetAudience: 'USER',
        targetSeriesId: testSeriesId || null,
        type: 'PAYMENT_CONFIRMED',
        title: 'Payment Confirmed',
        message: `Payment of ${currency} ${toNumber(amount)} confirmed for ${seriesTitle}.`,
        referenceType: 'payment',
        referenceId: paymentId,
        metadata: {
          paymentId,
          testSeriesId: testSeriesId || null,
          seriesTitle,
          amount: toNumber(amount),
          currency,
        },
        dedupeKey: `payment_confirmed:${paymentId}`,
      },
      connection
    );
  } catch (err) {
    console.error('Failed to create payment confirmation notification:', err.message);
  }
}

module.exports = {
  ALLOWED_NOTIFICATION_TYPES,
  ALLOWED_TARGET_AUDIENCES,
  createNotification,
  getUserNotifications,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  syncExpiringSeriesNotifications,
  notifyNewTestPublished,
  notifyResultPublished,
  notifyPaymentConfirmed,
};

