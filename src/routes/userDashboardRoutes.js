/**
 * @swagger
 * tags:
 *   name: Student Dashboard
 *   description: Authenticated student dashboard, test discovery, attempt history, performance analytics, and notifications
 */

const express = require('express');
const router = express.Router();
const { authenticateStudent } = require('../middleware/authMiddleware');
const studentDashboardController = require('../controllers/studentDashboardController');

router.use(authenticateStudent);

/**
 * @swagger
 * /api/user/dashboard:
 *   get:
 *     summary: Get combined student dashboard payload (all 6 sections)
 *     tags: [Student Dashboard]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: range
 *         schema:
 *           type: string
 *           enum: [7d, 30d, 90d, 6m, 1y, all]
 *     responses:
 *       200:
 *         description: Combined dashboard payload
 *       401:
 *         description: Token required
 */
router.get('/dashboard', studentDashboardController.getFullDashboard);

/**
 * @swagger
 * /api/user/dashboard/summary:
 *   get:
 *     summary: Get student overview cards (tests attempted, average score, accuracy, active test series)
 *     tags: [Student Dashboard]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Student overview summary
 */
router.get('/dashboard/summary', studentDashboardController.getDashboardSummary);

/**
 * @swagger
 * /api/user/dashboard/available-tests:
 *   get:
 *     summary: Get eligible and upcoming tests for the authenticated student
 *     tags: [Student Dashboard]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: exam_id
 *         schema:
 *           type: integer
 *         description: Filter available tests by exam ID
 *       - in: query
 *         name: subject_id
 *         schema:
 *           type: integer
 *         description: Filter available tests by subject ID
 *       - in: query
 *         name: topic_id
 *         schema:
 *           type: integer
 *         description: Filter available tests by topic ID
 *       - in: query
 *         name: subtopic_id
 *         schema:
 *           type: integer
 *         description: Filter available tests by subtopic ID
 *       - in: query
 *         name: test_type
 *         schema:
 *           type: string
 *         description: Filter available tests by test type (e.g. topic_wise, subject_wise, full_length)
 *       - in: query
 *         name: bucket
 *         schema:
 *           type: string
 *           enum: [all, new, upcoming, recommended, free, purchased]
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
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
 *         description: Available tests and categorized discovery buckets
 */
router.get('/dashboard/available-tests', studentDashboardController.getAvailableTests);

/**
 * @swagger
 * /api/user/dashboard/recent-attempts:
 *   get:
 *     summary: Get student's latest five evaluated test attempts sorted by submission date descending
 *     tags: [Student Dashboard]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Latest five evaluated attempts
 */
router.get('/dashboard/recent-attempts', studentDashboardController.getRecentAttempts);

/**
 * @swagger
 * /api/user/dashboard/performance:
 *   get:
 *     summary: Get student score trend (latest 10), subject-wise performance, and aggregate metrics
 *     tags: [Student Dashboard]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: range
 *         schema:
 *           type: string
 *           enum: [7d, 30d, 90d, 6m, 1y, all]
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
 *       - in: query
 *         name: subject
 *         schema:
 *           type: string
 *       - in: query
 *         name: topic_id
 *         schema:
 *           type: integer
 *         description: Filter performance analytics by topic ID
 *       - in: query
 *         name: test_type
 *         schema:
 *           type: string
 *         description: Filter performance analytics by test type
 *     responses:
 *       200:
 *         description: Student performance analytics
 */
router.get('/dashboard/performance', studentDashboardController.getPerformanceAnalytics);

/**
 * @swagger
 * /api/user/dashboard/notifications:
 *   get:
 *     summary: Get student's latest 5 notifications and unread count
 *     tags: [Student Dashboard]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Latest 5 notifications and unread count
 */
router.get('/dashboard/notifications', studentDashboardController.getDashboardNotifications);

