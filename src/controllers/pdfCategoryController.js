const fs = require('fs');
const path = require('path');
const pdfCategoryModel = require('../models/pdfCategoryModel');
const pdfDocumentModel = require('../models/pdfDocumentModel');

/**
 * Helper to delete a file from disk safely
 */
function safeUnlink(filePath) {
  try {
    const fullPath = path.isAbsolute(filePath) ? filePath : path.resolve(filePath);
    if (fs.existsSync(fullPath)) {
      fs.unlinkSync(fullPath);
    }
  } catch (err) {
    console.error(`Failed to delete file at ${filePath}:`, err.message);
  }
}

/**
 * Create a new category
 */
const createCategoryHandler = async (req, res) => {
  try {
    const { name, description } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, error: 'Category name is required' });
    }

    const category = await pdfCategoryModel.createCategory({ name, description });
    return res.status(201).json({
      success: true,
      message: 'Category created successfully',
      data: category
    });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({
        success: false,
        error: 'A category with this name already exists'
      });
    }
    return res.status(500).json({
      success: false,
      error: 'Failed to create category',
      details: error.message
    });
  }
};

/**
 * Get all categories (with PDFs and PDF count)
 */
const getAllCategoriesHandler = async (req, res) => {
  try {
    const { search, sortBy, order, includePdfs } = req.query;
    const shouldIncludePdfs = includePdfs === undefined || includePdfs === 'true' || includePdfs === true;

    const categories = await pdfCategoryModel.getAllCategories({
      search,
      sortBy,
      order,
      includePdfs: shouldIncludePdfs
    });

    return res.json({
      success: true,
      count: categories.length,
      data: categories
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch categories',
      details: error.message
    });
  }
};

/**
 * Get category by ID
 */
const getCategoryByIdHandler = async (req, res) => {
  try {
    const { id } = req.params;
    const category = await pdfCategoryModel.getCategoryById(id, true);

    if (!category) {
      return res.status(404).json({ success: false, error: 'Category not found' });
    }

    return res.json({
      success: true,
      data: category
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch category',
      details: error.message
    });
  }
};

/**
 * Get all PDFs for a specific category
 */
const getCategoryPdfsHandler = async (req, res) => {
  try {
    const { id } = req.params;
    const category = await pdfCategoryModel.getCategoryById(id, false);

    if (!category) {
      return res.status(404).json({ success: false, error: 'Category not found' });
    }

    const pdfs = await pdfDocumentModel.getPdfsByCategoryId(id);
    return res.json({
      success: true,
      category: {
        id: category.id,
        name: category.name
      },
      count: pdfs.length,
      data: pdfs
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch PDFs for category',
      details: error.message
    });
  }
};

/**
 * Update category
 */
const updateCategoryHandler = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description } = req.body;

    const existing = await pdfCategoryModel.getCategoryById(id, false);
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Category not found' });
    }

    await pdfCategoryModel.updateCategory(id, { name, description });
    const updated = await pdfCategoryModel.getCategoryById(id, true);

    return res.json({
      success: true,
      message: 'Category updated successfully',
      data: updated
    });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({
        success: false,
        error: 'A category with this name already exists'
      });
    }
    return res.status(500).json({
      success: false,
      error: 'Failed to update category',
      details: error.message
    });
  }
};

/**
 * Delete category and remove all associated PDF files from disk
 */
const deleteCategoryHandler = async (req, res) => {
  try {
    const { id } = req.params;
    const { deleted, associatedPdfs } = await pdfCategoryModel.deleteCategory(id);

    if (!deleted) {
      return res.status(404).json({ success: false, error: 'Category not found' });
    }

    // Clean up files from disk
    if (associatedPdfs && associatedPdfs.length > 0) {
      for (const pdf of associatedPdfs) {
        if (pdf.file_path) {
          safeUnlink(pdf.file_path);
        }
      }
    }

    return res.json({
      success: true,
      message: 'Category and all associated PDFs deleted successfully',
      deletedPdfsCount: associatedPdfs ? associatedPdfs.length : 0
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: 'Failed to delete category',
      details: error.message
    });
  }
};

module.exports = {
  createCategoryHandler,
  getAllCategoriesHandler,
  getCategoryByIdHandler,
  getCategoryPdfsHandler,
  updateCategoryHandler,
  deleteCategoryHandler
};
