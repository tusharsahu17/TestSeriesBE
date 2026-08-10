const quizModel = require('../models/quizModel');

const getAllQuizzes = async () => {
  return await quizModel.getAllQuizzes();
};

const startQuiz = async (userId, quizId) => {
  const quiz = await quizModel.getQuizById(quizId);
  if (!quiz) {
    const err = new Error('Quiz not found');
    err.status = 404;
    throw err;
  }

  const activeAttempt = await quizModel.getActiveAttempt(userId, quizId);
  if (activeAttempt) {
    const err = new Error('You already have an active attempt for this quiz');
    err.status = 400;
    err.attemptId = activeAttempt.id;
    throw err;
  }

  const startTime = new Date();
  const endTime = new Date(startTime.getTime() + quiz.duration_minutes * 60000);

  const attemptId = await quizModel.createAttempt(userId, quizId, startTime, endTime);

  return { attemptId, startTime, endTime };
};

const saveAnswer = async (userId, attemptId, questionId, answerId) => {
  const attempt = await quizModel.getAttemptByIdAndUser(attemptId, userId);
  
  if (!attempt) {
    const err = new Error('Invalid or completed attempt');
    err.status = 400;
    throw err;
  }
  
  if (new Date() > new Date(attempt.end_time)) {
    const err = new Error('Time has expired for this quiz attempt');
    err.status = 400;
    throw err;
  }

  await quizModel.saveUserAnswer(attemptId, questionId, answerId);
  return { message: 'Answer saved' };
};

const submitQuiz = async (userId, attemptId) => {
  const attempt = await quizModel.getAttemptByIdAndUser(attemptId, userId);
  
  if (!attempt) {
    const err = new Error('Invalid or already completed attempt');
    err.status = 400;
    throw err;
  }
  
  const score = await quizModel.calculateScoreAndCompleteAttempt(attemptId);
  return { message: 'Quiz submitted successfully', score };
};

module.exports = {
  getAllQuizzes,
  startQuiz,
  saveAnswer,
  submitQuiz
};
