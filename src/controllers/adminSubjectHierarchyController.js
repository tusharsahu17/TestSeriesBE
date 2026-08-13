const hierarchyModel = require('../models/adminSubjectHierarchyModel');

// Topics
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

// Subtopics
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

module.exports = {
  createTopicHandler,
  updateTopicHandler,
  deleteTopicHandler,
  listTopicsHandler,
  createSubtopicHandler,
  updateSubtopicHandler,
  deleteSubtopicHandler,
  listSubtopicsHandler
};
