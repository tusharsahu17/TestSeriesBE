const express = require('express');
const router = express.Router();
const testController = require('../controllers/testController');

/**
 * @swagger
 * tags:
 *   name: Tests
 *   description: Test and questions APIs
 */

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
router.post('/:testId/start', testController.startTest);

module.exports = router;
