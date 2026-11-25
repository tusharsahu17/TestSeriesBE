const express = require('express');
const router = express.Router();
const testController = require('../controllers/testController');
const { authenticateToken } = require('../middleware/authMiddleware');

/**
 * @swagger
 * tags:
 *   name: Tests
 *   description: Test and questions APIs
 */

/**
 * @swagger
 * /api/tests:
 *   get:
 *     summary: List published active tests (filtered by exam_id, subject_id, topic_id, subtopic_id, test_type, search)
 *     tags: [Tests]
 *     parameters:
 *       - in: query
 *         name: exam_id
 *         schema:
 *           type: integer
 *       - in: query
 *         name: subject_id
 *         schema:
 *           type: integer
 *       - in: query
 *         name: topic_id
 *         schema:
 *           type: integer
 *       - in: query
 *         name: subtopic_id
 *         schema:
 *           type: integer
 *       - in: query
 *         name: test_type
 *         schema:
 *           type: string
 *           description: e.g. topic_wise, subject_wise, full_length
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: List of published active tests
 */
router.get('/', testController.listTests);

/**
 * @swagger
 * /api/tests/{testId}:
 *   get:
 *     summary: Get details of a specific test
 *     tags: [Tests]
 *     parameters:
 *       - in: path
 *         name: testId
 *         schema:
 *           type: integer
 *         required: true
 *         description: The test ID
 *     responses:
 *       200:
 *         description: Test details
 *       404:
 *         description: Test not found
 */
router.get('/:testId', testController.getTestDetails);

/**
 * @swagger
 * /api/tests/{testId}/questions:
 *   get:
 *     summary: Get questions and options for a specific test
 *     tags: [Tests]
 *     parameters:
 *       - in: path
 *         name: testId
 *         schema:
 *           type: integer
 *         required: true
 *         description: The test ID
 *     responses:
 *       200:
 *         description: List of questions with their options
 */
router.get('/:testId/questions', testController.getTestQuestions);

/**
 * @swagger
 * /api/tests/{testId}/start:
 *   post:
 *     summary: Start a new attempt for a test
 *     tags: [Tests]
 *     parameters:
 *       - in: path
 *         name: testId
 *         schema:
 *           type: integer
 *         required: true
 *         description: The test ID
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               userId:
 *                 type: integer
 *                 description: User ID (temporary MVP fallback)
 *     responses:
 *       200:
 *         description: Returns the attemptId
 */
router.post('/:testId/start', authenticateToken, testController.startTest);

module.exports = router;
