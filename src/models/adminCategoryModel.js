const { createDbConnection } = require('../config/db');

async function createCategory(data) {
  let connection;
  try {
    connection = await createDbConnection();
    const { name, description } = data;
    const [result] = await connection.query(
      'INSERT INTO categories (name, description) VALUES (?, ?)',
      [name, description]
    );
    return result.insertId;
  } finally {
    if (connection) await connection.end();
  }
}

async function getAllCategories() {
  let connection;
  try {
    connection = await createDbConnection();
    const [rows] = await connection.query('SELECT * FROM categories ORDER BY created_at DESC');
    return rows;
  } finally {
    if (connection) await connection.end();
  }
}

async function getCategoryById(id) {
  let connection;
  try {
    connection = await createDbConnection();
    const [rows] = await connection.query('SELECT * FROM categories WHERE id = ?', [id]);
    return rows.length ? rows[0] : null;
  } finally {
    if (connection) await connection.end();
  }
}

async function updateCategory(id, data) {
  let connection;
  try {
    connection = await createDbConnection();
    const { name, description } = data;
    const fields = [];
    const values = [];

    if (name !== undefined) { fields.push('name = ?'); values.push(name); }
    if (description !== undefined) { fields.push('description = ?'); values.push(description); }

    if (fields.length === 0) return true;
    values.push(id);

    const [result] = await connection.query(`UPDATE categories SET ${fields.join(', ')} WHERE id = ?`, values);
    return result.affectedRows > 0;
  } finally {
    if (connection) await connection.end();
  }
}

async function deleteCategory(id) {
  let connection;
  try {
    connection = await createDbConnection();
    const [result] = await connection.query('DELETE FROM categories WHERE id = ?', [id]);
    return result.affectedRows > 0;
  } finally {
    if (connection) await connection.end();
  }
}

module.exports = {
  createCategory,
  getAllCategories,
  getCategoryById,
  updateCategory,
  deleteCategory
};
