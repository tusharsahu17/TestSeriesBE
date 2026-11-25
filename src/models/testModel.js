const { createDbConnection } = require('../config/db');
const { loadTestQuestionsMap } = require('./studentDashboardModel');

async function syncTestQuestionStats(testId, existingConnection = null) {
  let connection = existingConnection;
  const shouldClose = !existingConnection;
  try {
    if (!connection) connection = await createDbConnection();

    const numericId = Number(testId);
    const questionsMap = await loadTestQuestionsMap(connection, [numericId]);
    const questions = questionsMap.get(numericId) || [];

    const totalQuestions = questions.length;
    let totalMarks = 0;
    for (const q of questions) {
      totalMarks += Number(q.marks) > 0 ? Number(q.marks) : 1;
    }

    await connection.query(
      'UPDATE tests SET total_questions = ?, total_marks = ? WHERE id = ?',
      [totalQuestions, totalMarks, numericId]
    );

    return { totalQuestions, totalMarks };
  } finally {
    if (shouldClose && connection) await connection.end();
  }
}

async function getTestById(testId) {
  let connection;
  try {
    connection = await createDbConnection();
    const [rows] = await connection.query(`
      SELECT 
        tests.*, 
        e.name AS exam_name,
        s.name AS subject_name,
        t.name AS topic_name,
        st.name AS subtopic_name
      FROM tests
      LEFT JOIN exams e ON e.id = tests.exam_id
      LEFT JOIN subjects s ON s.id = tests.subject_id
      LEFT JOIN topics t ON t.id = tests.topic_id
      LEFT JOIN subtopics st ON st.id = tests.subtopic_id
      WHERE tests.id = ?
    `, [testId]);

    if (rows.length === 0) return null;
    const test = rows[0];

    // Fetch multi-topic mappings if present in test_topics
    try {
      const [topicRows] = await connection.query(`
        SELECT tt.topic_id, top.name AS topic_name
        FROM test_topics tt
        JOIN topics top ON top.id = tt.topic_id
        WHERE tt.test_id = ?
        ORDER BY top.name ASC
      `, [testId]);
      test.topics = topicRows;
    } catch (e) {
      test.topics = [];
    }

    return test;
  } finally {
    if (connection) await connection.end();
  }
}

