/**
 * @swagger
 * tags:
 *   name: Admin - Categories
 *   description: Manage categories for test series
 */

const express = require('express');
const router = express.Router();
const adminCategoryController = require('../controllers/adminCategoryController');

/**
 * @swagger
 * /api/admin/categories:
 *   get:
 *     summary: Retrieve a list of all categories
 *     tags: [Admin - Categories]
 *     responses:
 *       200:
 *         description: A list of categories
 */
router.get('/', adminCategoryController.getAllCategoriesHandler);

/**
 * @swagger
 * /api/admin/categories/{id}:
 *   get:
 *     summary: Retrieve a single category by ID
 *     tags: [Admin - Categories]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: The category data
 *       404:
 *         description: Category not found
 */
router.get('/:id', adminCategoryController.getCategoryByIdHandler);

/**
 * @swagger
 * /api/admin/categories:
 *   post:
 *     summary: Create a new category
 *     tags: [Admin - Categories]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *             properties:
 *               name:
 *                 type: string
 *               description:
 *                 type: string
 *     responses:
 *       201:
 *         description: Category created successfully
 */
router.post('/', adminCategoryController.createCategoryHandler);

/**
 * @swagger
 * /api/admin/categories/{id}:
 *   put:
 *     summary: Update an existing category
 *     tags: [Admin - Categories]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               description:
 *                 type: string
 *     responses:
 *       200:
 *         description: Category updated successfully
 *       404:
 *         description: Category not found
 */
router.put('/:id', adminCategoryController.updateCategoryHandler);

/**
 * @swagger
 * /api/admin/categories/{id}:
 *   delete:
 *     summary: Delete a category
 *     tags: [Admin - Categories]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Category deleted successfully
 *       404:
 *         description: Category not found
 */
router.delete('/:id', adminCategoryController.deleteCategoryHandler);

module.exports = router;
