const { createDbConnection } = require('../config/db');

const createUser = async (username, passwordHash) => {
  let connection;
  try {
    connection = await createDbConnection();
    const [result] = await connection.execute(
      'INSERT INTO users (username, password_hash) VALUES (?, ?)',
      [username, passwordHash]
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

module.exports = {
  createUser,
  findUserByUsername
};
