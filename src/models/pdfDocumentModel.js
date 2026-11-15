const { createDbConnection } = require('../config/db');

function formatPdfRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    categoryName: row.category_name,
    categoryId: row.category_id,
    category_id: row.category_id,
    category: {
      id: row.category_id,
      name: row.category_name
    },
    fileName: row.file_name,
    filename: row.file_name,
    file_name: row.file_name,
    originalName: row.original_name,
    original_name: row.original_name,
    filePath: row.file_path,
    file_path: row.file_path,
    fileUrl: row.file_url,
    file_url: row.file_url,
    url: row.file_url,
    viewUrl: `/api/pdfs/${row.id}/view`,
    downloadUrl: `/api/pdfs/${row.id}/download`,
    fileSize: row.file_size,
    file_size: row.file_size,
    size: row.file_size,
    mimeType: row.mime_type,
    mime_type: row.mime_type,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

/**
 * Insert a new PDF document
 */
async function createPdf(data) {
  let connection;
  try {
    connection = await createDbConnection();
    const {
      category_id,
      title,
      description = null,
      file_name,
      original_name,
      file_path,
      file_url,
      file_size,
      mime_type = 'application/pdf'
    } = data;

    const [result] = await connection.query(
      `INSERT INTO pdf_documents 
        (category_id, title, description, file_name, original_name, file_path, file_url, file_size, mime_type) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        category_id,
        title,
        description,
        file_name,
        original_name,
        file_path,
        file_url,
        file_size,
        mime_type
      ]
    );

    return await getPdfById(result.insertId);
  } finally {
    if (connection) await connection.end();
  }
}

/**
 * Retrieve all PDFs with optional filtering, search, and pagination
 */
async function getAllPdfs(options = {}) {
  let connection;
  try {
    connection = await createDbConnection();
    const {
      categoryId,
      categoryName,
      search,
      sortBy = 'created_at',
      order = 'DESC',
      page,
      limit
    } = options;

    const allowedSortFields = ['id', 'title', 'created_at', 'updated_at', 'file_size'];
    const safeSortBy = allowedSortFields.includes(sortBy) ? `p.${sortBy}` : 'p.created_at';
    const safeOrder = order && order.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    let baseQuery = `
      FROM pdf_documents p
      LEFT JOIN pdf_categories c ON p.category_id = c.id
      WHERE 1=1
    `;
    const params = [];

    if (categoryId) {
      baseQuery += ' AND p.category_id = ?';
      params.push(categoryId);
    }

    if (categoryName && categoryName.trim()) {
      baseQuery += ' AND LOWER(c.name) = LOWER(?)';
      params.push(categoryName.trim());
    }

    if (search && search.trim()) {
      baseQuery += ' AND (p.title LIKE ? OR p.description LIKE ? OR p.original_name LIKE ? OR c.name LIKE ?)';
      const term = `%${search.trim()}%`;
      params.push(term, term, term, term);
    }

    // Get total count
    const [countRows] = await connection.query(`SELECT COUNT(*) as total ${baseQuery}`, params);
    const total = countRows[0].total;

    // Build SELECT query
    let selectQuery = `
      SELECT 
        p.id,
        p.category_id,
        c.name AS category_name,
        p.title,
        p.description,
        p.file_name,
        p.original_name,
        p.file_path,
        p.file_url,
        p.file_size,
        p.mime_type,
        p.created_at,
        p.updated_at
      ${baseQuery}
      ORDER BY ${safeSortBy} ${safeOrder}
    `;

    const queryParams = [...params];

    if (limit && Number(limit) > 0) {
      const pageNum = Math.max(1, Number(page) || 1);
      const limitNum = Number(limit);
      const offset = (pageNum - 1) * limitNum;
      selectQuery += ' LIMIT ? OFFSET ?';
      queryParams.push(limitNum, offset);
    }

    const [rows] = await connection.query(selectQuery, queryParams);

    const formattedRows = rows.map(formatPdfRow);

    if (limit && Number(limit) > 0) {
      const pageNum = Math.max(1, Number(page) || 1);
      const limitNum = Number(limit);
      return {
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum),
        data: formattedRows
      };
    }

    return formattedRows;
  } finally {
    if (connection) await connection.end();
  }
}

/**
 * Get PDF document by ID
 */
async function getPdfById(id) {
  let connection;
  try {
    connection = await createDbConnection();
    const [rows] = await connection.query(
      `SELECT 
        p.id,
        p.category_id,
        c.name AS category_name,
        p.title,
        p.description,
        p.file_name,
        p.original_name,
        p.file_path,
        p.file_url,
        p.file_size,
        p.mime_type,
        p.created_at,
        p.updated_at
      FROM pdf_documents p
      LEFT JOIN pdf_categories c ON p.category_id = c.id
      WHERE p.id = ?`,
      [id]
    );

    if (!rows.length) return null;
    return formatPdfRow(rows[0]);
  } finally {
    if (connection) await connection.end();
  }
}

/**
 * Get all PDFs for a specific category
 */
async function getPdfsByCategoryId(categoryId) {
  let connection;
  try {
    connection = await createDbConnection();
    const [rows] = await connection.query(
      `SELECT 
        p.id,
        p.category_id,
        c.name AS category_name,
        p.title,
        p.description,
        p.file_name,
        p.original_name,
        p.file_path,
        p.file_url,
        p.file_size,
        p.mime_type,
        p.created_at,
        p.updated_at
      FROM pdf_documents p
      LEFT JOIN pdf_categories c ON p.category_id = c.id
      WHERE p.category_id = ?
      ORDER BY p.created_at DESC`,
      [categoryId]
    );

    return rows.map(formatPdfRow);
  } finally {
    if (connection) await connection.end();
  }
}

/**
 * Update PDF details
 */
async function updatePdf(id, data) {
  let connection;
  try {
    connection = await createDbConnection();
    const {
      title,
      description,
      category_id,
      file_name,
      original_name,
      file_path,
      file_url,
      file_size,
      mime_type
    } = data;

    const fields = [];
    const values = [];

    if (title !== undefined) { fields.push('title = ?'); values.push(title); }
    if (description !== undefined) { fields.push('description = ?'); values.push(description); }
    if (category_id !== undefined) { fields.push('category_id = ?'); values.push(category_id); }
    if (file_name !== undefined) { fields.push('file_name = ?'); values.push(file_name); }
    if (original_name !== undefined) { fields.push('original_name = ?'); values.push(original_name); }
    if (file_path !== undefined) { fields.push('file_path = ?'); values.push(file_path); }
    if (file_url !== undefined) { fields.push('file_url = ?'); values.push(file_url); }
    if (file_size !== undefined) { fields.push('file_size = ?'); values.push(file_size); }
    if (mime_type !== undefined) { fields.push('mime_type = ?'); values.push(mime_type); }

    if (fields.length === 0) return await getPdfById(id);

    values.push(id);
    const [result] = await connection.query(
      `UPDATE pdf_documents SET ${fields.join(', ')} WHERE id = ?`,
      values
    );

    if (result.affectedRows === 0) return null;
    return await getPdfById(id);
  } finally {
    if (connection) await connection.end();
  }
}

/**
 * Delete PDF record and return its details so caller can remove file from disk
 */
async function deletePdf(id) {
  let connection;
  try {
    connection = await createDbConnection();

    const [rows] = await connection.query(
      'SELECT * FROM pdf_documents WHERE id = ?',
      [id]
    );

    if (!rows.length) return null;
    const pdfRecord = rows[0];

    const [result] = await connection.query(
      'DELETE FROM pdf_documents WHERE id = ?',
      [id]
    );

    if (result.affectedRows === 0) return null;
    return pdfRecord;
  } finally {
    if (connection) await connection.end();
  }
}

module.exports = {
  createPdf,
  getAllPdfs,
  getPdfById,
  getPdfsByCategoryId,
  updatePdf,
  deletePdf
};
