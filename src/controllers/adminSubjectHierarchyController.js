const hierarchyModel = require('../models/adminSubjectHierarchyModel');

// -----------------------------------------
// Topics
// -----------------------------------------
const createTopicHandler = async (req, res) => {
  try {
    const { subjectId } = req.params;
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'Topic name is required' });

    const topicId = await hierarchyModel.createTopic(subjectId, req.body);
    res.status(201).json({ message: 'Topic created successfully', topicId });
  } catch (error) {
    res.status(500).json({ error: 'Failed to create topic', details: error.message });
  }
};

const updateTopicHandler = async (req, res) => {
  try {
    const { id } = req.params;
    await hierarchyModel.updateTopic(id, req.body);
    res.json({ message: 'Topic updated successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update topic', details: error.message });
  }
};

const deleteTopicHandler = async (req, res) => {
  try {
    const { id } = req.params;
    await hierarchyModel.deleteTopic(id);
    res.json({ message: 'Topic deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete topic', details: error.message });
  }
};

const listTopicsHandler = async (req, res) => {
  try {
    const { subjectId } = req.params;
    const topics = await hierarchyModel.getTopicsBySubject(subjectId);
    res.json(topics);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch topics', details: error.message });
  }
};

const getTopicDetailsHandler = async (req, res) => {
  try {
    const { id } = req.params;
    const topic = await hierarchyModel.getTopicById(id);
    if (!topic) return res.status(404).json({ error: 'Topic not found' });
    const subtopics = await hierarchyModel.getSubtopicsByTopic(id);
    res.json({ ...topic, subtopics });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch topic details', details: error.message });
  }
};

// -----------------------------------------
// Subtopics
// -----------------------------------------
const createSubtopicHandler = async (req, res) => {
  try {
    const { topicId } = req.params;
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'Subtopic name is required' });

    const subtopicId = await hierarchyModel.createSubtopic(topicId, req.body);
    res.status(201).json({ message: 'Subtopic created successfully', subtopicId });
  } catch (error) {
    res.status(500).json({ error: 'Failed to create subtopic', details: error.message });
  }
};

const updateSubtopicHandler = async (req, res) => {
  try {
    const { id } = req.params;
    await hierarchyModel.updateSubtopic(id, req.body);
    res.json({ message: 'Subtopic updated successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update subtopic', details: error.message });
  }
};

const deleteSubtopicHandler = async (req, res) => {
  try {
    const { id } = req.params;
    await hierarchyModel.deleteSubtopic(id);
    res.json({ message: 'Subtopic deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete subtopic', details: error.message });
  }
};

const listSubtopicsHandler = async (req, res) => {
  try {
    const { topicId } = req.params;
    const subtopics = await hierarchyModel.getSubtopicsByTopic(topicId);
    res.json(subtopics);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch subtopics', details: error.message });
  }
};

const getSubtopicDetailsHandler = async (req, res) => {
  try {
    const { id } = req.params;
    const subtopic = await hierarchyModel.getSubtopicById(id);
    if (!subtopic) return res.status(404).json({ error: 'Subtopic not found' });
    res.json(subtopic);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch subtopic details', details: error.message });
  }
};

// -----------------------------------------
// Hierarchies & Topic Tests
// -----------------------------------------
const getSubjectHierarchyHandler = async (req, res) => {
  try {
    const { subjectId } = req.params;
    const isAdmin = Boolean(req.baseUrl && req.baseUrl.includes('/admin'));
    const hierarchy = await hierarchyModel.getFullHierarchyBySubject(subjectId, { studentView: !isAdmin });
    if (!hierarchy) return res.status(404).json({ error: 'Subject not found' });
    res.json(hierarchy);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch subject hierarchy', details: error.message });
  }
};

const getExamHierarchyHandler = async (req, res) => {
  try {
    const { examId } = req.params;
    const isAdmin = Boolean(req.baseUrl && req.baseUrl.includes('/admin'));
    const hierarchy = await hierarchyModel.getFullHierarchyByExam(examId, { studentView: !isAdmin });
    if (!hierarchy) return res.status(404).json({ error: 'Exam not found' });
    res.json(hierarchy);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch exam hierarchy', details: error.message });
  }
};

const getTopicTestsHandler = async (req, res) => {
  try {
    const { topicId } = req.params;
    const { is_published, exam_id } = req.query;
    const filters = {};
    if (is_published !== undefined) filters.is_published = is_published === 'true';
    if (exam_id) filters.exam_id = exam_id;

    const tests = await hierarchyModel.getTestsByTopic(topicId, filters);
    res.json(tests);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch tests for topic', details: error.message });
  }
};

module.exports = {
  createTopicHandler,
  updateTopicHandler,
  deleteTopicHandler,
  listTopicsHandler,
  getTopicDetailsHandler,
  createSubtopicHandler,
  updateSubtopicHandler,
  deleteSubtopicHandler,
  listSubtopicsHandler,
  getSubtopicDetailsHandler,
  getSubjectHierarchyHandler,
  getExamHierarchyHandler,
  getTopicTestsHandler
};
