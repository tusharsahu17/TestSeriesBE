const { createDbConnection } = require('../config/db');

// Topics
async function createTopic(subjectId, data) {
  let connection;
  try {
    connection = await createDbConnection();
    const { name, description, is_active } = data;
    const [result] = await connection.query(
      'INSERT INTO topics (subject_id, name, description, is_active) VALUES (?, ?, ?, ?)',
      [subjectId, name, description, is_active !== undefined ? is_active : true]
    );
    return result.insertId;
  } finally {
    if (connection) await connection.end();
  }
}

async function updateTopic(id, data) {
  let connection;
  try {
    connection = await createDbConnection();
    const fields = [];
    const values = [];

    if (data.name !== undefined) { fields.push('name = ?'); values.push(data.name); }
    if (data.description !== undefined) { fields.push('description = ?'); values.push(data.description); }
    if (data.is_active !== undefined) { fields.push('is_active = ?'); values.push(data.is_active); }

    if (fields.length === 0) return true;

    values.push(id);
    await connection.query(`UPDATE topics SET ${fields.join(', ')} WHERE id = ?`, values);
    return true;
  } finally {
    if (connection) await connection.end();
  }
}

async function deleteTopic(id) {
  let connection;
  try {
    connection = await createDbConnection();
    await connection.query('DELETE FROM topics WHERE id = ?', [id]);
    return true;
  } finally {
    if (connection) await connection.end();
  }
}

async function getTopicsBySubject(subjectId) {
  let connection;
  try {
    connection = await createDbConnection();
    const [rows] = await connection.query('SELECT * FROM topics WHERE subject_id = ? ORDER BY created_at ASC', [subjectId]);
    return rows;
  } finally {
    if (connection) await connection.end();
  }
}

// Subtopics
async function createSubtopic(topicId, data) {
  let connection;
  try {
    connection = await createDbConnection();
    const { name, description, is_active } = data;
    const [result] = await connection.query(
      'INSERT INTO subtopics (topic_id, name, description, is_active) VALUES (?, ?, ?, ?)',
      [topicId, name, description, is_active !== undefined ? is_active : true]
    );
    return result.insertId;
  } finally {
    if (connection) await connection.end();
  }
}

async function updateSubtopic(id, data) {
  let connection;
  try {
    connection = await createDbConnection();
    const fields = [];
    const values = [];

    if (data.name !== undefined) { fields.push('name = ?'); values.push(data.name); }
    if (data.description !== undefined) { fields.push('description = ?'); values.push(data.description); }
    if (data.is_active !== undefined) { fields.push('is_active = ?'); values.push(data.is_active); }

    if (fields.length === 0) return true;

    values.push(id);
    await connection.query(`UPDATE subtopics SET ${fields.join(', ')} WHERE id = ?`, values);
    return true;
  } finally {
    if (connection) await connection.end();
  }
}

async function deleteSubtopic(id) {
  let connection;
  try {
    connection = await createDbConnection();
    await connection.query('DELETE FROM subtopics WHERE id = ?', [id]);
    return true;
  } finally {
    if (connection) await connection.end();
  }
}

async function getSubtopicsByTopic(topicId) {
  let connection;
  try {
    connection = await createDbConnection();
    const [rows] = await connection.query('SELECT * FROM subtopics WHERE topic_id = ? ORDER BY created_at ASC', [topicId]);
    return rows;
  } finally {
    if (connection) await connection.end();
  }
}

module.exports = {
  createTopic,
  updateTopic,
  deleteTopic,
  getTopicsBySubject,
  createSubtopic,
  updateSubtopic,
  deleteSubtopic,
  getSubtopicsByTopic
};
