const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const userModel = require('../models/userModel');
const adminModel = require('../models/adminModel');

const registerUser = async (username, password) => {
  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    await userModel.createUser(username, hashedPassword);
    return { success: true, message: 'User registered successfully' };
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      const err = new Error('Username already exists');
      err.status = 409;
      throw err;
    }
    throw error;
  }
};

const loginUser = async (username, password) => {
  const user = await userModel.findUserByUsername(username);
  if (!user) {
    const err = new Error('Invalid credentials');
    err.status = 401;
    throw err;
  }

  const match = await bcrypt.compare(password, user.password_hash);
  if (!match) {
    const err = new Error('Invalid credentials');
    err.status = 401;
    throw err;
  }

  const token = jwt.sign(
    { userId: user.id, username: user.username }, 
    process.env.JWT_SECRET || 'secret_key', 
    { expiresIn: '1h' }
  );
  
  return { token, message: 'Login successful' };
};

const adminLoginUser = async (username, password) => {
  const admin = await adminModel.findAdminByUsername(username);
  if (!admin) {
    const err = new Error('Invalid credentials');
    err.status = 401;
    throw err;
  }

  const match = await bcrypt.compare(password, admin.password_hash);
  if (!match) {
    const err = new Error('Invalid credentials');
    err.status = 401;
    throw err;
  }

  const token = jwt.sign(
    { adminId: admin.id, username: admin.username, role: 'admin' }, 
    process.env.JWT_SECRET || 'secret_key', 
    { expiresIn: '1h' }
  );
  
  return { token, message: 'Admin login successful' };
};

module.exports = {
  registerUser,
  loginUser,
  adminLoginUser
};
