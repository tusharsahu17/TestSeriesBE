const attemptModel = require('../models/attemptModel');

async function saveAnswer(req, res) {
  try {
    const { questionId, optionId } = req.body;
    const result = await attemptModel.saveAnswer(req.params.attemptId, questionId, optionId);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

async function submitAttempt(req, res) {
  try {
    const result = await attemptModel.submitAttempt(req.params.attemptId);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

async function getResult(req, res) {
  try {
    const result = await attemptModel.getAttemptResult(req.params.attemptId);
    if (!result) return res.status(404).json({ message: 'Attempt not found' });
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

async function getAnswers(req, res) {
  try {
    const result = await attemptModel.getAttemptAnswers(req.params.attemptId);
    if (!result) return res.status(404).json({ message: 'Attempt not found' });
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

async function getAllAttempts(req, res) {
  try {
    // Hardcoded userId 1 for now if no auth middleware
    const userId = req.user ? req.user.id : 1; 
    const result = await attemptModel.getAllAttempts(userId);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

module.exports = {
  saveAnswer,
  submitAttempt,
  getResult,
  getAnswers,
  getAllAttempts
};
