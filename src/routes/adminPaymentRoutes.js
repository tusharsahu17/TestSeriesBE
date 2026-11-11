/**
 * @swagger
 * tags:
 *   name: Admin - Payments
 *   description: Manage payments, refunds, and paid subscriptions
 */

const express = require('express');
const adminPaymentController = require('../controllers/adminPaymentController');

const router = express.Router();

/**
 * @swagger
 * /api/admin/payments/subscriptions:
 *   get:
 *     summary: List all subscriptions
 *     tags: [Admin - Payments]
 *     parameters:
 *       - in: query
 *         name: user_id
 *         schema:
 *           type: integer
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [ACTIVE, EXPIRED, CANCELLED]
 *     responses:
 *       200:
 *         description: List of subscriptions
 */
router.get('/subscriptions', adminPaymentController.listSubscriptions);

/**
 * @swagger
 * /api/admin/payments/subscriptions:
 *   post:
 *     summary: Create a paid subscription record
 *     tags: [Admin - Payments]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [user_id, plan_name]
 *             properties:
 *               user_id:
 *                 type: integer
 *               plan_name:
 *                 type: string
 *               plan_type:
 *                 type: string
 *                 enum: [MONTHLY, QUARTERLY, YEARLY, LIFETIME, SERIES_PASS]
 *               test_series_id:
 *                 type: integer
 *               amount:
 *                 type: number
 *               expires_at:
 *                 type: string
 *                 format: date-time
 *     responses:
 *       201:
 *         description: Subscription created
 */
router.post('/subscriptions', adminPaymentController.createSubscription);

/**
 * @swagger
 * /api/admin/payments/subscriptions/{id}/status:
 *   patch:
 *     summary: Update subscription status
 *     tags: [Admin - Payments]
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
 *         description: Subscription updated
 */
router.patch('/subscriptions/:id/status', adminPaymentController.updateSubscriptionStatus);

/**
 * @swagger
 * /api/admin/payments:
 *   get:
 *     summary: List all payments
 *     tags: [Admin - Payments]
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [PENDING, SUCCESS, FAILED, REFUNDED]
 *       - in: query
 *         name: user_id
 *         schema:
 *           type: integer
 *       - in: query
 *         name: test_series_id
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: List of payments
 */
router.get('/', adminPaymentController.listPayments);

/**
 * @swagger
 * /api/admin/payments:
 *   post:
 *     summary: Record a payment transaction (auto-enrolls on SUCCESS when test_series_id is provided)
 *     tags: [Admin - Payments]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [user_id, amount]
 *             properties:
 *               user_id:
 *                 type: integer
 *               test_series_id:
 *                 type: integer
 *               subscription_id:
 *                 type: integer
 *               order_id:
 *                 type: string
 *               transaction_id:
 *                 type: string
 *               amount:
 *                 type: number
 *               currency:
 *                 type: string
 *                 default: INR
 *               payment_method:
 *                 type: string
 *               payment_gateway:
 *                 type: string
 *               status:
 *                 type: string
 *                 enum: [PENDING, SUCCESS, FAILED, REFUNDED]
 *     responses:
 *       201:
 *         description: Payment recorded
 */
router.post('/', adminPaymentController.createPayment);

/**
 * @swagger
 * /api/admin/payments/{id}:
 *   get:
 *     summary: Get payment details by ID
 *     tags: [Admin - Payments]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Payment details
 */
router.get('/:id', adminPaymentController.getPaymentDetails);

/**
 * @swagger
 * /api/admin/payments/{id}/status:
 *   patch:
 *     summary: Update payment status (PENDING, SUCCESS, FAILED)
 *     tags: [Admin - Payments]
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
 *                 enum: [PENDING, SUCCESS, FAILED]
 *               transaction_id:
 *                 type: string
 *     responses:
 *       200:
 *         description: Payment status updated
 */
router.patch('/:id/status', adminPaymentController.updatePaymentStatus);

/**
 * @swagger
 * /api/admin/payments/{id}/refund:
 *   post:
 *     summary: Refund a payment and cancel linked enrollment/subscription
 *     tags: [Admin - Payments]
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
 *               refund_amount:
 *                 type: number
 *               refund_reason:
 *                 type: string
 *     responses:
 *       200:
 *         description: Payment refunded
 */
router.post('/:id/refund', adminPaymentController.refundPayment);

module.exports = router;

