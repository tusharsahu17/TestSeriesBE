/**
 * @swagger
 * tags:
 *   name: PDF Categories
 *   description: Manage categories for grouping PDF documents
 */

const express = require('express');
const router = express.Router();
const pdfCategoryController = require('../controllers/pdfCategoryController');

/**
 * @swagger
 * /api/pdf-categories:
 *   get:
 *     summary: Retrieve a list of all PDF categories
 *     description: Returns all categories along with their contained PDFs and total count
 *     tags: [PDF Categories]
 *     parameters:
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search by category name or description
 *       - in: query
 *         name: includePdfs
 *         schema:
 *           type: boolean
 *           default: true
 *         description: Whether to include the nested array of PDFs for each category
 *       - in: query
 *         name: sortBy
 *         schema:
 *           type: string
 *           enum: [id, name, created_at, updated_at]
 *           default: created_at
 *       - in: query
 *         name: order
 *         schema:
 *           type: string
 *           enum: [ASC, DESC]
 *           default: DESC
 *     responses:
 *       200:
 *         description: A list of categories with their PDFs
 */
router.get('/', pdfCategoryController.getAllCategoriesHandler);

/**
 * @swagger
 * /api/pdf-categories/{id}:
 *   get:
 *     summary: Retrieve a single category by ID
 *     description: Returns the category details along with all PDFs inside it
 *     tags: [PDF Categories]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Category details with contained PDFs
 *       404:
 *         description: Category not found
 */
router.get('/:id', pdfCategoryController.getCategoryByIdHandler);

/**
 * @swagger
 * /api/pdf-categories/{id}/pdfs:
 *   get:
 *     summary: Retrieve all PDFs inside a specific category
 *     tags: [PDF Categories]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: List of PDFs in this category
 *       404:
 *         description: Category not found
 */
router.get('/:id/pdfs', pdfCategoryController.getCategoryPdfsHandler);

/**
 * @swagger
 * /api/pdf-categories:
 *   post:
 *     summary: Create a new PDF category
 *     tags: [PDF Categories]
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
 *                 example: Previous Year Papers
 *               description:
 *                 type: string
 *                 example: Question papers from previous examinations
 *     responses:
 *       201:
 *         description: Category created successfully
 *       400:
 *         description: Missing category name
 *       409:
 *         description: Category already exists
 */
router.post('/', pdfCategoryController.createCategoryHandler);

/**
 * @swagger
 * /api/pdf-categories/{id}:
 *   put:
 *     summary: Update an existing PDF category
 *     tags: [PDF Categories]
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
 *                 example: Updated Category Name
 *               description:
 *                 type: string
 *                 example: Updated description
 *     responses:
 *       200:
 *         description: Category updated successfully
 *       404:
 *         description: Category not found
 */
router.put('/:id', pdfCategoryController.updateCategoryHandler);

/**
 * @swagger
 * /api/pdf-categories/{id}:
 *   delete:
 *     summary: Delete a category and all associated PDFs
 *     tags: [PDF Categories]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Category and associated PDFs deleted successfully
 *       404:
 *         description: Category not found
 */
router.delete('/:id', pdfCategoryController.deleteCategoryHandler);

module.exports = router;
