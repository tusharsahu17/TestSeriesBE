const express = require('express');
const adminDashboardController = require('../controllers/adminDashboardController');

const router = express.Router();

/**
 * @swagger
 * /api/admin/dashboard:
 *   get:
 *     summary: Get admin dashboard overview
 *     tags: [Admin]
 *     responses:
 *       200:
 *         description: Dashboard metrics and overview data
 *       500:
 *         description: Server error
 */
router.get('/', adminDashboardController.getDashboardOverview);

module.exports = router;
