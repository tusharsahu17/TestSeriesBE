/**
 * @swagger
 * tags:
 *   name: Admin - Tests
 *   description: Test configuration management for Admins
 */

const express = require('express');
const router = express.Router();
const adminTestController = require('../controllers/adminTestController');

/**
 * @swagger
 * /api/admin/tests:
 *   post:
 *     summary: Create a new test configuration (Full Mock, Subject-Wise, or Topic-Wise)
 *     tags: [Admin - Tests]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *             properties:
 *               exam_id:
 *                 type: integer
 *               subject_id:
 *                 type: integer
 *               test_type:
 *                 type: string
 *                 enum: [full_length, subject_wise, topic_wise]
 *                 default: topic_wise
 *               topic_id:
 *                 type: integer
 *                 description: ID of topic for Topic-Wise test
 *               subtopic_id:
 *                 type: integer
 *                 description: Optional ID of subtopic
 *               topic_ids:
 *                 type: array
 *                 items:
 *                   type: integer
 *                 description: Array of topic IDs if test covers multiple topics
 *               name:
 *                 type: string
 *                 example: Percentage Practice Test 01
 *               description:
 *                 type: string
 *               instructions:
 *                 type: string
 *               duration_minutes:
 *                 type: integer
 *                 example: 30
 *               total_marks:
 *                 type: number
 *                 example: 50
 *               passing_marks:
 *                 type: number
 *                 example: 20
 *               negative_marking:
 *                 type: number
 *                 example: 0.25
 *               difficulty:
 *                 type: string
 *                 enum: [Easy, Medium, Hard]
 *               start_time:
 *                 type: string
 *                 format: date-time
 *               end_time:
 *                 type: string
 *                 format: date-time
 *               max_attempts:
 *                 type: integer
 *                 default: 1
 *               randomize_questions:
 *                 type: boolean
 *               randomize_options:
 *                 type: boolean
 *               navigation_settings:
 *                 type: string
 *               auto_submit:
 *                 type: boolean
 *               is_published:
 *                 type: boolean
 *     responses:
 *       201:
 *         description: Test created successfully
 *       400:
 *         description: Bad request
 *       500:
 *         description: Server error
 */
router.post('/', adminTestController.createTestHandler);

/**
 * @swagger
 * /api/admin/tests:
 *   get:
 *     summary: List all tests with comprehensive filters (exam, subject, topic, test_type)
 *     tags: [Admin - Tests]
 *     parameters:
 *       - in: query
 *         name: exam_id
 *         schema:
 *           type: integer
 *         description: Filter by Exam ID
 *       - in: query
 *         name: subject_id
 *         schema:
 *           type: integer
 *         description: Filter by Subject ID
 *       - in: query
 *         name: topic_id
 *         schema:
 *           type: integer
 *         description: Filter by Topic ID
 *       - in: query
 *         name: subtopic_id
 *         schema:
 *           type: integer
 *         description: Filter by Subtopic ID
 *       - in: query
 *         name: test_type
 *         schema:
 *           type: string
 *         description: Filter by Test Type (e.g. topic_wise, subject_wise, full_length)
 *       - in: query
 *         name: is_published
 *         schema:
 *           type: boolean
 *         description: Filter by publish status
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search by test name
 *     responses:
 *       200:
 *         description: A list of tests
 *       500:
 *         description: Server error
 */
router.get('/', adminTestController.listTestsHandler);

/**
 * @swagger
 * /api/admin/tests/{id}:
 *   get:
 *     summary: Get details of a specific test
 *     tags: [Admin - Tests]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Details of the test including questions
 *       404:
 *         description: Test not found
 *       500:
 *         description: Server error
 */
router.get('/:id', adminTestController.getTestDetailsHandler);

/**
 * @swagger
 * /api/admin/tests/{id}:
 *   put:
 *     summary: Update test configuration
 *     tags: [Admin - Tests]
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
 *               exam_id:
 *                 type: integer
 *               subject_id:
 *                 type: integer
 *               test_type:
 *                 type: string
 *               topic_id:
 *                 type: integer
 *               subtopic_id:
 *                 type: integer
 *               topic_ids:
 *                 type: array
 *                 items:
 *                   type: integer
 *               name:
 *                 type: string
 *               description:
 *                 type: string
 *               instructions:
 *                 type: string
 *               duration_minutes:
 *                 type: integer
 *               total_marks:
 *                 type: number
 *               passing_marks:
 *                 type: number
 *               negative_marking:
 *                 type: number
 *               difficulty:
 *                 type: string
 *               start_time:
 *                 type: string
 *                 format: date-time
 *               end_time:
 *                 type: string
 *                 format: date-time
 *               max_attempts:
 *                 type: integer
 *               randomize_questions:
 *                 type: boolean
 *               randomize_options:
 *                 type: boolean
 *               navigation_settings:
 *                 type: string
 *               auto_submit:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Test updated successfully
 *       500:
 *         description: Server error
 */
