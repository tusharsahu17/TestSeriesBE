const { createDbConnection } = require('../config/db');

async function activatePaidAccess(connection, { paymentId, userId, testSeriesId, subscriptionId }) {
  if (testSeriesId) {
    const [existing] = await connection.query(
      'SELECT id FROM test_series_enrollments WHERE payment_id = ?',
      [paymentId]
    );
    if (existing.length === 0) {
      const [seriesRows] = await connection.query(
        'SELECT validity_days FROM test_series WHERE id = ?',
        [testSeriesId]
      );
      let expiresAt = null;
      if (seriesRows.length > 0 && seriesRows[0].validity_days) {
        expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + Number(seriesRows[0].validity_days));
      }
      await connection.query(
        `INSERT INTO test_series_enrollments
          (user_id, test_series_id, payment_id, enrollment_type, status, expires_at)
         VALUES (?, ?, ?, 'PAID', 'ACTIVE', ?)`,
        [userId, testSeriesId, paymentId, expiresAt]
      );
    } else {
      await connection.query(
        "UPDATE test_series_enrollments SET status = 'ACTIVE' WHERE payment_id = ?",
        [paymentId]
      );
    }
  }

  if (subscriptionId) {
    await connection.query(
      "UPDATE subscriptions SET status = 'ACTIVE' WHERE id = ?",
      [subscriptionId]
    );
  }

  await connection.query(
    "UPDATE users SET subscription_status = 'active', last_active_at = NOW() WHERE id = ?",
    [userId]
  );
}

