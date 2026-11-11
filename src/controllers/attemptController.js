const attemptModel = require('../models/attemptModel');

function getOptionalUserId(req) {
  return req.user ? Number(req.user.userId || req.user.id) : null;
}

async function saveAnswer(req, res) {
  try {
    const { questionId, optionId } = req.body;
    const result = await attemptModel.saveAnswer(
      req.params.attemptId,
      questionId,
      optionId,
      getOptionalUserId(req)
    );
    res.json(result);
  } catch (error) {
    const status = error.status || 500;
    res.status(status).json({ error: error.message, message: error.message, code: error.code });
  }
}

async function submitAttempt(req, res) {
  try {
    const timeTakenSeconds = req.body?.time_taken_seconds || req.body?.timeTakenSeconds || null;
    const result = await attemptModel.submitAttempt(
      req.params.attemptId,
      timeTakenSeconds,
      getOptionalUserId(req)
    );
    res.json(result);
  } catch (error) {
    const status = error.status || 500;
    res.status(status).json({ error: error.message, message: error.message, code: error.code });
  }
}

async function getResult(req, res) {
  try {
    const result = await attemptModel.getAttemptResult(
      req.params.attemptId,
      getOptionalUserId(req)
    );
    if (!result) return res.status(404).json({ message: 'Attempt not found' });
    res.json(result);
  } catch (error) {
    const status = error.status || 500;
    res.status(status).json({ error: error.message, message: error.message, code: error.code });
  }
}

async function getAnswers(req, res) {
  try {
    const result = await attemptModel.getAttemptAnswers(
      req.params.attemptId,
      getOptionalUserId(req)
    );
    if (!result) return res.status(404).json({ message: 'Attempt not found' });
    res.json(result);
  } catch (error) {
    const status = error.status || 500;
    res.status(status).json({ error: error.message, message: error.message, code: error.code });
  }
}

async function getAllAttempts(req, res) {
  try {
    const userId = getOptionalUserId(req) || 1;
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
