const express = require('express');
const router = express.Router();
const examController = require('../controllers/examController');

/**
 * @swagger
 * tags:
 *   name: Exams
 *   description: Exam management APIs
 */

/**
 * @swagger
 * /api/exams:
 *   get:
 *     summary: Get all active exams
 *     tags: [Exams]
 *     responses:
 *       200:
 *         description: List of active exams
 */
router.get('/', examController.getAllExams);

/**
 * @swagger
 * /api/exams/{examId}:
 *   get:
 *     summary: Get details of a specific exam
 *     tags: [Exams]
 *     parameters:
 *       - in: path
 *         name: examId
 *         schema:
 *           type: integer
 *         required: true
 *         description: The exam ID
 *     responses:
 *       200:
 *         description: Exam details
 *       404:
 *         description: Exam not found
 */
router.get('/:examId', examController.getExamDetails);

/**
 * @swagger
 * /api/exams/{examId}/subjects:
 *   get:
 *     summary: Get subjects for a specific exam
 *     tags: [Exams]
 *     parameters:
 *       - in: path
 *         name: examId
 *         schema:
 *           type: integer
 *         required: true
 *         description: The exam ID
 *     responses:
 *       200:
 *         description: List of subjects belonging to the exam
 */
router.get('/:examId/subjects', examController.getExamSubjects);

module.exports = router;