router.put('/:id', adminTestController.updateTestHandler);

/**
 * @swagger
 * /api/admin/tests/{id}:
 *   delete:
 *     summary: Delete a test
 *     tags: [Admin - Tests]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Test deleted successfully
 *       500:
 *         description: Server error
 */
router.delete('/:id', adminTestController.deleteTestHandler);

/**
 * @swagger
 * /api/admin/tests/{id}/publish:
 *   patch:
 *     summary: Toggle publish status of a test
 *     tags: [Admin - Tests]
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
 *             required:
 *               - is_published
 *             properties:
 *               is_published:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Publish status updated successfully
 *       400:
 *         description: Invalid input
 *       500:
 *         description: Server error
 */
router.patch('/:id/publish', adminTestController.togglePublishHandler);

/**
 * @swagger
 * /api/admin/tests/{id}/duplicate:
 *   post:
 *     summary: Duplicate a test (Deep Copy including questions & topic associations)
 *     tags: [Admin - Tests]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       201:
 *         description: Test duplicated successfully
 *       500:
 *         description: Server error
 */
router.post('/:id/duplicate', adminTestController.duplicateTestHandler);

// -------------------------------------------------------------
// Question Bank Integration Endpoints for Test (Step 6 of Flow)
// -------------------------------------------------------------

/**
 * @swagger
 * /api/admin/tests/{id}/questions:
 *   get:
 *     summary: Get all questions assigned to this test
 *     tags: [Admin - Tests]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: List of questions with options
 *       500:
 *         description: Server error
 */
router.get('/:id/questions', adminTestController.getTestQuestionsHandler);

/**
 * @swagger
 * /api/admin/tests/{id}/questions:
 *   post:
 *     summary: Assign questions from Question Bank to this test
 *     tags: [Admin - Tests]
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
 *               question_ids:
 *                 type: array
 *                 items:
 *                   type: integer
 *                 example: [1, 2, 3]
 *               questionId:
 *                 type: integer
 *                 example: 1
 *     responses:
 *       200:
 *         description: Questions assigned to test successfully
 *       400:
 *         description: Invalid input
 *       500:
 *         description: Server error
 */
router.post('/:id/questions', adminTestController.addQuestionsToTestHandler);

/**
 * @swagger
 * /api/admin/tests/{id}/questions/{questionId}:
 *   delete:
 *     summary: Remove a question from a test (unlinks back to Question Bank)
 *     tags: [Admin - Tests]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *       - in: path
 *         name: questionId
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Question unlinked from test successfully
 *       500:
 *         description: Server error
 */
router.delete('/:id/questions/:questionId', adminTestController.removeQuestionFromTestHandler);

/**
 * @swagger
 * /api/admin/tests/{id}/questions/order:
 *   put:
 *     summary: Reorder questions inside a test
 *     tags: [Admin - Tests]
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
 *             required:
 *               - orders
 *             properties:
 *               orders:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     question_id:
 *                       type: integer
 *                     order:
 *                       type: integer
 *     responses:
 *       200:
 *         description: Questions reordered successfully
 *       500:
 *         description: Server error
 */
router.put('/:id/questions/order', adminTestController.reorderTestQuestionsHandler);

/**
 * @swagger
 * /api/admin/tests/{id}/questions/auto-populate:
 *   post:
 *     summary: Auto-populate questions from Question Bank matching test's topic/subject/difficulty
 *     tags: [Admin - Tests]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               count:
 *                 type: integer
 *                 default: 10
 *               topic_id:
 *                 type: integer
 *               difficulty:
 *                 type: string
 *                 enum: [All, Easy, Medium, Hard]
 *     responses:
 *       200:
 *         description: Matching questions assigned
 *       500:
 *         description: Server error
 */
router.post('/:id/questions/auto-populate', adminTestController.autoPopulateQuestionsHandler);

module.exports = router;
