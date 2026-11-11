const { createDbConnection } = require('../config/db');

const createUser = async (username, passwordHash) => {
  let connection;
  try {
    connection = await createDbConnection();
    const [result] = await connection.execute(
      'INSERT INTO users (username, password_hash, role, last_active_at) VALUES (?, ?, ?, NOW())',
      [username, passwordHash, 'student']
    );
    return result.insertId;
  } finally {
    if (connection) await connection.end();
  }
};

const recordUserActivity = async (userId, activityType, referenceId = null, isLogin = false) => {
  let connection;
  try {
    connection = await createDbConnection();
    if (isLogin) {
      await connection.execute(
        'UPDATE users SET last_login_at = NOW(), last_active_at = NOW() WHERE id = ?',
        [userId]
      );
    } else {
      await connection.execute(
        'UPDATE users SET last_active_at = NOW() WHERE id = ?',
        [userId]
      );
    }
    await connection.execute(
      'INSERT INTO user_activity_logs (user_id, activity_type, reference_id) VALUES (?, ?, ?)',
      [userId, activityType, referenceId]
    );
  } catch (err) {
    console.error('Failed to record user activity:', err.message);
  } finally {
    if (connection) await connection.end();
  }
};

const findUserByUsername = async (username) => {
  let connection;
  try {
    connection = await createDbConnection();
    const [rows] = await connection.execute(
      'SELECT * FROM users WHERE username = ?',
      [username]
    );
    return rows.length ? rows[0] : null;
  } finally {
    if (connection) await connection.end();
  }
};

const getAllUsers = async (filters = {}) => {
  let connection;
  try {
    connection = await createDbConnection();
    let query = `
      SELECT id, username, role, status, subscription_status, created_at, name, email, phone, last_login_at, last_active_at
      FROM users
      WHERE role = "student"
    `;
    const queryParams = [];

    if (filters.search) {
      query += ' AND (username LIKE ? OR name LIKE ? OR email LIKE ? OR phone LIKE ?)';
      const searchParam = `%${filters.search}%`;
      queryParams.push(searchParam, searchParam, searchParam, searchParam);
    }
    if (filters.status) {
      query += ' AND status = ?';
      queryParams.push(filters.status);
    }
    if (filters.subscription) {
      query += ' AND subscription_status = ?';
      queryParams.push(filters.subscription);
    }
    if (filters.dateFrom) {
      query += ' AND DATE(created_at) >= ?';
      queryParams.push(filters.dateFrom);
    }
    if (filters.dateTo) {
      query += ' AND DATE(created_at) <= ?';
      queryParams.push(filters.dateTo);
    }

    query += ' ORDER BY created_at DESC';

    const [rows] = await connection.query(query, queryParams);
    return rows;
  } finally {
    if (connection) await connection.end();
  }
};

const getUserById = async (userId) => {
  let connection;
  try {
    connection = await createDbConnection();
    const [rows] = await connection.execute(
      `SELECT id, username, role, status, subscription_status, created_at, name, email, phone, last_login_at, last_active_at
       FROM users
       WHERE id = ?`,
      [userId]
    );
    return rows.length ? rows[0] : null;
  } finally {
    if (connection) await connection.end();
  }
};

const updateUserStatus = async (userId, status) => {
  let connection;
  try {
    connection = await createDbConnection();
    const [result] = await connection.execute(
      'UPDATE users SET status = ? WHERE id = ?',
      [status, userId]
    );
    return result.affectedRows > 0;
  } finally {
    if (connection) await connection.end();
  }
};

const updateUserPassword = async (userId, passwordHash) => {
  let connection;
  try {
    connection = await createDbConnection();
    const [result] = await connection.execute(
      'UPDATE users SET password_hash = ? WHERE id = ?',
      [passwordHash, userId]
    );
    return result.affectedRows > 0;
  } finally {
    if (connection) await connection.end();
  }
};

const updateUserDetails = async (userId, details) => {
  let connection;
  try {
    connection = await createDbConnection();
    const fields = [];
    const values = [];

    if (details.name !== undefined) {
      fields.push('name = ?');
      values.push(details.name);
    }
    if (details.email !== undefined) {
      fields.push('email = ?');
      values.push(details.email);
    }
    if (details.phone !== undefined) {
      fields.push('phone = ?');
      values.push(details.phone);
    }

    if (fields.length === 0) {
      const [rows] = await connection.execute('SELECT id FROM users WHERE id = ?', [userId]);
      return rows.length > 0;
    }

    values.push(userId);
    const [result] = await connection.execute(
      `UPDATE users SET ${fields.join(', ')} WHERE id = ?`,
      values
    );
    return result.affectedRows > 0;
  } finally {
    if (connection) await connection.end();
  }
};

const logAdminUserAction = async (userId, activityType, referenceId = null, metadata = null) => {
  let connection;
  try {
    connection = await createDbConnection();
    await connection.query(
      'INSERT INTO user_activity_logs (user_id, activity_type, reference_id, metadata) VALUES (?, ?, ?, ?)',
      [userId, activityType, referenceId, metadata ? JSON.stringify(metadata) : null]
    );
  } catch (err) {
    console.error('Failed to log admin user action:', err.message);
  } finally {
    if (connection) await connection.end();
  }
};

const updateUserSubscription = async (userId, status) => {
  let connection;
  try {
    connection = await createDbConnection();
    const [result] = await connection.execute(
      'UPDATE users SET subscription_status = ? WHERE id = ?',
      [status, userId]
    );
    return result.affectedRows > 0;
  } finally {
    if (connection) await connection.end();
  }
};

module.exports = {
  createUser,
  recordUserActivity,
  logAdminUserAction,
  findUserByUsername,
  getAllUsers,
  getUserById,
  updateUserStatus,
  updateUserPassword,
  updateUserDetails,
  updateUserSubscription
};
