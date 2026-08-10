const express = require('express');
const router = express.Router();
const subjectController = require('../controllers/subjectController');

/**
 * @swagger
 * tags:
 *   name: Subjects
 *   description: Subject and test mapping APIs
 */

/**
 * @swagger
 * /api/subjects/{subjectId}/tests:
 *   get:
 *     summary: Get all active tests for a specific subject
 *     tags: [Subjects]
 *     parameters:
 *       - in: path
 *         name: subjectId
 *         schema:
 *           type: integer
 *         required: true
 *         description: The subject ID
 *     responses:
 *       200:
 *         description: List of tests
 */
router.get('/:subjectId/tests', subjectController.getSubjectTests);

module.exports = router;
