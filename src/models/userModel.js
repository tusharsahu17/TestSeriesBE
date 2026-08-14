const { createDbConnection } = require('../config/db');

const createUser = async (username, passwordHash) => {
  let connection;
  try {
    connection = await createDbConnection();
    const [result] = await connection.execute(
      'INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)',
      [username, passwordHash, 'student']
    );
    return result.insertId;
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
    let query = 'SELECT id, username, role, status, subscription_status, created_at, name, email, phone FROM users WHERE role = "student"';
    const queryParams = [];

    if (filters.search) {
      query += ' AND (username LIKE ? OR name LIKE ? OR email LIKE ?)';
      const searchParam = `%${filters.search}%`;
      queryParams.push(searchParam, searchParam, searchParam);
    }
    if (filters.status) {
      query += ' AND status = ?';
      queryParams.push(filters.status);
    }
    if (filters.subscription) {
      query += ' AND subscription_status = ?';
      queryParams.push(filters.subscription);
    }
    if (filters.dateFrom && filters.dateTo) {
      query += ' AND created_at BETWEEN ? AND ?';
      queryParams.push(filters.dateFrom, filters.dateTo);
    }

    query += ' ORDER BY created_at DESC';

    const [rows] = await connection.execute(query, queryParams);
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
      'SELECT id, username, role, status, subscription_status, created_at, name, email, phone FROM users WHERE id = ?',
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
    const { name, email, phone } = details;
    const [result] = await connection.execute(
      'UPDATE users SET name = ?, email = ?, phone = ? WHERE id = ?',
      [name, email, phone, userId]
    );
    return result.affectedRows > 0;
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
  findUserByUsername,
  getAllUsers,
  getUserById,
  updateUserStatus,
  updateUserPassword,
  updateUserDetails,
  updateUserSubscription
};