// Full pages & actions
/**
 * @swagger
 * /api/user/tests:
 *   get:
 *     summary: Get full paginated eligible and upcoming tests for the authenticated student
 *     tags: [Student Dashboard]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: exam_id
 *         schema:
 *           type: integer
 *         description: Filter tests by exam ID
 *       - in: query
 *         name: subject_id
 *         schema:
 *           type: integer
 *         description: Filter tests by subject ID
 *       - in: query
 *         name: topic_id
 *         schema:
 *           type: integer
 *         description: Filter tests by topic ID
 *       - in: query
 *         name: subtopic_id
 *         schema:
 *           type: integer
 *         description: Filter tests by subtopic ID
 *       - in: query
 *         name: test_type
 *         schema:
 *           type: string
 *         description: Filter tests by test type (e.g. topic_wise, subject_wise, full_length)
 *       - in: query
 *         name: bucket
 *         schema:
 *           type: string
 *           enum: [all, new, upcoming, recommended, free, purchased]
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
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
 *         description: Paginated tests list
 */
router.get('/tests', studentDashboardController.getAvailableTests);

/**
 * @swagger
 * /api/user/tests/{testId}/start:
 *   post:
 *     summary: Validate eligibility, schedule, attempt limit, and active attempts before starting a test
 *     tags: [Student Dashboard]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: testId
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       201:
 *         description: Attempt started
 *       400:
 *         description: Schedule invalid
 *       403:
 *         description: Unavailable, access denied, or attempt limit reached
 *       409:
 *         description: Conflicting active attempt exists
 */
router.post('/tests/:testId/start', studentDashboardController.startTest);

/**
 * @swagger
 * /api/user/attempts:
 *   get:
 *     summary: Get paginated evaluated attempt history for the authenticated student
 *     tags: [Student Dashboard]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *       - in: query
 *         name: range
 *         schema:
 *           type: string
 *           enum: [7d, 30d, 90d, 6m, 1y, all]
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Paginated attempt history
 */
router.get('/attempts', studentDashboardController.getAllAttempts);

/**
 * @swagger
 * /api/user/attempts/{attemptId}/result:
 *   get:
 *     summary: Get detailed result page (marks, subject-wise breakdown, question review, explanations)
 *     tags: [Student Dashboard]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: attemptId
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Detailed attempt result
 *       403:
 *         description: Evaluation not complete yet
 *       404:
 *         description: Attempt not found
 */
router.get('/attempts/:attemptId/result', studentDashboardController.getAttemptResult);

/**
 * @swagger
 * /api/user/attempts/{attemptId}/abandon:
 *   post:
 *     summary: Mark an in-progress attempt as abandoned
 *     tags: [Student Dashboard]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: attemptId
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Attempt marked as abandoned
 */
router.post('/attempts/:attemptId/abandon', studentDashboardController.abandonAttempt);

/**
 * @swagger
 * /api/user/notifications:
 *   get:
 *     summary: Get paginated notifications for the authenticated student
 *     tags: [Student Dashboard]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *       - in: query
 *         name: unreadOnly
 *         schema:
 *           type: boolean
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *           enum: [ALL, NEW_TEST, RESULT_PUBLISHED, SERIES_EXPIRING, PAYMENT_CONFIRMED, ANNOUNCEMENT]
 *     responses:
 *       200:
 *         description: Paginated notifications list
 */
router.get('/notifications', studentDashboardController.getAllNotifications);

/**
 * @swagger
 * /api/user/notifications/read-all:
 *   patch:
 *     summary: Mark all notifications as read for the authenticated student
 *     tags: [Student Dashboard]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: All notifications marked as read
 */
router.patch('/notifications/read-all', studentDashboardController.markAllNotificationsRead);

/**
 * @swagger
 * /api/user/notifications/{id}/read:
 *   patch:
 *     summary: Mark a specific notification as read
 *     tags: [Student Dashboard]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Notification marked as read
 *       404:
 *         description: Notification not found
 */
router.patch('/notifications/:id/read', studentDashboardController.markNotificationRead);

module.exports = router;
