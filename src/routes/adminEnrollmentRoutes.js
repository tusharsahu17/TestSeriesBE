/**
 * @swagger
 * tags:
 *   name: Admin - Enrollments
 *   description: Manage student enrollments in test series
 */

const express = require('express');
const adminEnrollmentController = require('../controllers/adminEnrollmentController');

const router = express.Router();

/**
 * @swagger
 * /api/admin/enrollments:
 *   get:
 *     summary: List all test series enrollments
 *     tags: [Admin - Enrollments]
 *     parameters:
 *       - in: query
 *         name: user_id
 *         schema:
 *           type: integer
 *       - in: query
 *         name: test_series_id
 *         schema:
 *           type: integer
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [ACTIVE, EXPIRED, CANCELLED]
 *       - in: query
 *         name: enrollment_type
 *         schema:
 *           type: string
 *           enum: [FREE, PAID]
 *     responses:
 *       200:
 *         description: List of enrollments
 */
router.get('/', adminEnrollmentController.listEnrollments);

/**
 * @swagger
 * /api/admin/enrollments:
 *   post:
 *     summary: Enroll a student into a test series
 *     tags: [Admin - Enrollments]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [user_id, test_series_id]
 *             properties:
 *               user_id:
 *                 type: integer
 *               test_series_id:
 *                 type: integer
 *               enrollment_type:
 *                 type: string
 *                 enum: [FREE, PAID]
 *               payment_id:
 *                 type: integer
 *               expires_at:
 *                 type: string
 *                 format: date-time
 *     responses:
 *       201:
 *         description: Student enrolled successfully
 */
router.post('/', adminEnrollmentController.createEnrollment);

/**
 * @swagger
 * /api/admin/enrollments/{id}/status:
 *   patch:
 *     summary: Update enrollment status
 *     tags: [Admin - Enrollments]
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
 *             required: [status]
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [ACTIVE, EXPIRED, CANCELLED]
 *     responses:
 *       200:
 *         description: Enrollment status updated
 */
router.patch('/:id/status', adminEnrollmentController.updateEnrollmentStatus);

module.exports = router;

