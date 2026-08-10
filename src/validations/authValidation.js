const Joi = require('joi');

const register = Joi.object({
  username: Joi.string().alphanum().min(3).max(30).required(),
  password: Joi.string().min(6).required(),
});

const login = Joi.object({
  username: Joi.string().required(),
  password: Joi.string().required(),
});

module.exports = { register, login };
