const { createDbConnection } = require('../config/db');

async function createTestSeries(data) {
  let connection;
  try {
    connection = await createDbConnection();
    const { title, description, thumbnail_url, price, is_paid, validity_days, start_date, end_date, category_id, difficulty_level, is_published } = data;
    const [result] = await connection.query(
      `INSERT INTO test_series 
        (title, description, thumbnail_url, price, is_paid, validity_days, start_date, end_date, category_id, difficulty_level, is_published) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [title, description, thumbnail_url, price || 0, is_paid || false, validity_days, start_date, end_date, category_id, difficulty_level, is_published || false]
    );
    return result.insertId;
  } finally {
    if (connection) await connection.end();
  }
}

async function updateTestSeries(id, data) {
  let connection;
  try {
    connection = await createDbConnection();
    const { title, description, thumbnail_url, price, is_paid, validity_days, start_date, end_date, category_id, difficulty_level, is_published, is_archived } = data;
    
    // We update fields if they are provided, else keep existing
    const fields = [];
    const values = [];

    if (title !== undefined) { fields.push('title = ?'); values.push(title); }
    if (description !== undefined) { fields.push('description = ?'); values.push(description); }
    if (thumbnail_url !== undefined) { fields.push('thumbnail_url = ?'); values.push(thumbnail_url); }
    if (price !== undefined) { fields.push('price = ?'); values.push(price); }
    if (is_paid !== undefined) { fields.push('is_paid = ?'); values.push(is_paid); }
    if (validity_days !== undefined) { fields.push('validity_days = ?'); values.push(validity_days); }
    if (start_date !== undefined) { fields.push('start_date = ?'); values.push(start_date); }
    if (end_date !== undefined) { fields.push('end_date = ?'); values.push(end_date); }
    if (category_id !== undefined) { fields.push('category_id = ?'); values.push(category_id); }
    if (difficulty_level !== undefined) { fields.push('difficulty_level = ?'); values.push(difficulty_level); }
    if (is_published !== undefined) { fields.push('is_published = ?'); values.push(is_published); }
    if (is_archived !== undefined) { fields.push('is_archived = ?'); values.push(is_archived); }

    if (fields.length === 0) return true; // nothing to update

    values.push(id);
    await connection.query(`UPDATE test_series SET ${fields.join(', ')} WHERE id = ?`, values);
    return true;
  } finally {
    if (connection) await connection.end();
  }
}

async function deleteTestSeries(id) {
  let connection;
  try {
    connection = await createDbConnection();
    await connection.query('DELETE FROM test_series WHERE id = ?', [id]);
    return true;
  } finally {
    if (connection) await connection.end();
  }
}

async function archiveTestSeries(id) {
  return updateTestSeries(id, { is_archived: true });
}

async function getAllTestSeries(filters = {}) {
  let connection;
  try {
    connection = await createDbConnection();
    let query = `
      SELECT ts.*, c.name as category_name 
      FROM test_series ts
      LEFT JOIN categories c ON ts.category_id = c.id
      WHERE 1=1
    `;
    const values = [];

    if (filters.is_published !== undefined) {
      query += ' AND is_published = ?';
      values.push(filters.is_published);
    }
    if (filters.is_archived !== undefined) {
      query += ' AND is_archived = ?';
      values.push(filters.is_archived);
    }

    query += ' ORDER BY ts.created_at DESC';
    const [rows] = await connection.query(query, values);
    return rows;
  } finally {
    if (connection) await connection.end();
  }
}

async function getTestSeriesById(id) {
  let connection;
  try {
    connection = await createDbConnection();
    const [series] = await connection.query(`
      SELECT ts.*, c.name as category_name 
      FROM test_series ts
      LEFT JOIN categories c ON ts.category_id = c.id
      WHERE ts.id = ?
    `, [id]);
    if (series.length === 0) return null;

    const [tests] = await connection.query(`
      SELECT t.*, tst.display_order
      FROM tests t
      JOIN test_series_tests tst ON t.id = tst.test_id
      WHERE tst.test_series_id = ?
      ORDER BY tst.display_order ASC
    `, [id]);

    return { ...series[0], tests };
  } finally {
    if (connection) await connection.end();
  }
}

async function addTestToSeries(seriesId, testId, order) {
  let connection;
  try {
    connection = await createDbConnection();
    await connection.query(
      'INSERT INTO test_series_tests (test_series_id, test_id, display_order) VALUES (?, ?, ?)',
      [seriesId, testId, order || 0]
    );
    return true;
  } finally {
    if (connection) await connection.end();
  }
}

async function reorderTestsInSeries(seriesId, orderedTestIds) {
  let connection;
  try {
    connection = await createDbConnection();
    await connection.beginTransaction();

    for (let i = 0; i < orderedTestIds.length; i++) {
      const mappingId = orderedTestIds[i]; // assuming we pass mapping ID or we match by test_id
      // to be safe, let's assume orderedTestIds is an array of objects: { mappingId, order } or { testId, order }
      // For simplicity, let's accept array of testIds and update them in order
      const testId = orderedTestIds[i];
      await connection.query(
        'UPDATE test_series_tests SET display_order = ? WHERE test_series_id = ? AND test_id = ?',
        [i, seriesId, testId]
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

async function syncTestsInSeries(seriesId, testIds) {
  let connection;
  try {
    connection = await createDbConnection();
    await connection.beginTransaction();

    // Remove all existing mappings
    await connection.query('DELETE FROM test_series_tests WHERE test_series_id = ?', [seriesId]);

    // Insert new mappings in the given order
    for (let i = 0; i < testIds.length; i++) {
      const testId = testIds[i];
      await connection.query(
        'INSERT INTO test_series_tests (test_series_id, test_id, display_order) VALUES (?, ?, ?)',
        [seriesId, testId, i + 1]
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

async function duplicateTestSeries(id) {
  let connection;
  try {
    connection = await createDbConnection();
    await connection.beginTransaction();

    // 1. Get original series
    const [original] = await connection.query('SELECT * FROM test_series WHERE id = ?', [id]);
    if (original.length === 0) throw new Error('Test series not found');
    const og = original[0];

    // 2. Insert new series
    const [result] = await connection.query(
      `INSERT INTO test_series 
        (title, description, thumbnail_url, price, is_paid, validity_days, start_date, end_date, category_id, difficulty_level, is_published, is_archived) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        og.title + ' (Copy)', og.description, og.thumbnail_url, og.price, og.is_paid, og.validity_days, 
        og.start_date, og.end_date, og.category_id, og.difficulty_level, false, false
      ]
    );
    const newSeriesId = result.insertId;

    // 3. Get original tests
    const [tests] = await connection.query('SELECT test_id, display_order FROM test_series_tests WHERE test_series_id = ?', [id]);
    
    // 4. Insert tests for new series
    for (const t of tests) {
      await connection.query(
        'INSERT INTO test_series_tests (test_series_id, test_id, display_order) VALUES (?, ?, ?)',
        [newSeriesId, t.test_id, t.display_order]
      );
    }

    await connection.commit();
    return newSeriesId;
  } catch (err) {
    if (connection) await connection.rollback();
    throw err;
  } finally {
    if (connection) await connection.end();
  }
}

module.exports = {
  createTestSeries,
  updateTestSeries,
  deleteTestSeries,
  archiveTestSeries,
  getAllTestSeries,
  getTestSeriesById,
  addTestToSeries,
  reorderTestsInSeries,
  syncTestsInSeries,
  duplicateTestSeries
};
