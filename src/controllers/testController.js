const testModel = require('../models/testModel');
const studentDashboardModel = require('../models/studentDashboardModel');

async function getTestDetails(req, res) {
  try {
    const test = await testModel.getTestById(req.params.testId);
    if (!test) return res.status(404).json({ message: 'Test not found' });
    res.json(test);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

async function getTestQuestions(req, res) {
  try {
    const questions = await testModel.getQuestionsForTest(req.params.testId);
    res.json(questions);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

async function startTest(req, res) {
  try {
    const userId = req.user?.userId || req.user?.id || req.body?.userId || 1;
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
  getTestDetails,
  getTestQuestions,
  startTest
};
