/**
 * @swagger
 * tags:
 *   name: Admin - Question Bank
 *   description: Question Bank management for Admins
 */

const express = require('express');
const router = express.Router();
const multer = require('multer');
const adminQuestionController = require('../controllers/adminQuestionController');

// Set up multer for memory storage (for processing buffer directly)
const upload = multer({ storage: multer.memoryStorage() });

/**
 * @swagger
 * /api/admin/questions:
 *   post:
 *     summary: Create a single question
 *     tags: [Admin - Question Bank]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - question_text
 *             properties:
 *               test_id:
 *                 type: integer
 *                 description: Optional. The ID of the test this question belongs to.
 *               question_text:
 *                 type: string
 *               question_type:
 *                 type: string
 *               marks:
 *                 type: number
 *               negative_marks:
 *                 type: number
 *               difficulty:
 *                 type: string
 *               explanation:
 *                 type: string
 *               category:
 *                 type: string
 *               subject:
 *                 type: string
 *               topic:
 *                 type: string
 *               subtopic:
 *                 type: string
 *               tags:
 *                 type: string
 *               options:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     option_text:
 *                       type: string
 *                     option_key:
 *                       type: string
 *                     is_correct:
 *                       type: boolean
 *                     display_order:
 *                       type: integer
 *     responses:
 *       201:
 *         description: Question created successfully
 *       400:
 *         description: Bad request
 *       500:
 *         description: Server error
 */
router.post('/', adminQuestionController.createQuestionHandler);

/**
 * @swagger
 * /api/admin/questions:
 *   get:
 *     summary: List and filter questions from the bank
 *     tags: [Admin - Question Bank]
 *     parameters:
 *       - in: query
 *         name: category
 *         schema:
 *           type: string
 *       - in: query
 *         name: subject
 *         schema:
 *           type: string
 *       - in: query
 *         name: topic
 *         schema:
 *           type: string
 *       - in: query
 *         name: difficulty
 *         schema:
 *           type: string
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search by question text
 *     responses:
 *       200:
 *         description: A list of questions
 *       500:
 *         description: Server error
 */
router.get('/', adminQuestionController.listQuestionsHandler);

/**
 * @swagger
 * /api/admin/questions/{id}:
 *   get:
 *     summary: Get details of a specific question (includes options)
 *     tags: [Admin - Question Bank]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Details of the question
 *       404:
 *         description: Question not found
 *       500:
 *         description: Server error
 */
router.get('/:id', adminQuestionController.getQuestionDetailsHandler);

/**
 * @swagger
 * /api/admin/questions/{id}:
 *   put:
 *     summary: Update an existing question and its options
 *     tags: [Admin - Question Bank]
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
 *               question_text:
 *                 type: string
 *               question_type:
 *                 type: string
 *               marks:
 *                 type: number
 *               negative_marks:
 *                 type: number
 *               difficulty:
 *                 type: string
 *               explanation:
 *                 type: string
 *               category:
 *                 type: string
 *               subject:
 *                 type: string
 *               topic:
 *                 type: string
 *               subtopic:
 *                 type: string
 *               tags:
 *                 type: string
 *               options:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     option_text:
 *                       type: string
 *                     option_key:
 *                       type: string
 *                     is_correct:
 *                       type: boolean
 *                     display_order:
 *                       type: integer
 *     responses:
 *       200:
 *         description: Question updated successfully
 *       500:
 *         description: Server error
 */
router.put('/:id', adminQuestionController.updateQuestionHandler);

/**
 * @swagger
 * /api/admin/questions/{id}:
 *   delete:
 *     summary: Delete a question permanently
 *     tags: [Admin - Question Bank]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Question deleted successfully
 *       500:
 *         description: Server error
 */
router.delete('/:id', adminQuestionController.deleteQuestionHandler);

/**
 * @swagger
 * /api/admin/questions/bulk/upload:
 *   post:
 *     summary: Bulk upload questions via CSV/Excel
 *     tags: [Admin - Question Bank]
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *                 description: The CSV or Excel file containing the questions.
 *     responses:
 *       201:
 *         description: Questions uploaded successfully
 *       400:
 *         description: No valid questions found or missing file
 *       500:
 *         description: Server error
 */
router.post('/bulk/upload', upload.single('file'), adminQuestionController.bulkUploadQuestionsHandler);

module.exports = router;
