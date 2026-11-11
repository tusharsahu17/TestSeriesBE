/**
 * @swagger
 * tags:
 *   name: Admin - Dashboard
 *   description: Admin analytics dashboard APIs covering platform, student, test, series, revenue, and performance metrics
 */

const express = require('express');
const adminDashboardController = require('../controllers/adminDashboardController');

const router = express.Router();

/**
 * @swagger
 * /api/admin/dashboard:
 *   get:
 *     summary: Get complete admin dashboard analytics (all 6 sections)
 *     tags: [Admin - Dashboard]
 *     parameters:
 *       - in: query
 *         name: studentDays
 *         schema:
 *           type: integer
 *           default: 30
 *       - in: query
 *         name: weeks
 *         schema:
 *           type: integer
 *           default: 12
 *       - in: query
 *         name: studentMonths
 *         schema:
 *           type: integer
 *           default: 12
 *       - in: query
 *         name: testDays
 *         schema:
 *           type: integer
 *           default: 7
 *       - in: query
 *         name: revenueMonths
 *         schema:
 *           type: integer
 *           default: 6
 *       - in: query
 *         name: seriesLimit
 *         schema:
 *           type: integer
 *           default: 50
 *     responses:
 *       200:
 *         description: Complete dashboard payload
 *       500:
 *         description: Server error
 */
router.get('/', adminDashboardController.getDashboardOverview);

/**
 * @swagger
 * /api/admin/dashboard/overview:
 *   get:
 *     summary: Get overview statistics (top cards)
 *     tags: [Admin - Dashboard]
 *     responses:
 *       200:
 *         description: Overview top cards data
 *       500:
 *         description: Server error
 */
router.get('/overview', adminDashboardController.getOverviewCards);

/**
 * @swagger
 * /api/admin/dashboard/students:
 *   get:
 *     summary: Get student analytics and registration growth trends (daily, weekly, monthly)
 *     tags: [Admin - Dashboard]
 *     parameters:
 *       - in: query
 *         name: days
 *         schema:
 *           type: integer
 *           default: 30
 *       - in: query
 *         name: weeks
 *         schema:
 *           type: integer
 *           default: 12
 *       - in: query
 *         name: months
 *         schema:
 *           type: integer
 *           default: 12
 *     responses:
 *       200:
 *         description: Student analytics and registration growth charts
 *       500:
 *         description: Server error
 */
router.get('/students', adminDashboardController.getStudentAnalytics);

/**
 * @swagger
 * /api/admin/dashboard/tests:
 *   get:
 *     summary: Get test analytics and daily test attempts overview chart
 *     tags: [Admin - Dashboard]
 *     parameters:
 *       - in: query
 *         name: days
 *         schema:
 *           type: integer
 *           default: 7
 *     responses:
 *       200:
 *         description: Test analytics and attempts overview chart
 *       500:
 *         description: Server error
 */
router.get('/tests', adminDashboardController.getTestAnalytics);

/**
 * @swagger
 * /api/admin/dashboard/test-series:
 *   get:
 *     summary: Get test series performance table, highlights, and recently published series
 *     tags: [Admin - Dashboard]
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *     responses:
 *       200:
 *         description: Test series performance metrics
 *       500:
 *         description: Server error
 */
router.get('/test-series', adminDashboardController.getTestSeriesPerformance);

/**
 * @swagger
 * /api/admin/dashboard/revenue:
 *   get:
 *     summary: Get revenue analytics, payment status breakdown, subscriptions, and monthly revenue chart
 *     tags: [Admin - Dashboard]
 *     parameters:
 *       - in: query
 *         name: months
 *         schema:
 *           type: integer
 *           default: 6
 *     responses:
 *       200:
 *         description: Revenue analytics data
 *       500:
 *         description: Server error
 */
router.get('/revenue', adminDashboardController.getRevenueAnalytics);

/**
 * @swagger
 * /api/admin/dashboard/student-performance:
 *   get:
 *     summary: Get student academic performance analytics and subject-wise accuracy
 *     tags: [Admin - Dashboard]
 *     responses:
 *       200:
 *         description: Academic overview and subject-wise average accuracy
 *       500:
 *         description: Server error
 */
router.get('/student-performance', adminDashboardController.getStudentPerformanceAnalytics);

/**
 * @swagger
 * /api/admin/dashboard/notifications:
 *   post:
 *     summary: Create an announcement or targeted student notification
 *     tags: [Admin - Dashboard]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - title
 *               - message
 *             properties:
 *               type:
 *                 type: string
 *                 enum: [NEW_TEST, RESULT_PUBLISHED, SERIES_EXPIRING, PAYMENT_CONFIRMED, ANNOUNCEMENT]
 *               targetAudience:
 *                 type: string
 *                 enum: [USER, ALL_STUDENTS, SERIES_ENROLLED]
 *               userId:
 *                 type: integer
 *               targetSeriesId:
 *                 type: integer
 *               title:
 *                 type: string
 *               message:
 *                 type: string
 *     responses:
 *       201:
 *         description: Notification created
 */
router.post('/notifications', adminDashboardController.createNotification);

module.exports = router;