async function createPayment(data) {
  let connection;
  try {
    connection = await createDbConnection();
    await connection.beginTransaction();

    const {
      user_id,
      test_series_id = null,
      subscription_id = null,
      order_id = null,
      transaction_id = null,
      amount,
      currency = 'INR',
      payment_method = null,
      payment_gateway = null,
      status = 'PENDING',
      paid_at = null,
      notes = null,
      auto_enroll = true
    } = data;

    const [users] = await connection.query('SELECT id FROM users WHERE id = ?', [user_id]);
    if (users.length === 0) {
      const err = new Error('User not found');
      err.status = 404;
      throw err;
    }

    if (test_series_id) {
      const [series] = await connection.query('SELECT id FROM test_series WHERE id = ?', [test_series_id]);
      if (series.length === 0) {
        const err = new Error('Test series not found');
        err.status = 404;
        throw err;
      }
    }

    const resolvedPaidAt = status === 'SUCCESS' ? (paid_at || new Date()) : paid_at;

    const [result] = await connection.query(
      `INSERT INTO payments (
         user_id, test_series_id, subscription_id, order_id, transaction_id,
         amount, currency, payment_method, payment_gateway, status, paid_at, notes
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        user_id, test_series_id, subscription_id, order_id, transaction_id,
        amount, currency, payment_method, payment_gateway, status, resolvedPaidAt, notes
      ]
    );

    const paymentId = result.insertId;

    if (status === 'SUCCESS' && auto_enroll) {
      await activatePaidAccess(connection, {
        paymentId,
        userId: user_id,
        testSeriesId: test_series_id,
        subscriptionId: subscription_id
      });
    }

    await connection.commit();
    return paymentId;
  } catch (error) {
    if (connection) await connection.rollback();
    throw error;
  } finally {
    if (connection) await connection.end();
  }
}

async function updatePaymentStatus(id, data) {
  let connection;
  try {
    connection = await createDbConnection();
    await connection.beginTransaction();

    const [rows] = await connection.query('SELECT * FROM payments WHERE id = ?', [id]);
    if (rows.length === 0) {
      await connection.rollback();
      return null;
    }
    const payment = rows[0];
    const { status, transaction_id, paid_at, notes } = data;

    const fields = ['status = ?'];
    const values = [status];

    if (transaction_id !== undefined) {
      fields.push('transaction_id = ?');
      values.push(transaction_id);
    }
    if (notes !== undefined) {
      fields.push('notes = ?');
      values.push(notes);
    }
    if (status === 'SUCCESS') {
      fields.push('paid_at = ?');
      values.push(paid_at || payment.paid_at || new Date());
    }

    values.push(id);
    await connection.query(`UPDATE payments SET ${fields.join(', ')} WHERE id = ?`, values);

    if (status === 'SUCCESS') {
      await activatePaidAccess(connection, {
        paymentId: id,
        userId: payment.user_id,
        testSeriesId: payment.test_series_id,
        subscriptionId: payment.subscription_id
      });
    }

    await connection.commit();
    return true;
  } catch (error) {
    if (connection) await connection.rollback();
    throw error;
  } finally {
    if (connection) await connection.end();
  }
}

async function refundPayment(id, data = {}) {
  let connection;
  try {
    connection = await createDbConnection();
    await connection.beginTransaction();

    const [rows] = await connection.query('SELECT * FROM payments WHERE id = ?', [id]);
    if (rows.length === 0) {
      await connection.rollback();
      return null;
    }
    const payment = rows[0];

    const refundAmount = data.refund_amount !== undefined ? Number(data.refund_amount) : Number(payment.amount);
    const refundReason = data.refund_reason || null;

    await connection.query(
      `UPDATE payments
       SET status = 'REFUNDED', refund_amount = ?, refund_reason = ?, refunded_at = COALESCE(?, NOW())
       WHERE id = ?`,
      [refundAmount, refundReason, data.refunded_at || null, id]
    );

    await connection.query(
      "UPDATE test_series_enrollments SET status = 'CANCELLED' WHERE payment_id = ?",
      [id]
    );

    if (payment.subscription_id) {
      await connection.query(
        "UPDATE subscriptions SET status = 'CANCELLED' WHERE id = ?",
        [payment.subscription_id]
      );
    }

    await connection.commit();
    return true;
  } catch (error) {
    if (connection) await connection.rollback();
    throw error;
  } finally {
    if (connection) await connection.end();
  }
}

async function getAllPayments(filters = {}) {
  let connection;
  try {
    connection = await createDbConnection();
    let query = `
      SELECT
        p.*,
        u.username,
        u.name AS user_name,
        u.email AS user_email,
        ts.title AS test_series_title
      FROM payments p
      JOIN users u ON p.user_id = u.id
      LEFT JOIN test_series ts ON p.test_series_id = ts.id
      WHERE 1=1
    `;
    const values = [];

    if (filters.status) {
      query += ' AND p.status = ?';
      values.push(filters.status);
    }
    if (filters.user_id) {
      query += ' AND p.user_id = ?';
      values.push(filters.user_id);
    }
    if (filters.test_series_id) {
      query += ' AND p.test_series_id = ?';
      values.push(filters.test_series_id);
    }
    if (filters.dateFrom && filters.dateTo) {
      query += ' AND p.created_at BETWEEN ? AND ?';
      values.push(filters.dateFrom, filters.dateTo);
    }

    query += ' ORDER BY p.created_at DESC';
    const [rows] = await connection.query(query, values);
    return rows;
  } finally {
    if (connection) await connection.end();
  }
}

async function getPaymentById(id) {
  let connection;
  try {
    connection = await createDbConnection();
    const [rows] = await connection.query(
      `SELECT
         p.*,
         u.username,
         u.name AS user_name,
         u.email AS user_email,
         ts.title AS test_series_title
       FROM payments p
       JOIN users u ON p.user_id = u.id
       LEFT JOIN test_series ts ON p.test_series_id = ts.id
       WHERE p.id = ?`,
      [id]
    );
    return rows[0] || null;
  } finally {
    if (connection) await connection.end();
  }
}

async function createSubscription(data) {
  let connection;
  try {
    connection = await createDbConnection();
    await connection.beginTransaction();

    const {
      user_id,
      plan_name,
      plan_type = 'SERIES_PASS',
      test_series_id = null,
      amount = 0,
      status = 'ACTIVE',
      starts_at = null,
      expires_at = null
    } = data;

    const [users] = await connection.query('SELECT id FROM users WHERE id = ?', [user_id]);
    if (users.length === 0) {
      const err = new Error('User not found');
      err.status = 404;
      throw err;
    }

    const [result] = await connection.query(
      `INSERT INTO subscriptions
        (user_id, plan_name, plan_type, test_series_id, amount, status, starts_at, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, COALESCE(?, NOW()), ?)`,
      [user_id, plan_name, plan_type, test_series_id, amount, status, starts_at, expires_at]
    );

    if (status === 'ACTIVE') {
      await connection.query(
        "UPDATE users SET subscription_status = 'active', last_active_at = NOW() WHERE id = ?",
        [user_id]
      );
    }

    await connection.commit();
    return result.insertId;
  } catch (error) {
    if (connection) await connection.rollback();
    throw error;
  } finally {
    if (connection) await connection.end();
  }
}

async function getAllSubscriptions(filters = {}) {
  let connection;
  try {
    connection = await createDbConnection();
    let query = `
      SELECT
        s.*,
        u.username,
        u.name AS user_name,
        u.email AS user_email,
        ts.title AS test_series_title
      FROM subscriptions s
      JOIN users u ON s.user_id = u.id
      LEFT JOIN test_series ts ON s.test_series_id = ts.id
      WHERE 1=1
    `;
    const values = [];

    if (filters.user_id) {
      query += ' AND s.user_id = ?';
      values.push(filters.user_id);
    }
    if (filters.status) {
      query += ' AND s.status = ?';
      values.push(filters.status);
    }

    query += ' ORDER BY s.created_at DESC';
    const [rows] = await connection.query(query, values);
    return rows;
  } finally {
    if (connection) await connection.end();
  }
}

async function updateSubscriptionStatus(id, status) {
  let connection;
  try {
    connection = await createDbConnection();
    const [result] = await connection.query(
      'UPDATE subscriptions SET status = ? WHERE id = ?',
      [status, id]
    );
    return result.affectedRows > 0;
  } finally {
    if (connection) await connection.end();
  }
}

module.exports = {
  createPayment,
  updatePaymentStatus,
  refundPayment,
  getAllPayments,
  getPaymentById,
  createSubscription,
  getAllSubscriptions,
  updateSubscriptionStatus
};

