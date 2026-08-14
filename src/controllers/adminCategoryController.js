const adminCategoryModel = require('../models/adminCategoryModel');

const createCategoryHandler = async (req, res) => {
  try {
    const id = await adminCategoryModel.createCategory(req.body);
    res.status(201).json({ message: 'Category created successfully', id });
  } catch (error) {
    res.status(500).json({ error: 'Failed to create category', details: error.message });
  }
};

const getAllCategoriesHandler = async (req, res) => {
  try {
    const categories = await adminCategoryModel.getAllCategories();
    res.json(categories);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch categories', details: error.message });
  }
};

const getCategoryByIdHandler = async (req, res) => {
  try {
    const { id } = req.params;
    const category = await adminCategoryModel.getCategoryById(id);
    if (!category) {
      return res.status(404).json({ error: 'Category not found' });
    }
    res.json(category);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch category', details: error.message });
  }
};

const updateCategoryHandler = async (req, res) => {
  try {
    const { id } = req.params;
    const success = await adminCategoryModel.updateCategory(id, req.body);
    if (!success) {
      return res.status(404).json({ error: 'Category not found' });
    }
    res.json({ message: 'Category updated successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update category', details: error.message });
  }
};

const deleteCategoryHandler = async (req, res) => {
  try {
    const { id } = req.params;
    const success = await adminCategoryModel.deleteCategory(id);
    if (!success) {
      return res.status(404).json({ error: 'Category not found' });
    }
    res.json({ message: 'Category deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete category', details: error.message });
  }
};

module.exports = {
  createCategoryHandler,
  getAllCategoriesHandler,
  getCategoryByIdHandler,
  updateCategoryHandler,
  deleteCategoryHandler
};