function shuffleArray(items) {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

async function getQuestionsForTest(testId) {
  let connection;
  try {
    connection = await createDbConnection();
    const numericId = Number(testId);
    const [testRows] = await connection.query(
      'SELECT randomize_questions, randomize_options FROM tests WHERE id = ?',
      [numericId]
    );
    const randomizeQuestions = Boolean(testRows[0]?.randomize_questions);
    const randomizeOptions = Boolean(testRows[0]?.randomize_options);

    const questionsMap = await loadTestQuestionsMap(connection, [numericId]);
    let questions = questionsMap.get(numericId) || [];

    if (questions.length === 0) return [];

    if (randomizeQuestions) {
      questions = shuffleArray(questions);
    }

    const questionIds = questions.map(q => q.id);

    // Fetch options for these questions
    const [options] = await connection.query(`
      SELECT id, question_id, option_text, option_key, display_order 
      FROM question_options 
      WHERE question_id IN (?)
      ORDER BY display_order ASC, id ASC
    `, [questionIds]);

    // Group options by question_id
    const optionsByQuestion = options.reduce((acc, opt) => {
      if (!acc[opt.question_id]) acc[opt.question_id] = [];
      acc[opt.question_id].push(opt);
      return acc;
    }, {});

    // Attach options to questions (and shuffle options if configured)
    return questions.map(q => {
      const qOptions = optionsByQuestion[q.id] || [];
      return {
        ...q,
        options: randomizeOptions ? shuffleArray(qOptions) : qOptions
      };
    });
  } finally {
    if (connection) await connection.end();
  }
}

async function startTestAttempt(userId, testId) {
  let connection;
  try {
    connection = await createDbConnection();
    
    // Fetch total questions for the attempt record
    const [test] = await connection.query('SELECT total_questions FROM tests WHERE id = ?', [testId]);
    const totalQuestions = test[0]?.total_questions || 0;

    const [result] = await connection.query(`
      INSERT INTO test_attempts (user_id, test_id, total_questions) 
      VALUES (?, ?, ?)
    `, [userId, testId, totalQuestions]);

    await connection.query('UPDATE users SET last_active_at = NOW() WHERE id = ?', [userId]);
    await connection.query(
      'INSERT INTO user_activity_logs (user_id, activity_type, reference_id) VALUES (?, ?, ?)',
      [userId, 'TEST_START', testId]
    );
    
    return { attemptId: result.insertId };
  } finally {
    if (connection) await connection.end();
  }
}

async function createTest(data) {
  let connection;
  try {
    connection = await createDbConnection();
    await connection.beginTransaction();

    const { 
      exam_id, subject_id, topic_id, subtopic_id, topic_ids,
      name, description, duration_minutes, total_questions, 
      total_marks, passing_marks, difficulty, test_type, is_free, is_active, display_order,
      instructions, negative_marking, start_time, end_time, max_attempts, 
      randomize_questions, randomize_options, navigation_settings, auto_submit, is_published
    } = data;

    // Determine primary topic_id
    let primaryTopicId = topic_id || null;
    if (!primaryTopicId && Array.isArray(topic_ids) && topic_ids.length > 0) {
      primaryTopicId = topic_ids[0];
    }
    
    const [result] = await connection.query(`
      INSERT INTO tests (
        exam_id, subject_id, topic_id, subtopic_id, name, description, duration_minutes, total_questions, 
        total_marks, passing_marks, difficulty, test_type, is_free, is_active, display_order,
        instructions, negative_marking, start_time, end_time, max_attempts, 
        randomize_questions, randomize_options, navigation_settings, auto_submit, is_published
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      exam_id || null, subject_id || 1, primaryTopicId, subtopic_id || null,
      name, description, duration_minutes, total_questions || 0,
      total_marks, passing_marks, difficulty, test_type || 'full_length',
      is_free !== undefined ? is_free : true, is_active !== undefined ? is_active : true, display_order || 0,
      instructions, negative_marking || 0.00, start_time || null, end_time || null, max_attempts || 1,
      randomize_questions || false, randomize_options || false, navigation_settings || 'free',
      auto_submit !== undefined ? auto_submit : true, is_published || false
    ]);

    const testId = result.insertId;

    // Insert topic mappings into test_topics junction table
    const topicsToMap = new Set();
    if (primaryTopicId) topicsToMap.add(Number(primaryTopicId));
    if (Array.isArray(topic_ids)) {
      topic_ids.forEach(tid => tid && topicsToMap.add(Number(tid)));
    }

    if (topicsToMap.size > 0) {
      for (const tid of topicsToMap) {
        await connection.query(
          'INSERT IGNORE INTO test_topics (test_id, topic_id) VALUES (?, ?)',
          [testId, tid]
        );
      }
    }

    await connection.commit();
    return testId;
  } catch (err) {
    if (connection) await connection.rollback();
    throw err;
  } finally {
    if (connection) await connection.end();
  }
}

async function updateTest(id, data) {
  let connection;
  try {
    connection = await createDbConnection();
    await connection.beginTransaction();

    const fields = [];
    const values = [];

    const allowedFields = [
      'exam_id', 'subject_id', 'topic_id', 'subtopic_id', 'name', 'description', 'duration_minutes', 'total_questions', 
      'total_marks', 'passing_marks', 'difficulty', 'test_type', 'is_free', 'is_active', 'display_order',
      'instructions', 'negative_marking', 'start_time', 'end_time', 'max_attempts', 
      'randomize_questions', 'randomize_options', 'navigation_settings', 'auto_submit', 'is_published'
    ];

    for (const field of allowedFields) {
      if (data[field] !== undefined) {
        fields.push(`${field} = ?`);
        values.push(data[field]);
      }
    }

    if (fields.length > 0) {
      values.push(id);
      await connection.query(`UPDATE tests SET ${fields.join(', ')} WHERE id = ?`, values);
    }

    // Update multi-topic mappings if topic_ids is passed
    if (data.topic_ids !== undefined) {
      await connection.query('DELETE FROM test_topics WHERE test_id = ?', [id]);
      if (Array.isArray(data.topic_ids) && data.topic_ids.length > 0) {
        for (const tid of data.topic_ids) {
          if (tid) {
            await connection.query(
              'INSERT IGNORE INTO test_topics (test_id, topic_id) VALUES (?, ?)',
              [id, Number(tid)]
            );
          }
        }
      }
    } else if (data.topic_id !== undefined && data.topic_id !== null) {
      await connection.query(
        'INSERT IGNORE INTO test_topics (test_id, topic_id) VALUES (?, ?)',
        [id, Number(data.topic_id)]
      );
    }

    await connection.commit();
    return true;
  } catch (err) {
    if (connection) await connection.rollback();
    throw err;
  } finally {
    if (connection) await connection.end();
  }
}

async function deleteTest(id) {
  let connection;
  try {
    connection = await createDbConnection();
    await connection.beginTransaction();

    // 1. Unlink questions directly assigned to this test so they remain in Question Bank
    await connection.query('UPDATE questions SET test_id = NULL WHERE test_id = ?', [id]);

    // 2. Delete test associations from test_questions
    try {
      await connection.query('DELETE FROM test_questions WHERE test_id = ?', [id]);
    } catch (e) {}

    // 3. Delete topic associations from test_topics
    try {
      await connection.query('DELETE FROM test_topics WHERE test_id = ?', [id]);
    } catch (e) {}

    // 4. Clean up test_attempts and attempt_answers for this test
    try {
      const [attempts] = await connection.query('SELECT id FROM test_attempts WHERE test_id = ?', [id]);
      if (attempts.length > 0) {
        const attemptIds = attempts.map(a => a.id);
        await connection.query('DELETE FROM attempt_answers WHERE attempt_id IN (?)', [attemptIds]);
        await connection.query('DELETE FROM test_attempts WHERE test_id = ?', [id]);
      }
    } catch (e) {}

    // 5. Delete the test record
    await connection.query('DELETE FROM tests WHERE id = ?', [id]);

    await connection.commit();
    return true;
  } catch (err) {
    if (connection) await connection.rollback();
    throw err;
  } finally {
    if (connection) await connection.end();
  }
}

async function getAllTests(filters = {}) {
  let connection;
  try {
    connection = await createDbConnection();
    let query = `
      SELECT 
        tests.*, 
        e.name AS exam_name,
        s.name AS subject_name,
        t.name AS topic_name,
        st.name AS subtopic_name
      FROM tests
      LEFT JOIN exams e ON e.id = tests.exam_id
      LEFT JOIN subjects s ON s.id = tests.subject_id
      LEFT JOIN topics t ON t.id = tests.topic_id
      LEFT JOIN subtopics st ON st.id = tests.subtopic_id
      WHERE 1=1
    `;
    const values = [];

    if (filters.is_published !== undefined) {
      query += ' AND tests.is_published = ?';
      values.push(filters.is_published);
    }

    if (filters.is_active !== undefined) {
      query += ' AND tests.is_active = ?';
      values.push(filters.is_active);
    }

    if (filters.exam_id) {
      query += ' AND tests.exam_id = ?';
      values.push(filters.exam_id);
    }

    if (filters.subject_id) {
      query += ' AND tests.subject_id = ?';
      values.push(filters.subject_id);
    }

    if (filters.topic_id) {
      query += ' AND (tests.topic_id = ? OR tests.id IN (SELECT test_id FROM test_topics WHERE topic_id = ?))';
      values.push(filters.topic_id, filters.topic_id);
    }

    if (filters.subtopic_id) {
      query += ' AND tests.subtopic_id = ?';
      values.push(filters.subtopic_id);
    }

    if (filters.test_type) {
      query += ' AND LOWER(tests.test_type) = LOWER(?)';
      values.push(filters.test_type);
    }

    if (filters.search) {
      query += ' AND (tests.name LIKE ? OR tests.description LIKE ?)';
      values.push(`%${filters.search}%`, `%${filters.search}%`);
    }
    
    query += ' ORDER BY tests.created_at DESC, tests.id DESC';
    const [rows] = await connection.query(query, values);
    return rows;
  } finally {
    if (connection) await connection.end();
  }
}

async function duplicateTest(id) {
  let connection;
  try {
    connection = await createDbConnection();
    await connection.beginTransaction();

    // 1. Get original test
    const [testRows] = await connection.query('SELECT * FROM tests WHERE id = ?', [id]);
    if (testRows.length === 0) throw new Error('Test not found');
    const og = testRows[0];

    // 2. Insert new test
    const [result] = await connection.query(`
      INSERT INTO tests (
        exam_id, subject_id, topic_id, subtopic_id, name, description, duration_minutes, total_questions, 
        total_marks, passing_marks, difficulty, test_type, is_free, is_active, display_order,
        instructions, negative_marking, start_time, end_time, max_attempts, 
        randomize_questions, randomize_options, navigation_settings, auto_submit, is_published
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      og.exam_id || null, og.subject_id, og.topic_id || null, og.subtopic_id || null,
      og.name + ' (Copy)', og.description, og.duration_minutes, og.total_questions,
      og.total_marks, og.passing_marks, og.difficulty, og.test_type, og.is_free, og.is_active, og.display_order,
      og.instructions, og.negative_marking, og.start_time, og.end_time, og.max_attempts,
      og.randomize_questions, og.randomize_options, og.navigation_settings, og.auto_submit, false // new test is not published
    ]);
    const newTestId = result.insertId;

    // 3. Duplicate multi-topic mappings
    try {
      const [topicRows] = await connection.query('SELECT topic_id FROM test_topics WHERE test_id = ?', [id]);
      for (const tRow of topicRows) {
        await connection.query('INSERT IGNORE INTO test_topics (test_id, topic_id) VALUES (?, ?)', [newTestId, tRow.topic_id]);
      }
    } catch (e) {}

    // 4. Duplicate questions directly assigned or via test_questions
    const [directQuestions] = await connection.query('SELECT * FROM questions WHERE test_id = ?', [id]);
    for (const q of directQuestions) {
      const [qResult] = await connection.query(`
        INSERT INTO questions (
          test_id, question_text, question_type, marks, negative_marks,
          difficulty, explanation, display_order, category, subject, topic, subtopic, tags,
          subject_id, topic_id, subtopic_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        newTestId, q.question_text, q.question_type || 'MCQ', q.marks || 1, q.negative_marks || 0,
        q.difficulty, q.explanation, q.display_order || 0, q.category, q.subject, q.topic, q.subtopic, q.tags,
        q.subject_id || null, q.topic_id || null, q.subtopic_id || null
      ]);
      const newQuestionId = qResult.insertId;

      const [options] = await connection.query('SELECT * FROM question_options WHERE question_id = ?', [q.id]);
      for (const opt of options) {
        await connection.query(`
          INSERT INTO question_options (question_id, option_text, option_key, is_correct, display_order)
          VALUES (?, ?, ?, ?, ?)
        `, [newQuestionId, opt.option_text, opt.option_key, opt.is_correct ? 1 : 0, opt.display_order || 0]);
      }
    }

    // 5. Duplicate test_questions junction rows (Question Bank mappings)
    try {
      const [tqRows] = await connection.query('SELECT question_id, question_order FROM test_questions WHERE test_id = ?', [id]);
      for (const tq of tqRows) {
        await connection.query(
          'INSERT IGNORE INTO test_questions (test_id, question_id, question_order) VALUES (?, ?, ?)',
          [newTestId, tq.question_id, tq.question_order || 0]
        );
      }
    } catch (e) {}

    await syncTestQuestionStats(newTestId, connection);

    await connection.commit();
    return newTestId;
  } catch (err) {
    if (connection) await connection.rollback();
    throw err;
  } finally {
    if (connection) await connection.end();
  }
}

// -------------------------------------------------------------
// Question Assignment & Management for Tests (Step 6 of Flow)
// -------------------------------------------------------------

async function addQuestionsToTest(testId, questionIds) {
  let connection;
  try {
    connection = await createDbConnection();
    await connection.beginTransaction();

    const ids = Array.isArray(questionIds) ? questionIds : [questionIds];
    if (ids.length === 0) {
      await connection.rollback();
      return { added: 0 };
    }

    // Get current max question_order for this test
    const [orderRow] = await connection.query(
      'SELECT COALESCE(MAX(question_order), 0) AS max_order FROM test_questions WHERE test_id = ?',
      [testId]
    );
    let nextOrder = (orderRow[0]?.max_order || 0) + 1;

    let addedCount = 0;
    for (const qId of ids) {
      if (!qId) continue;
      const [res] = await connection.query(`
        INSERT INTO test_questions (test_id, question_id, question_order)
        VALUES (?, ?, ?)
        ON DUPLICATE KEY UPDATE question_order = question_order
      `, [testId, qId, nextOrder++]);
      if (res.affectedRows > 0) addedCount++;
    }

    // Recalculate and update total_questions & total_marks on test
    const stats = await syncTestQuestionStats(testId, connection);

    await connection.commit();
    return { added: addedCount, stats };
  } catch (err) {
    if (connection) await connection.rollback();
    throw err;
  } finally {
    if (connection) await connection.end();
  }
}

async function removeQuestionFromTest(testId, questionId) {
  let connection;
  try {
    connection = await createDbConnection();
    await connection.beginTransaction();

    // 1. Remove from test_questions junction table
    await connection.query(
      'DELETE FROM test_questions WHERE test_id = ? AND question_id = ?',
      [testId, questionId]
    );

    // 2. Unlink if mapped directly via questions.test_id
    await connection.query(
      'UPDATE questions SET test_id = NULL WHERE id = ? AND test_id = ?',
      [questionId, testId]
    );

    // Recalculate stats
    const stats = await syncTestQuestionStats(testId, connection);

    await connection.commit();
    return { success: true, stats };
  } catch (err) {
    if (connection) await connection.rollback();
    throw err;
  } finally {
    if (connection) await connection.end();
  }
}

async function reorderTestQuestions(testId, questionOrders) {
  // questionOrders: [{ question_id: 1, order: 1 }, ...]
  let connection;
  try {
    connection = await createDbConnection();
    await connection.beginTransaction();

    for (const item of questionOrders) {
      await connection.query(
        'UPDATE test_questions SET question_order = ? WHERE test_id = ? AND question_id = ?',
        [item.order, testId, item.question_id]
      );
    }

    await connection.commit();
    return true;
  } catch (err) {
    if (connection) await connection.rollback();
    throw err;
  } finally {
    if (connection) await connection.end();
  }
}

async function autoPopulateFromQuestionBank(testId, criteria = {}) {
  let connection;
  try {
    connection = await createDbConnection();
    await connection.beginTransaction();

    const [testRows] = await connection.query('SELECT * FROM tests WHERE id = ?', [testId]);
    if (testRows.length === 0) throw new Error('Test not found');
    const test = testRows[0];

    const count = Number(criteria.count) || 10;
    const topicId = criteria.topic_id || test.topic_id;
    const subjectId = criteria.subject_id || test.subject_id;
    const difficulty = criteria.difficulty || test.difficulty;

    let query = `
      SELECT q.id FROM questions q
      WHERE 1=1
    `;
    const params = [];

    if (topicId) {
      query += ' AND q.topic_id = ?';
      params.push(topicId);
    } else if (subjectId) {
      query += ' AND (q.subject_id = ? OR q.subject = (SELECT name FROM subjects WHERE id = ?))';
      params.push(subjectId, subjectId);
    }

    if (difficulty && difficulty !== 'All') {
      query += ' AND q.difficulty = ?';
      params.push(difficulty);
    }

    // Exclude questions already in this test
    query += ' AND q.id NOT IN (SELECT question_id FROM test_questions WHERE test_id = ?)';
    params.push(testId);

    query += ' ORDER BY RAND() LIMIT ?';
    params.push(count);

    const [availableQuestions] = await connection.query(query, params);

    if (availableQuestions.length === 0) {
      await connection.rollback();
      return { added: 0, message: 'No matching questions found in Question Bank' };
    }

    const questionIds = availableQuestions.map(q => q.id);
    let nextOrder = 1;
    for (const qId of questionIds) {
      await connection.query(`
        INSERT INTO test_questions (test_id, question_id, question_order)
        VALUES (?, ?, ?)
        ON DUPLICATE KEY UPDATE question_order = VALUES(question_order)
      `, [testId, qId, nextOrder++]);
    }

    const stats = await syncTestQuestionStats(testId, connection);

    await connection.commit();
    return { added: questionIds.length, questionIds, stats };
  } catch (err) {
    if (connection) await connection.rollback();
    throw err;
  } finally {
    if (connection) await connection.end();
  }
}

module.exports = {
  getTestById,
  getQuestionsForTest,
  startTestAttempt,
  createTest,
  updateTest,
  deleteTest,
  getAllTests,
  duplicateTest,
  addQuestionsToTest,
  removeQuestionFromTest,
  reorderTestQuestions,
  autoPopulateFromQuestionBank,
  syncTestQuestionStats
};
