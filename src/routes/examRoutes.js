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

/**
 * @swagger
 * /api/exams/{examId}/tests:
 *   get:
 *     summary: Get all active tests for a specific exam across all its subjects
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
 *         description: List of tests belonging to the exam
 */
router.get('/:examId/tests', examController.getExamTests);

/**
 * @swagger
 * /api/exams:
 *   post:
 *     summary: Create a new exam
 *     tags: [Exams]
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
 *               is_active:
 *                 type: boolean
 *     responses:
 *       201:
 *         description: Exam created successfully
 */
router.post('/', examController.createExam);

/**
 * @swagger
 * /api/exams/{examId}:
 *   put:
 *     summary: Update an existing exam
 *     tags: [Exams]
 *     parameters:
 *       - in: path
 *         name: examId
 *         schema:
 *           type: integer
 *         required: true
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
 *               is_active:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Exam updated successfully
 */
router.put('/:examId', examController.updateExam);

/**
 * @swagger
 * /api/exams/{examId}:
 *   delete:
 *     summary: Delete an exam
 *     tags: [Exams]
 *     parameters:
 *       - in: path
 *         name: examId
 *         schema:
 *           type: integer
 *         required: true
 *     responses:
 *       200:
 *         description: Exam deleted successfully
 */
router.delete('/:examId', examController.deleteExam);

/**
 * @swagger
 * /api/exams/{examId}/subjects:
 *   post:
 *     summary: Add a subject to an exam
 *     tags: [Exams]
 *     parameters:
 *       - in: path
 *         name: examId
 *         schema:
 *           type: integer
 *         required: true
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               subjectId:
 *                 type: integer
 *     responses:
 *       201:
 *         description: Subject added successfully
 */
router.post('/:examId/subjects', examController.addSubject);

/**
 * @swagger
 * /api/exams/{examId}/subjects/{subjectId}:
 *   delete:
 *     summary: Remove a subject from an exam
 *     tags: [Exams]
 *     parameters:
 *       - in: path
 *         name: examId
 *         schema:
 *           type: integer
 *         required: true
 *       - in: path
 *         name: subjectId
 *         schema:
 *           type: integer
 *         required: true
 *     responses:
 *       200:
 *         description: Subject removed successfully
 */
router.delete('/:examId/subjects/:subjectId', examController.removeSubject);

module.exports = router;
