const { createDbConnection } = require('../config/db');

/**
 * Create a new PDF Category
 */
async function createCategory(data) {
  let connection;
  try {
    connection = await createDbConnection();
    const { name, description = null } = data;
    const trimmedName = name.trim();

    const [result] = await connection.query(
      'INSERT INTO pdf_categories (name, description) VALUES (?, ?)',
      [trimmedName, description]
    );

    return {
      id: result.insertId,
      name: trimmedName,
      description
    };
  } finally {
    if (connection) await connection.end();
  }
}

/**
 * Find a category by name or create it if it doesn't exist
 */
async function findOrCreateCategory(name, description = null) {
  let connection;
  try {
    connection = await createDbConnection();
    const trimmedName = name.trim();

    // Check if category already exists (case-insensitive)
    const [existing] = await connection.query(
      'SELECT * FROM pdf_categories WHERE LOWER(TRIM(name)) = LOWER(?) LIMIT 1',
      [trimmedName]
    );

    if (existing.length > 0) {
      return existing[0];
    }

    // Otherwise create new category
    const [result] = await connection.query(
      'INSERT INTO pdf_categories (name, description) VALUES (?, ?)',
      [trimmedName, description]
    );

    const [created] = await connection.query(
      'SELECT * FROM pdf_categories WHERE id = ?',
      [result.insertId]
    );

    return created[0];
  } finally {
    if (connection) await connection.end();
  }
}

/**
 * Retrieve all categories with optional PDF listing
 */
async function getAllCategories(options = {}) {
  let connection;
  try {
    connection = await createDbConnection();
    const {
      search = '',
      sortBy = 'created_at',
      order = 'DESC',
      includePdfs = true
    } = options;

    const allowedSortFields = ['id', 'name', 'created_at', 'updated_at'];
    const safeSortBy = allowedSortFields.includes(sortBy) ? sortBy : 'created_at';
    const safeOrder = order.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    let query = 'SELECT * FROM pdf_categories';
    const params = [];

    if (search && search.trim()) {
      query += ' WHERE name LIKE ? OR description LIKE ?';
      const term = `%${search.trim()}%`;
      params.push(term, term);
    }

    query += ` ORDER BY ${safeSortBy} ${safeOrder}`;

    const [categories] = await connection.query(query, params);

    if (!categories.length) {
      return [];
    }

    if (includePdfs) {
      const categoryIds = categories.map(c => c.id);
      const [allPdfs] = await connection.query(
        `SELECT id, category_id, title, description, file_name, original_name, 
                file_path, file_url, file_size, mime_type, created_at, updated_at 
         FROM pdf_documents 
         WHERE category_id IN (${categoryIds.map(() => '?').join(',')}) 
         ORDER BY created_at DESC`,
        categoryIds
      );

      // Group PDFs by category_id
      const pdfsByCategory = {};
      for (const pdf of allPdfs) {
        if (!pdfsByCategory[pdf.category_id]) {
          pdfsByCategory[pdf.category_id] = [];
        }
        pdfsByCategory[pdf.category_id].push(pdf);
      }

      return categories.map(cat => {
        const count = pdfsByCategory[cat.id] ? pdfsByCategory[cat.id].length : 0;
        return {
          ...cat,
          pdfCount: count,
          pdf_count: count,
          pdfs: pdfsByCategory[cat.id] || []
        };
      });
    }

    // If PDFs are not included, just calculate counts
    const categoryIds = categories.map(c => c.id);
    const [counts] = await connection.query(
      `SELECT category_id, COUNT(*) as count 
       FROM pdf_documents 
       WHERE category_id IN (${categoryIds.map(() => '?').join(',')}) 
       GROUP BY category_id`,
      categoryIds
    );

    const countMap = {};
    for (const row of counts) {
      countMap[row.category_id] = row.count;
    }

    return categories.map(cat => ({
      ...cat,
      pdfCount: countMap[cat.id] || 0,
      pdf_count: countMap[cat.id] || 0
    }));
  } finally {
    if (connection) await connection.end();
  }
}

/**
 * Get category by ID with its PDFs
 */
async function getCategoryById(id, includePdfs = true) {
  let connection;
  try {
    connection = await createDbConnection();
    const [rows] = await connection.query(
      'SELECT * FROM pdf_categories WHERE id = ?',
      [id]
    );

    if (!rows.length) return null;
    const category = rows[0];

    if (includePdfs) {
      const [pdfs] = await connection.query(
        `SELECT id, category_id, title, description, file_name, original_name, 
                file_path, file_url, file_size, mime_type, created_at, updated_at 
         FROM pdf_documents 
         WHERE category_id = ? 
         ORDER BY created_at DESC`,
        [id]
      );
      category.pdfCount = pdfs.length;
      category.pdf_count = pdfs.length;
      category.pdfs = pdfs;
    }

    return category;
  } finally {
    if (connection) await connection.end();
  }
}

/**
 * Update category details
 */
async function updateCategory(id, data) {
  let connection;
  try {
    connection = await createDbConnection();
    const { name, description } = data;
    const fields = [];
    const values = [];

    if (name !== undefined) {
      fields.push('name = ?');
      values.push(name.trim());
    }
    if (description !== undefined) {
      fields.push('description = ?');
      values.push(description);
    }

    if (fields.length === 0) return true;

    values.push(id);
    const [result] = await connection.query(
      `UPDATE pdf_categories SET ${fields.join(', ')} WHERE id = ?`,
      values
    );

    return result.affectedRows > 0;
  } finally {
    if (connection) await connection.end();
  }
}

/**
 * Delete category and return associated PDFs for file cleanup
 */
async function deleteCategory(id) {
  let connection;
  try {
    connection = await createDbConnection();

    // First get associated PDFs so caller can delete physical files
    const [pdfs] = await connection.query(
      'SELECT id, file_path FROM pdf_documents WHERE category_id = ?',
      [id]
    );

    // Delete category (CASCADE will delete rows in pdf_documents)
    const [result] = await connection.query(
      'DELETE FROM pdf_categories WHERE id = ?',
      [id]
    );

    return {
      deleted: result.affectedRows > 0,
      associatedPdfs: pdfs
    };
  } finally {
    if (connection) await connection.end();
  }
}

module.exports = {
  createCategory,
  findOrCreateCategory,
  getAllCategories,
  getCategoryById,
  updateCategory,
  deleteCategory
};
