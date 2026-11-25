const express = require('express');
const router = express.Router();
const subjectController = require('../controllers/subjectController');
const adminSubjectHierarchyController = require('../controllers/adminSubjectHierarchyController');

/**
 * @swagger
 * tags:
 *   name: Subjects
 *   description: Subject and test mapping APIs
 */

/**
 * @swagger
 * /api/subjects:
 *   get:
 *     summary: Get all subjects
 *     tags: [Subjects]
 *     responses:
 *       200:
 *         description: List of subjects
 */
router.get('/', subjectController.getAllSubjects);

/**
 * @swagger
 * /api/subjects:
 *   post:
 *     summary: Create a subject
 *     tags: [Subjects]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               description:
 *                 type: string
 *     responses:
 *       201:
 *         description: Subject created
 */
router.post('/', subjectController.createSubject);

/**
 * @swagger
 * /api/subjects/{id}:
 *   put:
 *     summary: Update a subject
 *     tags: [Subjects]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               description:
 *                 type: string
 *     responses:
 *       200:
 *         description: Subject updated
 */
router.put('/:id', subjectController.updateSubject);

/**
 * @swagger
 * /api/subjects/{id}:
 *   delete:
 *     summary: Delete a subject
 *     tags: [Subjects]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *     responses:
 *       200:
 *         description: Subject deleted
 */
router.delete('/:id', subjectController.deleteSubject);

/**
 * @swagger
 * /api/subjects/{subjectId}/tests:
 *   get:
 *     summary: Get all active tests for a specific subject
 *     tags: [Subjects]
 *     parameters:
 *       - in: path
 *         name: subjectId
 *         schema:
 *           type: integer
 *         required: true
 *         description: The subject ID
 *     responses:
 *       200:
 *         description: List of tests
 */
router.get('/:subjectId/tests', subjectController.getSubjectTests);

/**
 * @swagger
 * /api/subjects/{subjectId}/topics:
 *   get:
 *     summary: Get all topics for a subject
 *     tags: [Subjects]
 *     parameters:
 *       - in: path
 *         name: subjectId
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: List of topics
 */
router.get('/:subjectId/topics', adminSubjectHierarchyController.listTopicsHandler);

/**
 * @swagger
 * /api/subjects/{subjectId}/hierarchy:
 *   get:
 *     summary: Get full hierarchy of a subject (topics + subtopics)
 *     tags: [Subjects]
 *     parameters:
 *       - in: path
 *         name: subjectId
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Full subject hierarchy
 */
router.get('/:subjectId/hierarchy', adminSubjectHierarchyController.getSubjectHierarchyHandler);

module.exports = router;
