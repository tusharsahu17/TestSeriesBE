const { createDbConnection } = require('../config/db');

const createAdmin = async (username, passwordHash) => {
  let connection;
  try {
    connection = await createDbConnection();
    const [result] = await connection.execute(
      'INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)',
      [username, passwordHash, 'admin']
    );
    return result.insertId;
  } finally {
    if (connection) await connection.end();
  }
};

const findAdminByUsername = async (username) => {
  let connection;
  try {
    connection = await createDbConnection();
    const [rows] = await connection.execute(
      'SELECT * FROM users WHERE username = ? AND role = ?',
      [username, 'admin']
    );
    return rows.length ? rows[0] : null;
  } finally {
    if (connection) await connection.end();
  }
};

module.exports = {
  createAdmin,
  findAdminByUsername
};
