/**
 * @swagger
 * tags:
 *   name: Admin - Test Series
 *   description: Test Series management for Admins
 */

const express = require('express');
const router = express.Router();
const adminTestSeriesController = require('../controllers/adminTestSeriesController');

/**
 * @swagger
 * /api/admin/test-series:
 *   post:
 *     summary: Create a new test series
 *     tags: [Admin - Test Series]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - title
 *             properties:
 *               title:
 *                 type: string
 *               description:
 *                 type: string
 *               thumbnail_url:
 *                 type: string
 *               price:
 *                 type: number
 *               is_paid:
 *                 type: boolean
 *               validity_days:
 *                 type: integer
 *               start_date:
 *                 type: string
 *                 format: date-time
 *               end_date:
 *                 type: string
 *                 format: date-time
 *               category_id:
 *                 type: integer
 *               difficulty_level:
 *                 type: string
 *               is_published:
 *                 type: boolean
 *     responses:
 *       201:
 *         description: Test series created successfully
 *       400:
 *         description: Bad request (missing title)
 *       500:
 *         description: Server error
 */
router.post('/', adminTestSeriesController.createSeries);

/**
 * @swagger
 * /api/admin/test-series:
 *   get:
 *     summary: List all test series
 *     tags: [Admin - Test Series]
 *     parameters:
 *       - in: query
 *         name: is_published
 *         schema:
 *           type: boolean
 *         description: Filter by publish status
 *       - in: query
 *         name: is_archived
 *         schema:
 *           type: boolean
 *         description: Filter by archive status
 *     responses:
 *       200:
 *         description: A list of test series
 *       500:
 *         description: Server error
 */
router.get('/', adminTestSeriesController.listSeries);

/**
 * @swagger
 * /api/admin/test-series/{id}:
 *   get:
 *     summary: Get details of a specific test series
 *     tags: [Admin - Test Series]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Details of the test series including ordered tests
 *       404:
 *         description: Test series not found
 *       500:
 *         description: Server error
 */
router.get('/:id', adminTestSeriesController.getSeriesDetails);

/**
 * @swagger
 * /api/admin/test-series/{id}:
 *   put:
 *     summary: Update an existing test series
 *     tags: [Admin - Test Series]
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
 *               title:
 *                 type: string
 *               description:
 *                 type: string
 *               thumbnail_url:
 *                 type: string
 *               price:
 *                 type: number
 *               is_paid:
 *                 type: boolean
 *               validity_days:
 *                 type: integer
 *               start_date:
 *                 type: string
 *                 format: date-time
 *               end_date:
 *                 type: string
 *                 format: date-time
 *               category_id:
 *                 type: integer
 *               difficulty_level:
 *                 type: string
 *     responses:
 *       200:
 *         description: Test series updated successfully
 *       500:
 *         description: Server error
 */
router.put('/:id', adminTestSeriesController.updateSeries);

/**
 * @swagger
 * /api/admin/test-series/{id}:
 *   delete:
 *     summary: Delete a test series permanently
 *     tags: [Admin - Test Series]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Test series deleted successfully
 *       500:
 *         description: Server error
 */
router.delete('/:id', adminTestSeriesController.deleteSeries);

// Special Actions

/**
 * @swagger
 * /api/admin/test-series/{id}/archive:
 *   patch:
 *     summary: Archive a test series
 *     tags: [Admin - Test Series]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Test series archived successfully
 *       500:
 *         description: Server error
 */
router.patch('/:id/archive', adminTestSeriesController.archiveSeries);

/**
 * @swagger
 * /api/admin/test-series/{id}/publish:
 *   patch:
 *     summary: Toggle publish status of a test series
 *     tags: [Admin - Test Series]
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
 *         description: Test series publish status updated
 *       400:
 *         description: Invalid input
 *       500:
 *         description: Server error
 */
router.patch('/:id/publish', adminTestSeriesController.togglePublishStatus);

/**
 * @swagger
 * /api/admin/test-series/{id}/duplicate:
 *   post:
 *     summary: Duplicate a test series (and link the same tests)
 *     tags: [Admin - Test Series]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       201:
 *         description: Test series duplicated successfully
 *       500:
 *         description: Server error
 */
router.post('/:id/duplicate', adminTestSeriesController.duplicateSeries);

// Managing tests within a series

/**
 * @swagger
 * /api/admin/test-series/{id}/tests:
 *   post:
 *     summary: Add a test to the test series
 *     tags: [Admin - Test Series]
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
 *               - test_id
 *             properties:
 *               test_id:
 *                 type: integer
 *               order:
 *                 type: integer
 *                 description: Display order (defaults to 0)
 *     responses:
 *       201:
 *         description: Test added to series successfully
 *       400:
 *         description: Invalid input
 *       500:
 *         description: Server error
 */
router.post('/:id/tests', adminTestSeriesController.addTest);

/**
 * @swagger
 * /api/admin/test-series/{id}/tests/reorder:
 *   put:
 *     summary: Reorder tests within a test series
 *     tags: [Admin - Test Series]
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
 *               - ordered_test_ids
 *             properties:
 *               ordered_test_ids:
 *                 type: array
 *                 items:
 *                   type: integer
 *                 description: Array of test IDs in the desired order
 *     responses:
 *       200:
 *         description: Tests reordered successfully
 *       400:
 *         description: Invalid input
 *       500:
 *         description: Server error
 */
router.put('/:id/tests/reorder', adminTestSeriesController.reorderTests);

/**
 * @swagger
 * /api/admin/test-series/{id}/tests/sync:
 *   put:
 *     summary: Sync all tests for a test series
 *     tags: [Admin - Test Series]
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
 *               - test_ids
 *             properties:
 *               test_ids:
 *                 type: array
 *                 items:
 *                   type: integer
 *     responses:
 *       200:
 *         description: Tests synced successfully
 *       500:
 *         description: Server error
 */
router.put('/:id/tests/sync', adminTestSeriesController.syncTests);

module.exports = router;
