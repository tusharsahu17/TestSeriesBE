/**
 * @swagger
 * tags:
 *   name: PDF Documents
 *   description: Upload and manage PDF documents organized by category
 */

const express = require('express');
const router = express.Router();
const pdfDocumentController = require('../controllers/pdfDocumentController');
const { handlePdfUpload } = require('../middleware/pdfUpload');

/**
 * @swagger
 * /api/pdfs:
 *   post:
 *     summary: Upload a PDF file with a category name
 *     description: Uploads a PDF file. If the category name doesn't exist, it will be automatically created. A category can contain multiple PDFs.
 *     tags: [PDF Documents]
 *     consumes:
 *       - multipart/form-data
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - file
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *                 description: The PDF file to upload (also accepts 'pdf' or 'files')
 *               categoryName:
 *                 type: string
 *                 example: Previous Year Papers
 *                 description: Name of the category (auto-created if not exists)
 *               categoryId:
 *                 type: integer
 *                 description: Optional alternative to categoryName if category already exists
 *               categoryDescription:
 *                 type: string
 *                 description: Optional description for new category if auto-created
 *               title:
 *                 type: string
 *                 example: UPSC Prelims 2024 Paper 1
 *                 description: Document title (defaults to original filename if omitted)
 *               description:
 *                 type: string
 *                 example: Official question paper with answer keys
 *     responses:
 *       201:
 *         description: PDF uploaded and categorized successfully
 *       400:
 *         description: Missing file or categoryName
 *       404:
 *         description: Provided categoryId not found
 */
router.post('/', handlePdfUpload, pdfDocumentController.uploadPdfHandler);
router.post('/upload', handlePdfUpload, pdfDocumentController.uploadPdfHandler);

/**
 * @swagger
 * /api/pdfs:
 *   get:
 *     summary: Retrieve a list of all uploaded PDFs
 *     tags: [PDF Documents]
 *     parameters:
 *       - in: query
 *         name: categoryId
 *         schema:
 *           type: integer
 *         description: Filter PDFs by category ID
 *       - in: query
 *         name: categoryName
 *         schema:
 *           type: string
 *         description: Filter PDFs by category name
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search by title, description, or original file name
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page number for pagination
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *         description: Number of items per page (omit to return all)
 *       - in: query
 *         name: sortBy
 *         schema:
 *           type: string
 *           enum: [id, title, created_at, updated_at, file_size]
 *           default: created_at
 *       - in: query
 *         name: order
 *         schema:
 *           type: string
 *           enum: [ASC, DESC]
 *           default: DESC
 *     responses:
 *       200:
 *         description: List of PDF documents
 */
router.get('/', pdfDocumentController.getAllPdfsHandler);

/**
 * @swagger
 * /api/pdfs/{id}:
 *   get:
 *     summary: Retrieve a single PDF document by ID
 *     tags: [PDF Documents]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: PDF document details
 *       404:
 *         description: PDF not found
 */
router.get('/:id', pdfDocumentController.getPdfByIdHandler);

/**
 * @swagger
 * /api/pdfs/{id}/download:
 *   get:
 *     summary: Download the PDF file
 *     tags: [PDF Documents]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: PDF binary file download
 *         content:
 *           application/pdf:
 *             schema:
 *               type: string
 *               format: binary
 *       404:
 *         description: PDF not found
 */
router.get('/:id/download', pdfDocumentController.downloadPdfHandler);

/**
 * @swagger
 * /api/pdfs/{id}/view:
 *   get:
 *     summary: View the PDF file inline in browser
 *     tags: [PDF Documents]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: PDF binary stream for inline viewing
 *         content:
 *           application/pdf:
 *             schema:
 *               type: string
 *               format: binary
 *       404:
 *         description: PDF not found
 */
router.get('/:id/view', pdfDocumentController.downloadPdfHandler);

/**
 * @swagger
 * /api/pdfs/{id}:
 *   put:
 *     summary: Update PDF details or replace uploaded PDF file
 *     tags: [PDF Documents]
 *     consumes:
 *       - multipart/form-data
 *       - application/json
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               title:
 *                 type: string
 *               description:
 *                 type: string
 *               categoryId:
 *                 type: integer
 *               categoryName:
 *                 type: string
 *               file:
 *                 type: string
 *                 format: binary
 *                 description: Optional new PDF file to replace the existing one
 *     responses:
 *       200:
 *         description: PDF updated successfully
 *       404:
 *         description: PDF not found
 */
router.put('/:id', handlePdfUpload, pdfDocumentController.updatePdfHandler);
router.patch('/:id', handlePdfUpload, pdfDocumentController.updatePdfHandler);

/**
 * @swagger
 * /api/pdfs/{id}:
 *   delete:
 *     summary: Delete a PDF document and remove file from disk
 *     tags: [PDF Documents]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: PDF deleted successfully
 *       404:
 *         description: PDF not found
 */
router.delete('/:id', pdfDocumentController.deletePdfHandler);

module.exports = router;
