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
 *     summary: Create a new test configuration
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
 *               name:
 *                 type: string
 *               subject_id:
 *                 type: integer
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
 *     summary: List all tests
 *     tags: [Admin - Tests]
 *     parameters:
 *       - in: query
 *         name: is_published
 *         schema:
 *           type: boolean
 *         description: Filter by publish status
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
 *               name:
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
 *     summary: Duplicate a test (Deep Copy)
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

module.exports = router;
