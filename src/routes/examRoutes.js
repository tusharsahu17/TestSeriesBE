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
 *     summary: Get all exams
 *     tags: [Exams]
 *     responses:
 *       200:
 *         description: List of exams
 */
router.get('/', examController.getAllExams);

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
 *             required:
 *               - name
 *             properties:
 *               name:
 *                 type: string
 *               description:
 *                 type: string
 *     responses:
 *       201:
 *         description: Exam created successfully
 */
router.post('/', examController.createExam);

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
 * /api/exams/{id}:
 *   put:
 *     summary: Update an exam
 *     tags: [Exams]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Exam updated successfully
 */
router.put('/:id', examController.updateExam);

/**
 * @swagger
 * /api/exams/{id}:
 *   delete:
 *     summary: Delete an exam
 *     tags: [Exams]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Exam deleted successfully
 */
router.delete('/:id', examController.deleteExam);

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
 * /api/exams/{examId}/subjects:
 *   post:
 *     summary: Link a subject to an exam
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
 *             required:
 *               - subjectId
 *             properties:
 *               subjectId:
 *                 type: integer
 *     responses:
 *       201:
 *         description: Subject added to exam
 */
router.post('/:examId/subjects', examController.addSubjectToExam);

/**
 * @swagger
 * /api/exams/{examId}/subjects/{subjectId}:
 *   delete:
 *     summary: Remove a subject from an exam
 *     tags: [Exams]
 *     parameters:
 *       - in: path
 *         name: examId
 *         required: true
 *       - in: path
 *         name: subjectId
 *         required: true
 *     responses:
 *       200:
 *         description: Subject removed from exam
 */
router.delete('/:examId/subjects/:subjectId', examController.removeSubjectFromExam);

module.exports = router;
