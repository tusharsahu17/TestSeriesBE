const testModel = require('../models/testModel');

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
    // For MVP, fallback to body or hardcoded if missing
    const userId = req.user?.id || req.body?.userId || 1;
    const testSeriesId = req.body?.testSeriesId || req.body?.test_series_id || null;
    const result = await testModel.startTestAttempt(userId, req.params.testId, testSeriesId);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

module.exports = {
  getTestDetails,
  getTestQuestions,
  startTest
};
