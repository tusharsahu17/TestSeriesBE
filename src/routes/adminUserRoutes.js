const express = require('express');
const adminUserController = require('../controllers/adminUserController');

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: AdminUsers
 *   description: Admin user management API
 */

/**
 * @swagger
 * /api/admin/users:
 *   get:
 *     summary: Get all users with filters
 *     tags: [AdminUsers]
 *     parameters:
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search by username, name, or email
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
 *           enum: [active, inactive]
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
 *     summary: Get user profile
 *     tags: [AdminUsers]
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: User profile details
 */
router.get('/:userId', adminUserController.getUserProfile);

/**
 * @swagger
 * /api/admin/users/{userId}/attempts:
 *   get:
 *     summary: Get user test attempt history
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
 * /api/admin/users/{userId}/activity:
 *   get:
 *     summary: Get user complete activity history
 *     tags: [AdminUsers]
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Complete activity history
 */
router.get('/:userId/activity', adminUserController.getUserActivityHistory);

/**
 * @swagger
 * /api/admin/users/{userId}/status:
 *   patch:
 *     summary: Update user status (block/unblock)
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
 *     summary: Reset user password
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
 *     responses:
 *       200:
 *         description: User password reset
 */
router.patch('/:userId/password', adminUserController.resetUserPassword);

/**
 * @swagger
 * /api/admin/users/{userId}:
 *   put:
 *     summary: Update user details
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

/**
 * @swagger
 * /api/admin/users/{userId}/subscription:
 *   patch:
 *     summary: Update user subscription status
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
 *                 enum: [active, inactive]
 *     responses:
 *       200:
 *         description: User subscription status updated
 */
router.patch('/:userId/subscription', adminUserController.toggleSubscription);

module.exports = router;
