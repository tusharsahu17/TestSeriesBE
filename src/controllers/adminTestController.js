const testModel = require('../models/testModel');

const createTestHandler = async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) {
      return res.status(400).json({ error: 'Test name is required' });
    }
    const testId = await testModel.createTest(req.body);
    res.status(201).json({ message: 'Test created successfully', testId });
  } catch (error) {
    res.status(500).json({ error: 'Failed to create test', details: error.message });
  }
};

const updateTestHandler = async (req, res) => {
  try {
    const { id } = req.params;
    await testModel.updateTest(id, req.body);
    res.json({ message: 'Test updated successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update test', details: error.message });
  }
};

const deleteTestHandler = async (req, res) => {
  try {
    const { id } = req.params;
    await testModel.deleteTest(id);
    res.json({ message: 'Test deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete test', details: error.message });
  }
};

const listTestsHandler = async (req, res) => {
  try {
    const { is_published } = req.query;
    const filters = {};
    if (is_published !== undefined) filters.is_published = is_published === 'true';

    const tests = await testModel.getAllTests(filters);
    res.json(tests);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch tests', details: error.message });
  }
};

const getTestDetailsHandler = async (req, res) => {
  try {
    const { id } = req.params;
    const test = await testModel.getTestById(id);
    if (!test) {
      return res.status(404).json({ error: 'Test not found' });
    }
    // Also fetch questions for full admin view
    const questions = await testModel.getQuestionsForTest(id);
    res.json({ ...test, questions });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch test details', details: error.message });
  }
};

const duplicateTestHandler = async (req, res) => {
  try {
    const { id } = req.params;
    const newTestId = await testModel.duplicateTest(id);
    res.status(201).json({ message: 'Test duplicated successfully', newTestId });
  } catch (error) {
    res.status(500).json({ error: 'Failed to duplicate test', details: error.message });
  }
};

const togglePublishHandler = async (req, res) => {
  try {
    const { id } = req.params;
    const { is_published } = req.body;
    if (typeof is_published !== 'boolean') {
      return res.status(400).json({ error: 'is_published boolean value is required' });
    }
    await testModel.updateTest(id, { is_published });
    res.json({ message: `Test ${is_published ? 'published' : 'unpublished'} successfully` });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update publish status', details: error.message });
  }
};

module.exports = {
  createTestHandler,
  updateTestHandler,
  deleteTestHandler,
  listTestsHandler,
  getTestDetailsHandler,
  duplicateTestHandler,
  togglePublishHandler
};
