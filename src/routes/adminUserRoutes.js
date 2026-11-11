const express = require('express');
const adminUserController = require('../controllers/adminUserController');

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: AdminUsers
 *   description: Admin student & user management API
 */

/**
 * @swagger
 * /api/admin/users:
 *   get:
 *     summary: Get all students with filters
 *     tags: [AdminUsers]
 *     parameters:
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search by username, name, email, or phone
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [active, inactive, blocked]
 *         description: Filter by user status
 *       - in: query
 *         name: subscription
 *         schema:
 *           type: string
 *           enum: [active, inactive, free]
 *         description: Filter by subscription status
 *       - in: query
 *         name: dateFrom
 *         schema:
 *           type: string
 *           format: date
 *         description: Registration date from
 *       - in: query
 *         name: dateTo
 *         schema:
 *           type: string
 *           format: date
 *         description: Registration date to
 *     responses:
 *       200:
 *         description: List of users
 */
router.get('/', adminUserController.listUsers);

/**
 * @swagger
 * /api/admin/users/{userId}:
 *   get:
 *     summary: Get student profile overview, engagement status, and quick stats
 *     tags: [AdminUsers]
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Student profile details
 *       404:
 *         description: User not found
 */
router.get('/:userId', adminUserController.getUserProfile);

/**
 * @swagger
 * /api/admin/users/{userId}/analytics:
 *   get:
 *     summary: Get student performance statistics, subject breakdown, score trend, improvement tracker, and weak subjects
 *     tags: [AdminUsers]
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Student performance analytics
 *       404:
 *         description: User not found
 */
router.get('/:userId/analytics', adminUserController.getUserAnalytics);

/**
 * @swagger
 * /api/admin/users/{userId}/test-history:
 *   get:
 *     summary: Get paginated and date-filtered test attempt history for a student
 *     tags: [AdminUsers]
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: integer
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *       - in: query
 *         name: dateFrom
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: dateTo
 *         schema:
 *           type: string
 *           format: date
 *     responses:
 *       200:
 *         description: Paginated test history
 *       404:
 *         description: User not found
 */
router.get('/:userId/test-history', adminUserController.getUserTestHistory);

/**
 * @swagger
 * /api/admin/users/{userId}/test-history/{attemptId}:
 *   get:
 *     summary: Inspect a specific student test attempt including question-by-question answers
 *     tags: [AdminUsers]
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: integer
 *       - in: path
 *         name: attemptId
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Attempt summary and detailed answers
 *       404:
 *         description: Attempt not found for this student
 */
router.get('/:userId/test-history/:attemptId', adminUserController.getUserAttemptDetail);

/**
 * @swagger
 * /api/admin/users/{userId}/attempts:
 *   get:
 *     summary: Get user test attempt history (legacy alias)
 *     tags: [AdminUsers]
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: User test attempts
 */
router.get('/:userId/attempts', adminUserController.getUserAttempts);

/**
 * @swagger
 * /api/admin/users/{userId}/attempts/{attemptId}:
 *   get:
 *     summary: Inspect a specific student test attempt (alias)
 *     tags: [AdminUsers]
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: integer
 *       - in: path
 *         name: attemptId
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Attempt summary and detailed answers
 */
router.get('/:userId/attempts/:attemptId', adminUserController.getUserAttemptDetail);

/**
 * @swagger
 * /api/admin/users/{userId}/test-series:
 *   get:
 *     summary: Get enrolled test series for a student
 *     tags: [AdminUsers]
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: integer
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [ACTIVE, EXPIRED, CANCELLED]
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Enrolled test series list and summary
 */
router.get('/:userId/test-series', adminUserController.getUserTestSeries);

/**
 * @swagger
 * /api/admin/users/{userId}/test-series:
 *   post:
 *     summary: Assign a test series to a student
 *     tags: [AdminUsers]
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [test_series_id]
 *             properties:
 *               test_series_id:
 *                 type: integer
 *               enrollment_type:
 *                 type: string
 *                 enum: [FREE, PAID]
 *               validity_days:
 *                 type: integer
 *               expires_at:
 *                 type: string
 *                 format: date-time
 *     responses:
 *       201:
 *         description: Test series assigned
 *       409:
 *         description: Active enrollment already exists
 */
router.post('/:userId/test-series', adminUserController.assignUserTestSeries);

