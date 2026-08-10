const quizService = require('../services/quizService');

const getQuizzes = async (req, res) => {
  try {
    const quizzes = await quizService.getAllQuizzes();
    res.json(quizzes);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

const startQuiz = async (req, res) => {
  const { quizId } = req.params;
  const userId = req.user.userId;

  try {
    const result = await quizService.startQuiz(userId, quizId);
    res.status(201).json(result);
  } catch (error) {
    const status = error.status || 500;
    res.status(status).json({ 
      message: error.message || 'Server error', 
      attemptId: error.attemptId 
    });
  }
};

const saveAnswer = async (req, res) => {
  const { attemptId } = req.params;
  const { questionId, answerId } = req.body;
  const userId = req.user.userId;

  try {
    const result = await quizService.saveAnswer(userId, attemptId, questionId, answerId);
    res.json(result);
  } catch (error) {
    const status = error.status || 500;
    res.status(status).json({ message: error.message || 'Server error' });
  }
};

const submitQuiz = async (req, res) => {
  const { attemptId } = req.params;
  const userId = req.user.userId;

  try {
    const result = await quizService.submitQuiz(userId, attemptId);
    res.json(result);
  } catch (error) {
    const status = error.status || 500;
    res.status(status).json({ message: error.message || 'Server error' });
  }
};

module.exports = {
  getQuizzes,
  startQuiz,
  saveAnswer,
  submitQuiz
};
