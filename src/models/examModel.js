const { createDbConnection } = require('../config/db');

function generateSlug(text) {
  return text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^\w\-]+/g, '')
    .replace(/\-\-+/g, '-')
    .replace(/^-+/, '')
    .replace(/-+$/, '');
}

async function getExams() {
  let connection;
  try {
    connection = await createDbConnection();
    const [rows] = await connection.query('SELECT * FROM exams ORDER BY id DESC');
    return rows;
  } finally {
    if (connection) await connection.end();
  }
}

async function getExamById(examId) {
  let connection;
  try {
    connection = await createDbConnection();
    const [rows] = await connection.query('SELECT * FROM exams WHERE id = ?', [examId]);
    return rows[0];
  } finally {
    if (connection) await connection.end();
  }
}

async function createExam(data) {
  let connection;
  try {
    connection = await createDbConnection();
    const {
      name,
      description,
      category = 'Standard',
      exam_type = 'General',
      duration_minutes = null,
      total_questions = null,
      total_marks = null,
      passing_marks = null,
      max_attempts = null,
      difficulty = 'Medium',
      image_url = null,
      is_active = 1
    } = data;

    let baseSlug = generateSlug(data.slug || name || 'exam') || 'exam';
    let slug = baseSlug;
    const [existing] = await connection.query('SELECT id FROM exams WHERE slug = ?', [slug]);
    if (existing.length > 0) {
      slug = `${baseSlug}-${Date.now()}`;
    }

    const [result] = await connection.query(
      `INSERT INTO exams 
       (name, slug, description, category, exam_type, duration_minutes, total_questions, total_marks, passing_marks, max_attempts, difficulty, image_url, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        name,
        slug,
        description || null,
        category,
        exam_type,
        duration_minutes,
        total_questions,
        total_marks,
        passing_marks,
        max_attempts,
        difficulty,
        image_url,
        is_active !== undefined ? is_active : 1
      ]
    );
    return result.insertId;
  } finally {
    if (connection) await connection.end();
  }
}

async function updateExam(id, data) {
  let connection;
  try {
    connection = await createDbConnection();
    const {
      name,
      description,
      category,
      exam_type,
      duration_minutes,
      total_questions,
      total_marks,
      passing_marks,
      max_attempts,
      difficulty,
      image_url,
      is_active
    } = data;

    const updates = [];
    const values = [];

    if (name !== undefined) {
      updates.push('name = ?');
      values.push(name);
    }
    if (description !== undefined) {
      updates.push('description = ?');
      values.push(description);
    }
    if (category !== undefined) {
      updates.push('category = ?');
      values.push(category);
    }
    if (exam_type !== undefined) {
      updates.push('exam_type = ?');
      values.push(exam_type);
    }
    if (duration_minutes !== undefined) {
      updates.push('duration_minutes = ?');
      values.push(duration_minutes);
    }
    if (total_questions !== undefined) {
      updates.push('total_questions = ?');
      values.push(total_questions);
    }
    if (total_marks !== undefined) {
      updates.push('total_marks = ?');
      values.push(total_marks);
    }
    if (passing_marks !== undefined) {
      updates.push('passing_marks = ?');
      values.push(passing_marks);
    }
    if (max_attempts !== undefined) {
      updates.push('max_attempts = ?');
      values.push(max_attempts);
    }
    if (difficulty !== undefined) {
      updates.push('difficulty = ?');
      values.push(difficulty);
    }
    if (image_url !== undefined) {
      updates.push('image_url = ?');
      values.push(image_url);
    }
    if (is_active !== undefined) {
      updates.push('is_active = ?');
      values.push(is_active);
    }

    if (updates.length === 0) return true;

    values.push(id);
    await connection.query(`UPDATE exams SET ${updates.join(', ')} WHERE id = ?`, values);
    return true;
  } finally {
    if (connection) await connection.end();
  }
}

async function deleteExam(id) {
  let connection;
  try {
    connection = await createDbConnection();
    await connection.query('DELETE FROM exams WHERE id = ?', [id]);
    return true;
  } finally {
    if (connection) await connection.end();
  }
}

async function getSubjectsForExam(examId) {
  let connection;
  try {
    connection = await createDbConnection();
    const [rows] = await connection.query(`
      SELECT 
        s.*, 
        es.display_order,
        (SELECT COUNT(*) FROM topics WHERE subject_id = s.id AND is_active = TRUE) AS topics_count,
        (SELECT COUNT(DISTINCT test_id) FROM (
          SELECT id AS test_id FROM tests WHERE subject_id = s.id AND (exam_id = ? OR exam_id IS NULL) AND is_active = TRUE AND is_published = TRUE
          UNION
          SELECT tt.test_id FROM test_topics tt 
          JOIN tests tst ON tst.id = tt.test_id 
          WHERE tst.subject_id = s.id AND (tst.exam_id = ? OR tst.exam_id IS NULL) AND tst.is_active = TRUE AND tst.is_published = TRUE
        ) ct) AS tests_count
      FROM subjects s 
      JOIN exam_subjects es ON s.id = es.subject_id 
      WHERE es.exam_id = ? AND s.is_active = TRUE
      ORDER BY es.display_order ASC, s.id ASC
    `, [examId, examId, examId]);
    return rows;
  } finally {
    if (connection) await connection.end();
  }
}

async function addSubjectToExam(examId, subjectId, displayOrder = 1) {
  let connection;
  try {
    connection = await createDbConnection();
    await connection.query(
      `INSERT INTO exam_subjects (exam_id, subject_id, display_order)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE display_order = VALUES(display_order)`,
      [examId, subjectId, displayOrder]
    );
    return true;
  } finally {
    if (connection) await connection.end();
  }
}

async function removeSubjectFromExam(examId, subjectId) {
  let connection;
  try {
    connection = await createDbConnection();
    await connection.query(
      'DELETE FROM exam_subjects WHERE exam_id = ? AND subject_id = ?',
      [examId, subjectId]
    );
    return true;
  } finally {
    if (connection) await connection.end();
  }
}

async function getTestsForExam(examId, filters = {}) {
  const testModel = require('./testModel');
  return testModel.getAllTests({ ...filters, exam_id: examId });
}

module.exports = {
  getExams,
  getExamById,
  createExam,
  updateExam,
  deleteExam,
  getSubjectsForExam,
  addSubjectToExam,
  removeSubjectFromExam,
  getTestsForExam
};
