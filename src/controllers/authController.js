const authService = require('../services/authService');

const register = async (req, res) => {
  const { username, password } = req.body;
  try {
    const result = await authService.registerUser(username, password);
    res.status(201).json(result);
  } catch (error) {
    const status = error.status || 500;
    res.status(status).json({ message: error.message || 'Server error' });
  }
};

const login = async (req, res) => {
  const { username, password } = req.body;
  try {
    const result = await authService.loginUser(username, password);
    res.json(result);
  } catch (error) {
    const status = error.status || 500;
    res.status(status).json({ message: error.message || 'Server error' });
  }
};

const adminLogin = async (req, res) => {
  const { username, password } = req.body;
  try {
    const result = await authService.adminLoginUser(username, password);
    res.json(result);
  } catch (error) {
    const status = error.status || 500;
    res.status(status).json({ message: error.message || 'Server error' });
  }
};

module.exports = {
  register,
  login,
  adminLogin
};
