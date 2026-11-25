const { createDbConnection } = require('../config/db');

// -----------------------------------------
// Topics
// -----------------------------------------
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
    if (data.subject_id !== undefined) { fields.push('subject_id = ?'); values.push(data.subject_id); }

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

async function getTopicById(id) {
  let connection;
  try {
    connection = await createDbConnection();
    const [rows] = await connection.query(`
      SELECT t.*, s.name AS subject_name,
        (SELECT COUNT(*) FROM subtopics WHERE topic_id = t.id) AS subtopic_count,
        (SELECT COUNT(DISTINCT test_id) FROM (
          SELECT id AS test_id FROM tests WHERE topic_id = t.id
          UNION
          SELECT test_id FROM test_topics WHERE topic_id = t.id
        ) combined_tests) AS test_count
      FROM topics t
      LEFT JOIN subjects s ON s.id = t.subject_id
      WHERE t.id = ?
    `, [id]);
    return rows[0] || null;
  } finally {
    if (connection) await connection.end();
  }
}

async function getTopicsBySubject(subjectId) {
  let connection;
  try {
    connection = await createDbConnection();
    const [rows] = await connection.query(`
      SELECT 
        t.*,
        (SELECT COUNT(*) FROM subtopics WHERE topic_id = t.id) AS subtopics_count,
        (SELECT COUNT(DISTINCT test_id) FROM (
          SELECT id AS test_id FROM tests WHERE topic_id = t.id
          UNION
          SELECT test_id FROM test_topics WHERE topic_id = t.id
        ) ct) AS tests_count
      FROM topics t 
      WHERE t.subject_id = ? 
      ORDER BY t.created_at ASC
    `, [subjectId]);
    return rows;
  } finally {
    if (connection) await connection.end();
  }
}

// -----------------------------------------
// Subtopics
// -----------------------------------------
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
    if (data.topic_id !== undefined) { fields.push('topic_id = ?'); values.push(data.topic_id); }

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

