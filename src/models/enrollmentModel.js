const { createDbConnection } = require('../config/db');

async function enrollStudent(data) {
  let connection;
  try {
    connection = await createDbConnection();
    await connection.beginTransaction();

    const {
      user_id,
      test_series_id,
      payment_id = null,
      enrollment_type,
      status = 'ACTIVE',
      expires_at = null
    } = data;

    const [users] = await connection.query('SELECT id FROM users WHERE id = ?', [user_id]);
    if (users.length === 0) {
      const err = new Error('User not found');
      err.status = 404;
      throw err;
    }

    const [seriesRows] = await connection.query(
      'SELECT id, is_paid, validity_days FROM test_series WHERE id = ?',
      [test_series_id]
    );
    if (seriesRows.length === 0) {
      const err = new Error('Test series not found');
      err.status = 404;
      throw err;
    }

    const series = seriesRows[0];
    const resolvedType = enrollment_type || (series.is_paid ? 'PAID' : 'FREE');

    let resolvedExpiresAt = expires_at;
    if (!resolvedExpiresAt && series.validity_days) {
      const expiry = new Date();
      expiry.setDate(expiry.getDate() + Number(series.validity_days));
      resolvedExpiresAt = expiry;
    }

    const [result] = await connection.query(
      `INSERT INTO test_series_enrollments
        (user_id, test_series_id, payment_id, enrollment_type, status, expires_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [user_id, test_series_id, payment_id, resolvedType, status, resolvedExpiresAt]
    );

    if (resolvedType === 'PAID' && status === 'ACTIVE') {
      await connection.query(
        'UPDATE users SET subscription_status = ?, last_active_at = NOW() WHERE id = ?',
        ['active', user_id]
      );
    } else {
      await connection.query('UPDATE users SET last_active_at = NOW() WHERE id = ?', [user_id]);
    }

    await connection.query(
      'INSERT INTO user_activity_logs (user_id, activity_type, reference_id) VALUES (?, ?, ?)',
      [user_id, 'SERIES_ENROLL', test_series_id]
    );

    await connection.commit();
    return result.insertId;
  } catch (error) {
    if (connection) await connection.rollback();
    throw error;
  } finally {
    if (connection) await connection.end();
  }
}

async function getAllEnrollments(filters = {}) {
  let connection;
  try {
    connection = await createDbConnection();
    let query = `
      SELECT
        e.*,
        u.username,
        u.name AS user_name,
        u.email AS user_email,
        ts.title AS test_series_title,
        ts.price AS test_series_price
      FROM test_series_enrollments e
      JOIN users u ON e.user_id = u.id
      JOIN test_series ts ON e.test_series_id = ts.id
      WHERE 1=1
    `;
    const values = [];

    if (filters.user_id) {
      query += ' AND e.user_id = ?';
      values.push(filters.user_id);
    }
    if (filters.test_series_id) {
      query += ' AND e.test_series_id = ?';
      values.push(filters.test_series_id);
    }
    if (filters.status) {
      query += ' AND e.status = ?';
      values.push(filters.status);
    }
    if (filters.enrollment_type) {
      query += ' AND e.enrollment_type = ?';
      values.push(filters.enrollment_type);
    }

    query += ' ORDER BY e.enrolled_at DESC';
    const [rows] = await connection.query(query, values);
    return rows;
  } finally {
    if (connection) await connection.end();
  }
}

async function getEnrollmentById(id) {
  let connection;
  try {
    connection = await createDbConnection();
    const [rows] = await connection.query(
      `SELECT
         e.*,
         u.username,
         u.name AS user_name,
         u.email AS user_email,
         ts.title AS test_series_title
       FROM test_series_enrollments e
       JOIN users u ON e.user_id = u.id
       JOIN test_series ts ON e.test_series_id = ts.id
       WHERE e.id = ?`,
      [id]
    );
    return rows[0] || null;
  } finally {
    if (connection) await connection.end();
  }
}

async function updateEnrollmentStatus(id, status) {
  let connection;
  try {
    connection = await createDbConnection();
    const [result] = await connection.query(
      'UPDATE test_series_enrollments SET status = ? WHERE id = ?',
      [status, id]
    );
    return result.affectedRows > 0;
  } finally {
    if (connection) await connection.end();
  }
}

module.exports = {
  enrollStudent,
  getAllEnrollments,
  getEnrollmentById,
  updateEnrollmentStatus
};

