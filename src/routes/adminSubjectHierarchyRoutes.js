/**
 * @swagger
 * tags:
 *   name: Admin - Subject Hierarchy
 *   description: Manage Topics and Subtopics for Subjects
 */

const express = require('express');
const router = express.Router();
const adminSubjectHierarchyController = require('../controllers/adminSubjectHierarchyController');

// -----------------------------------------
// Topics
// -----------------------------------------

/**
 * @swagger
 * /api/admin/hierarchy/subjects/{subjectId}/topics:
 *   post:
 *     summary: Create a topic under a subject
 *     tags: [Admin - Subject Hierarchy]
 *     parameters:
 *       - in: path
 *         name: subjectId
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
 *               - name
 *             properties:
 *               name:
 *                 type: string
 *               description:
 *                 type: string
 *               is_active:
 *                 type: boolean
 *     responses:
 *       201:
 *         description: Topic created successfully
 *       500:
 *         description: Server error
 */
router.post('/subjects/:subjectId/topics', adminSubjectHierarchyController.createTopicHandler);

/**
 * @swagger
 * /api/admin/hierarchy/subjects/{subjectId}/topics:
 *   get:
 *     summary: List all topics for a subject
 *     tags: [Admin - Subject Hierarchy]
 *     parameters:
 *       - in: path
 *         name: subjectId
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: A list of topics
 *       500:
 *         description: Server error
 */
router.get('/subjects/:subjectId/topics', adminSubjectHierarchyController.listTopicsHandler);

/**
 * @swagger
 * /api/admin/hierarchy/topics/{id}:
 *   put:
 *     summary: Update a topic
 *     tags: [Admin - Subject Hierarchy]
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
 *               name:
 *                 type: string
 *               description:
 *                 type: string
 *               is_active:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Topic updated successfully
 *       500:
 *         description: Server error
 */
router.put('/topics/:id', adminSubjectHierarchyController.updateTopicHandler);

/**
 * @swagger
 * /api/admin/hierarchy/topics/{id}:
 *   delete:
 *     summary: Delete a topic (and its subtopics)
 *     tags: [Admin - Subject Hierarchy]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Topic deleted successfully
 *       500:
 *         description: Server error
 */
router.delete('/topics/:id', adminSubjectHierarchyController.deleteTopicHandler);


// -----------------------------------------
// Subtopics
// -----------------------------------------

/**
 * @swagger
 * /api/admin/hierarchy/topics/{topicId}/subtopics:
 *   post:
 *     summary: Create a subtopic under a topic
 *     tags: [Admin - Subject Hierarchy]
 *     parameters:
 *       - in: path
 *         name: topicId
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
 *               - name
 *             properties:
 *               name:
 *                 type: string
 *               description:
 *                 type: string
 *               is_active:
 *                 type: boolean
 *     responses:
 *       201:
 *         description: Subtopic created successfully
 *       500:
 *         description: Server error
 */
router.post('/topics/:topicId/subtopics', adminSubjectHierarchyController.createSubtopicHandler);

/**
 * @swagger
 * /api/admin/hierarchy/topics/{topicId}/subtopics:
 *   get:
 *     summary: List all subtopics for a topic
 *     tags: [Admin - Subject Hierarchy]
 *     parameters:
 *       - in: path
 *         name: topicId
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: A list of subtopics
 *       500:
 *         description: Server error
 */
router.get('/topics/:topicId/subtopics', adminSubjectHierarchyController.listSubtopicsHandler);

/**
 * @swagger
 * /api/admin/hierarchy/subtopics/{id}:
 *   put:
 *     summary: Update a subtopic
 *     tags: [Admin - Subject Hierarchy]
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
 *               name:
 *                 type: string
 *               description:
 *                 type: string
 *               is_active:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Subtopic updated successfully
 *       500:
 *         description: Server error
 */
router.put('/subtopics/:id', adminSubjectHierarchyController.updateSubtopicHandler);

/**
 * @swagger
 * /api/admin/hierarchy/subtopics/{id}:
 *   delete:
 *     summary: Delete a subtopic
 *     tags: [Admin - Subject Hierarchy]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Subtopic deleted successfully
 *       500:
 *         description: Server error
 */
router.delete('/subtopics/:id', adminSubjectHierarchyController.deleteSubtopicHandler);

module.exports = router;