/**
 * @swagger
 * /api/admin/users/{userId}/test-series/{enrollmentId}/extend:
 *   patch:
 *     summary: Extend access expiry for an enrolled test series
 *     tags: [AdminUsers]
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: integer
 *       - in: path
 *         name: enrollmentId
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
 *               extend_days:
 *                 type: integer
 *               expires_at:
 *                 type: string
 *                 format: date-time
 *               status:
 *                 type: string
 *                 enum: [ACTIVE, EXPIRED, CANCELLED]
 *     responses:
 *       200:
 *         description: Access extended
 */
router.patch('/:userId/test-series/:enrollmentId/extend', adminUserController.extendUserTestSeries);

/**
 * @swagger
 * /api/admin/users/{userId}/test-series/{enrollmentId}/status:
 *   patch:
 *     summary: Update enrollment status for a student's test series
 *     tags: [AdminUsers]
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: integer
 *       - in: path
 *         name: enrollmentId
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
router.patch('/:userId/test-series/:enrollmentId/status', adminUserController.updateUserTestSeriesStatus);

/**
 * @swagger
 * /api/admin/users/{userId}/payments:
 *   get:
 *     summary: Get paginated and date-filtered payment history and summary for a student
 *     tags: [AdminUsers]
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: integer
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [PENDING, SUCCESS, FAILED, REFUNDED]
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *       - in: query
 *         name: dateFrom
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: dateTo
 *         schema:
 *           type: string
 *           format: date
 *     responses:
 *       200:
 *         description: Student payments and summary
 */
router.get('/:userId/payments', adminUserController.getUserPayments);

/**
 * @swagger
 * /api/admin/users/{userId}/payments/{paymentId}:
 *   get:
 *     summary: Get details of a specific payment for a student
 *     tags: [AdminUsers]
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: integer
 *       - in: path
 *         name: paymentId
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Payment details
 *       404:
 *         description: Payment not found
 */
router.get('/:userId/payments/:paymentId', adminUserController.getUserPaymentDetail);

/**
 * @swagger
 * /api/admin/users/{userId}/activity:
 *   get:
 *     summary: Get student activity logs, login history, and milestone timeline
 *     tags: [AdminUsers]
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: integer
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *       - in: query
 *         name: dateFrom
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: dateTo
 *         schema:
 *           type: string
 *           format: date
 *     responses:
 *       200:
 *         description: Student activity logs and timeline
 */
router.get('/:userId/activity', adminUserController.getUserActivityHistory);

/**
 * @swagger
 * /api/admin/users/{userId}/report:
 *   get:
 *     summary: Export consolidated student report (JSON or CSV)
 *     tags: [AdminUsers]
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: integer
 *       - in: query
 *         name: format
 *         schema:
 *           type: string
 *           enum: [json, csv]
 *           default: json
 *     responses:
 *       200:
 *         description: Consolidated student report
 */
router.get('/:userId/report', adminUserController.getUserReport);

/**
 * @swagger
 * /api/admin/users/{userId}/status:
 *   patch:
 *     summary: Update student account status (activate/deactivate/block/unblock)
 *     tags: [AdminUsers]
 *     parameters:
 *       - in: path
 *         name: userId
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
 *                 enum: [active, inactive, blocked]
 *     responses:
 *       200:
 *         description: User status updated
 */
router.patch('/:userId/status', adminUserController.blockUnblockUser);

/**
 * @swagger
 * /api/admin/users/{userId}/password:
 *   patch:
 *     summary: Reset student password securely (bcrypt hashed)
 *     tags: [AdminUsers]
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [newPassword]
 *             properties:
 *               newPassword:
 *                 type: string
 *               confirmPassword:
 *                 type: string
 *     responses:
 *       200:
 *         description: User password reset
 */
router.patch('/:userId/password', adminUserController.resetUserPassword);
router.patch('/:userId/reset-password', adminUserController.resetUserPassword);

/**
 * @swagger
 * /api/admin/users/{userId}:
 *   put:
 *     summary: Update student profile details
 *     tags: [AdminUsers]
 *     parameters:
 *       - in: path
 *         name: userId
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
 *               email:
 *                 type: string
 *               phone:
 *                 type: string
 *     responses:
 *       200:
 *         description: User details updated
 */
router.put('/:userId', adminUserController.updateUserDetails);
router.patch('/:userId/profile', adminUserController.updateUserDetails);

/**
 * @swagger
 * /api/admin/users/{userId}/subscription:
 *   patch:
 *     summary: Update student subscription status
 *     tags: [AdminUsers]
 *     parameters:
 *       - in: path
 *         name: userId
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
 *                 enum: [active, inactive, free]
 *     responses:
 *       200:
 *         description: User subscription status updated
 */
router.patch('/:userId/subscription', adminUserController.toggleSubscription);

module.exports = router;
