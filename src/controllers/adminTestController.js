const testModel = require('../models/testModel');
const notificationModel = require('../models/notificationModel');
const { createDbConnection } = require('../config/db');

const createTestHandler = async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) {
      return res.status(400).json({ error: 'Test name is required' });
    }
    const testId = await testModel.createTest(req.body);
    if (req.body.is_published) {
      let connection;
      try {
        connection = await createDbConnection();
        await notificationModel.notifyNewTestPublished(connection, testId);
      } finally {
        if (connection) await connection.end();
      }
    }
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
    const { is_published, is_active, exam_id, subject_id, topic_id, subtopic_id, test_type, search } = req.query;
    const filters = {};
    if (is_published !== undefined && is_published !== 'all') filters.is_published = is_published === 'true';
    if (is_active !== undefined && is_active !== 'all') filters.is_active = is_active === 'true';
    if (exam_id !== undefined && exam_id !== '') filters.exam_id = exam_id;
    if (subject_id !== undefined && subject_id !== '') filters.subject_id = subject_id;
    if (topic_id !== undefined && topic_id !== '') filters.topic_id = topic_id;
    if (subtopic_id !== undefined && subtopic_id !== '') filters.subtopic_id = subtopic_id;
    if (test_type !== undefined && test_type !== '') filters.test_type = test_type;
    if (search !== undefined && search !== '') filters.search = search;

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
    if (is_published) {
      let connection;
      try {
        connection = await createDbConnection();
        await notificationModel.notifyNewTestPublished(connection, Number(id));
      } finally {
        if (connection) await connection.end();
      }
    }
    res.json({ message: `Test ${is_published ? 'published' : 'unpublished'} successfully` });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update publish status', details: error.message });
  }
};

// -------------------------------------------------------------
// Question Management Handlers for Admin Tests (Step 6 of Flow)
// -------------------------------------------------------------

const addQuestionsToTestHandler = async (req, res) => {
  try {
    const { id } = req.params;
    const questionIds = req.body.question_ids || req.body.questionIds || (req.body.questionId ? [req.body.questionId] : []);

    if (!Array.isArray(questionIds) || questionIds.length === 0) {
      return res.status(400).json({ error: 'question_ids array or questionId is required' });
    }

    const result = await testModel.addQuestionsToTest(id, questionIds);
    res.status(200).json({
      message: `Successfully added ${result.added} question(s) to test`,
      ...result
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to add questions to test', details: error.message });
  }
};

const removeQuestionFromTestHandler = async (req, res) => {
  try {
    const { id, questionId } = req.params;
    const result = await testModel.removeQuestionFromTest(id, questionId);
    res.json({ message: 'Question removed from test successfully', ...result });
  } catch (error) {
    res.status(500).json({ error: 'Failed to remove question from test', details: error.message });
  }
};

const getTestQuestionsHandler = async (req, res) => {
  try {
    const { id } = req.params;
    const questions = await testModel.getQuestionsForTest(id);
    res.json({ count: questions.length, questions });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch test questions', details: error.message });
  }
};

const reorderTestQuestionsHandler = async (req, res) => {
  try {
    const { id } = req.params;
    const { orders } = req.body;
    if (!Array.isArray(orders)) {
      return res.status(400).json({ error: 'orders array is required with { question_id, order }' });
    }
    await testModel.reorderTestQuestions(id, orders);
    res.json({ message: 'Questions reordered successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to reorder questions', details: error.message });
  }
};

const autoPopulateQuestionsHandler = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await testModel.autoPopulateFromQuestionBank(id, req.body || {});
    res.json({ message: `Auto-populated ${result.added} questions from Question Bank`, ...result });
  } catch (error) {
    res.status(500).json({ error: 'Failed to auto-populate questions', details: error.message });
  }
};

module.exports = {
  createTestHandler,
  updateTestHandler,
  deleteTestHandler,
  listTestsHandler,
  getTestDetailsHandler,
  duplicateTestHandler,
  togglePublishHandler,
  addQuestionsToTestHandler,
  removeQuestionFromTestHandler,
  getTestQuestionsHandler,
  reorderTestQuestionsHandler,
  autoPopulateQuestionsHandler
};