async function getSubtopicById(id) {
  let connection;
  try {
    connection = await createDbConnection();
    const [rows] = await connection.query(`
      SELECT st.*, t.name AS topic_name, t.subject_id, s.name AS subject_name
      FROM subtopics st
      JOIN topics t ON t.id = st.topic_id
      JOIN subjects s ON s.id = t.subject_id
      WHERE st.id = ?
    `, [id]);
    return rows[0] || null;
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

// -----------------------------------------
// Full Hierarchy & Topic Tests
// -----------------------------------------

async function getFullHierarchyBySubject(subjectId, options = {}) {
  let connection;
  try {
    connection = await createDbConnection();
    const studentOnly = Boolean(options.studentView || options.publishedOnly);

    const subjectQuery = studentOnly
      ? 'SELECT * FROM subjects WHERE id = ? AND is_active = TRUE'
      : 'SELECT * FROM subjects WHERE id = ?';
    const [subjectRows] = await connection.query(subjectQuery, [subjectId]);
    if (subjectRows.length === 0) return null;
    const subject = subjectRows[0];

    const topicActiveClause = studentOnly ? 'AND t.is_active = TRUE' : '';
    const testFilterClause = studentOnly ? 'AND is_active = TRUE AND is_published = TRUE' : '';
    const tstFilterClause = studentOnly ? 'AND tst.is_active = TRUE AND tst.is_published = TRUE' : '';

    const [topics] = await connection.query(`
      SELECT 
        t.*,
        (SELECT COUNT(DISTINCT test_id) FROM (
          SELECT id AS test_id FROM tests WHERE topic_id = t.id ${testFilterClause}
          UNION
          SELECT tt.test_id FROM test_topics tt
          JOIN tests tst ON tst.id = tt.test_id
          WHERE tt.topic_id = t.id ${tstFilterClause}
        ) ct) AS tests_count
      FROM topics t
      WHERE t.subject_id = ? ${topicActiveClause}
      ORDER BY t.created_at ASC
    `, [subjectId]);

    const topicIds = topics.map(t => t.id);
    let subtopicsByTopic = {};
    if (topicIds.length > 0) {
      const subtopicActiveClause = studentOnly ? 'AND is_active = TRUE' : '';
      const [subtopics] = await connection.query(
        `SELECT * FROM subtopics WHERE topic_id IN (?) ${subtopicActiveClause} ORDER BY created_at ASC`,
        [topicIds]
      );
      subtopicsByTopic = subtopics.reduce((acc, st) => {
        if (!acc[st.topic_id]) acc[st.topic_id] = [];
        acc[st.topic_id].push(st);
        return acc;
      }, {});
    }

    const topicsWithSubtopics = topics.map(t => ({
      ...t,
      subtopics: subtopicsByTopic[t.id] || []
    }));

    return {
      ...subject,
      topics: topicsWithSubtopics
    };
  } finally {
    if (connection) await connection.end();
  }
}

async function getFullHierarchyByExam(examId, options = {}) {
  let connection;
  try {
    connection = await createDbConnection();
    const studentOnly = Boolean(options.studentView || options.publishedOnly);

    const examQuery = studentOnly
      ? 'SELECT * FROM exams WHERE id = ? AND is_active = TRUE'
      : 'SELECT * FROM exams WHERE id = ?';
    const [examRows] = await connection.query(examQuery, [examId]);
    if (examRows.length === 0) return null;
    const exam = examRows[0];

    // Fetch subjects mapped to this exam
    const [subjects] = await connection.query(`
      SELECT s.*, es.display_order
      FROM subjects s
      JOIN exam_subjects es ON s.id = es.subject_id
      WHERE es.exam_id = ? AND s.is_active = TRUE
      ORDER BY es.display_order ASC, s.id ASC
    `, [examId]);

    const subjectIds = subjects.map(s => s.id);
    let topicsBySubject = {};
    let subtopicsByTopic = {};

    if (subjectIds.length > 0) {
      const topicActiveClause = studentOnly ? 'AND t.is_active = TRUE' : '';
      const testFilterClause = studentOnly ? 'AND is_active = TRUE AND is_published = TRUE' : '';
      const tstFilterClause = studentOnly ? 'AND tst.is_active = TRUE AND tst.is_published = TRUE' : '';

      const [topics] = await connection.query(`
        SELECT 
          t.*,
          (SELECT COUNT(DISTINCT test_id) FROM (
            SELECT id AS test_id FROM tests WHERE topic_id = t.id AND (exam_id = ? OR exam_id IS NULL) ${testFilterClause}
            UNION
            SELECT tt.test_id FROM test_topics tt 
            JOIN tests tst ON tst.id = tt.test_id 
            WHERE tt.topic_id = t.id AND (tst.exam_id = ? OR tst.exam_id IS NULL) ${tstFilterClause}
          ) ct) AS tests_count
        FROM topics t
        WHERE t.subject_id IN (?) ${topicActiveClause}
        ORDER BY t.created_at ASC
      `, [examId, examId, subjectIds]);

      const topicIds = topics.map(t => t.id);
      if (topicIds.length > 0) {
        const subtopicActiveClause = studentOnly ? 'AND is_active = TRUE' : '';
        const [subtopics] = await connection.query(
          `SELECT * FROM subtopics WHERE topic_id IN (?) ${subtopicActiveClause} ORDER BY created_at ASC`,
          [topicIds]
        );
        subtopicsByTopic = subtopics.reduce((acc, st) => {
          if (!acc[st.topic_id]) acc[st.topic_id] = [];
          acc[st.topic_id].push(st);
          return acc;
        }, {});
      }

      topicsBySubject = topics.reduce((acc, t) => {
        if (!acc[t.subject_id]) acc[t.subject_id] = [];
        acc[t.subject_id].push({
          ...t,
          subtopics: subtopicsByTopic[t.id] || []
        });
        return acc;
      }, {});
    }

    const subjectsWithTopics = subjects.map(s => ({
      ...s,
      topics: topicsBySubject[s.id] || []
    }));

    return {
      ...exam,
      subjects: subjectsWithTopics
    };
  } finally {
    if (connection) await connection.end();
  }
}

async function getTestsByTopic(topicId, filters = {}) {
  const testModel = require('./testModel');
  return testModel.getAllTests({ ...filters, topic_id: topicId });
}

module.exports = {
  createTopic,
  updateTopic,
  deleteTopic,
  getTopicById,
  getTopicsBySubject,
  createSubtopic,
  updateSubtopic,
  deleteSubtopic,
  getSubtopicById,
  getSubtopicsByTopic,
  getFullHierarchyBySubject,
  getFullHierarchyByExam,
  getTestsByTopic
};
