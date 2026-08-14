/**
 * @swagger
 * tags:
 *   name: Admin - Leaderboards
 *   description: Global settings and aggregation for Leaderboards
 */

const express = require('express');
const router = express.Router();
const adminLeaderboardController = require('../controllers/adminLeaderboardController');

/**
 * @swagger
 * /api/admin/leaderboards/settings:
 *   get:
 *     summary: Get global leaderboard settings
 *     tags: [Admin - Leaderboards]
 *     responses:
 *       200:
 *         description: Current settings
 *       500:
 *         description: Server error
 */
router.get('/settings', adminLeaderboardController.getSettingsHandler);

/**
 * @swagger
 * /api/admin/leaderboards/settings:
 *   put:
 *     summary: Update global leaderboard settings
 *     tags: [Admin - Leaderboards]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               is_enabled:
 *                 type: boolean
 *               names_visible:
 *                 type: boolean
 *               ranks_public:
 *                 type: boolean
 *               scores_public:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Settings updated successfully
 *       500:
 *         description: Server error
 */
router.put('/settings', adminLeaderboardController.updateSettingsHandler);

/**
 * @swagger
 * /api/admin/leaderboards/overall:
 *   get:
 *     summary: Get the overall leaderboard
 *     tags: [Admin - Leaderboards]
 *     responses:
 *       200:
 *         description: Overall leaderboard aggregating highest scores per test
 *       500:
 *         description: Server error
 */
router.get('/overall', adminLeaderboardController.getOverallLeaderboardHandler);

/**
 * @swagger
 * /api/admin/leaderboards/test/{testId}:
 *   get:
 *     summary: Get leaderboard for a specific test
 *     tags: [Admin - Leaderboards]
 *     parameters:
 *       - in: path
 *         name: testId
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Test-wise leaderboard
 *       500:
 *         description: Server error
 */
router.get('/test/:testId', adminLeaderboardController.getTestLeaderboardHandler);

/**
 * @swagger
 * /api/admin/leaderboards/series/{seriesId}:
 *   get:
 *     summary: Get leaderboard for a specific test series
 *     tags: [Admin - Leaderboards]
 *     parameters:
 *       - in: path
 *         name: seriesId
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Series-wise leaderboard aggregating highest scores for tests in series
 *       500:
 *         description: Server error
 */
router.get('/series/:seriesId', adminLeaderboardController.getSeriesLeaderboardHandler);

/**
 * @swagger
 * /api/admin/leaderboards/weekly:
 *   get:
 *     summary: Get weekly leaderboard
 *     tags: [Admin - Leaderboards]
 *     responses:
 *       200:
 *         description: Weekly leaderboard aggregating highest scores in the past 7 days
 *       500:
 *         description: Server error
 */
router.get('/weekly', adminLeaderboardController.getWeeklyLeaderboardHandler);

/**
 * @swagger
 * /api/admin/leaderboards/monthly:
 *   get:
 *     summary: Get monthly leaderboard
 *     tags: [Admin - Leaderboards]
 *     responses:
 *       200:
 *         description: Monthly leaderboard aggregating highest scores in the current calendar month
 *       500:
 *         description: Server error
 */
router.get('/monthly', adminLeaderboardController.getMonthlyLeaderboardHandler);

/**
 * @swagger
 * /api/admin/leaderboards/category/{category}:
 *   get:
 *     summary: Get category-wise leaderboard
 *     tags: [Admin - Leaderboards]
 *     parameters:
 *       - in: path
 *         name: category
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Category-wise leaderboard aggregating scores for tests in test_series matching category
 *       500:
 *         description: Server error
 */
router.get('/category/:category', adminLeaderboardController.getCategoryLeaderboardHandler);

module.exports = router;
