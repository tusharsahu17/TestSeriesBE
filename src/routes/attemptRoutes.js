const express = require('express');
const router = express.Router();
const attemptController = require('../controllers/attemptController');

/**
 * @swagger
 * tags:
 *   name: Attempts
 *   description: Test attempt and submission APIs
 */

/**
 * @swagger
 * /api/attempts/:
 *   get:
 *     summary: Get all test attempts for the current user
 *     tags: [Attempts]
 *     responses:
 *       200:
 *         description: List of attempts
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 */
router.get('/', attemptController.getAllAttempts);

/**
 * @swagger
 * /api/attempts/{attemptId}/answer:
 *   post:
 *     summary: Save an answer for a specific test attempt
 *     tags: [Attempts]
 *     parameters:
 *       - in: path
 *         name: attemptId
 *         schema:
 *           type: integer
 *         required: true
 *         description: The attempt ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - questionId
 *               - optionId
 *             properties:
 *               questionId:
 *                 type: integer
 *               optionId:
 *                 type: integer
 *     responses:
 *       200:
 *         description: Result of the saved answer
 */
router.post('/:attemptId/answer', attemptController.saveAnswer);

/**
 * @swagger
 * /api/attempts/{attemptId}/submit:
 *   post:
 *     summary: Submit a test attempt and calculate final score
 *     tags: [Attempts]
 *     parameters:
 *       - in: path
 *         name: attemptId
 *         schema:
 *           type: integer
 *         required: true
 *         description: The attempt ID
 *     responses:
 *       200:
 *         description: Final score and status
 */
router.post('/:attemptId/submit', attemptController.submitAttempt);

/**
 * @swagger
 * /api/attempts/{attemptId}/result:
 *   get:
 *     summary: Get the result of a completed attempt
 *     tags: [Attempts]
 *     parameters:
 *       - in: path
 *         name: attemptId
 *         schema:
 *           type: integer
 *         required: true
 *         description: The attempt ID
 *     responses:
 *       200:
 *         description: Attempt details including all saved answers
 *       404:
 *         description: Attempt not found
 */
router.get('/:attemptId/result', attemptController.getResult);

/**
 * @swagger
 * /api/attempts/{attemptId}/answers:
 *   get:
 *     summary: Get the detailed answers for an attempt
 *     tags: [Attempts]
 *     parameters:
 *       - in: path
 *         name: attemptId
 *         schema:
 *           type: integer
 *         required: true
 *         description: The attempt ID
 *     responses:
 *       200:
 *         description: Attempt details including deep question/option hierarchy
 *       404:
 *         description: Attempt not found
 */
router.get('/:attemptId/answers', attemptController.getAnswers);

module.exports = router;
