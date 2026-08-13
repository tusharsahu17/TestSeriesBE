/**
 * @swagger
 * tags:
 *   name: Admin - Results
 *   description: View and manage user test results and analytics
 */

const express = require('express');
const router = express.Router();
const adminResultController = require('../controllers/adminResultController');

/**
 * @swagger
 * /api/admin/results/test/{testId}:
 *   get:
 *     summary: Get all results for a specific test
 *     tags: [Admin - Results]
 *     parameters:
 *       - in: path
 *         name: testId
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: List of test results including calculated ranks and percentiles
 *       500:
 *         description: Server error
 */
router.get('/test/:testId', adminResultController.getTestResultsHandler);

/**
 * @swagger
 * /api/admin/results/user/{userId}:
 *   get:
 *     summary: Get all results for a specific user
 *     tags: [Admin - Results]
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: List of test results for the user
 *       500:
 *         description: Server error
 */
router.get('/user/:userId', adminResultController.getUserResultsHandler);

/**
 * @swagger
 * /api/admin/results/attempt/{attemptId}:
 *   get:
 *     summary: Get detailed result for a specific attempt
 *     tags: [Admin - Results]
 *     parameters:
 *       - in: path
 *         name: attemptId
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Detailed attempt result including question breakdown
 *       404:
 *         description: Attempt not found
 *       500:
 *         description: Server error
 */
router.get('/attempt/:attemptId', adminResultController.getIndividualResultHandler);

/**
 * @swagger
 * /api/admin/results/test/{testId}/recalculate:
 *   post:
 *     summary: Recalculate results for all attempts of a test
 *     description: Useful if the answer key changes or a question is deleted. Re-evaluates marks and ranks for all submitted attempts.
 *     tags: [Admin - Results]
 *     parameters:
 *       - in: path
 *         name: testId
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Recalculation successful
 *       500:
 *         description: Server error
 */
router.post('/test/:testId/recalculate', adminResultController.recalculateResultsHandler);

module.exports = router;
