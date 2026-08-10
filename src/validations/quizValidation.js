const Joi = require('joi');

const startQuizParams = Joi.object({
  quizId: Joi.number().integer().required(),
});

const saveAnswerParams = Joi.object({
  attemptId: Joi.number().integer().required(),
});

const saveAnswerBody = Joi.object({
  questionId: Joi.number().integer().required(),
  answerId: Joi.number().integer().required(),
});

const submitQuizParams = Joi.object({
  attemptId: Joi.number().integer().required(),
});

module.exports = { 
  startQuizParams, 
  saveAnswerParams, 
  saveAnswerBody, 
  submitQuizParams 
};
