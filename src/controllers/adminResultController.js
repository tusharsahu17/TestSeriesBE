const adminResultModel = require('../models/adminResultModel');

const getTestResultsHandler = async (req, res) => {
  try {
    const { testId } = req.params;
    const results = await adminResultModel.getTestWiseResults(testId);
    res.json(results);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch test results', details: error.message });
  }
};

const getUserResultsHandler = async (req, res) => {
  try {
    const { userId } = req.params;
    const results = await adminResultModel.getUserWiseResults(userId);
    res.json(results);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch user results', details: error.message });
  }
};

const getIndividualResultHandler = async (req, res) => {
  try {
    const { attemptId } = req.params;
    const result = await adminResultModel.getIndividualResult(attemptId);
    if (!result) {
      return res.status(404).json({ error: 'Attempt not found' });
    }
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch individual result', details: error.message });
  }
};

const recalculateResultsHandler = async (req, res) => {
  try {
    const { testId } = req.params;
    const result = await adminResultModel.recalculateTestResults(testId);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: 'Failed to recalculate results', details: error.message });
  }
};

module.exports = {
  getTestResultsHandler,
  getUserResultsHandler,
  getIndividualResultHandler,
  recalculateResultsHandler
};
