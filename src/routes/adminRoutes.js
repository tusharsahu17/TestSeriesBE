const express = require('express');
const authController = require('../controllers/authController');
const { validate } = require('../middleware/validate');
const authValidation = require('../validations/authValidation');

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Admin
 *   description: Admin management and routes
 */

/**
 * @swagger
 * /api/admin/auth/login:
 *   post:
 *     summary: Login an admin
 *     tags: [Admin]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - username
 *               - password
 *             properties:
 *               username:
 *                 type: string
 *               password:
 *                 type: string
 *     responses:
 *       200:
 *         description: Admin login successful
 *       401:
 *         description: Invalid credentials
 */
router.post('/login', validate(authValidation.adminLogin), authController.adminLogin);

module.exports = router;
