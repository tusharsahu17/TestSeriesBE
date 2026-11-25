const testModel = require('../models/testModel');
const studentDashboardModel = require('../models/studentDashboardModel');

async function listTests(req, res) {
  try {
    const { exam_id, subject_id, topic_id, subtopic_id, test_type, search } = req.query;
    const filters = {
      is_published: true,
      is_active: true,
    };
    if (exam_id !== undefined && exam_id !== '') filters.exam_id = exam_id;
    if (subject_id !== undefined && subject_id !== '') filters.subject_id = subject_id;
    if (topic_id !== undefined && topic_id !== '') filters.topic_id = topic_id;
    if (subtopic_id !== undefined && subtopic_id !== '') filters.subtopic_id = subtopic_id;
    if (test_type !== undefined && test_type !== '') filters.test_type = test_type;
    if (search !== undefined && search !== '') filters.search = search;

    const tests = await testModel.getAllTests(filters);
    res.json(tests);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

async function getTestDetails(req, res) {
  try {
    const test = await testModel.getTestById(req.params.testId);
    if (!test || !test.is_published || !test.is_active) {
      return res.status(404).json({ message: 'Test not found' });
    }
    res.json(test);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

async function getTestQuestions(req, res) {
  try {
    const test = await testModel.getTestById(req.params.testId);
    if (!test || !test.is_published || !test.is_active) {
      return res.status(404).json({ message: 'Test not found' });
    }
    const questions = await testModel.getQuestionsForTest(req.params.testId);
    res.json(questions);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

async function startTest(req, res) {
  try {
    const userId = req.user?.userId || req.user?.id;
    if (!userId) {
      return res.status(401).json({
        error: 'Authentication required to start a test',
        message: 'Authentication required to start a test',
      });
    }
    const result = await studentDashboardModel.validateAndStartTest(
      userId,
      req.params.testId,
      req.body || {}
    );
    res.json(result);
  } catch (error) {
    const status = error.status || 500;
    const payload = {
      error: error.message,
      message: error.message,
    };
    if (error.code) payload.code = error.code;
    if (error.conflictingAttemptId) payload.conflictingAttemptId = error.conflictingAttemptId;
    if (error.conflictingTestId) payload.conflictingTestId = error.conflictingTestId;
    if (error.details) payload.details = error.details;
    res.status(status).json(payload);
  }
}

module.exports = {
  listTests,
  getTestDetails,
  getTestQuestions,
  startTest
};
