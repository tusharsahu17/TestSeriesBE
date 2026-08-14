const userModel = require('../models/userModel');
const attemptModel = require('../models/attemptModel');

const listUsers = async (req, res) => {
  try {
    const { search, status, subscription, dateFrom, dateTo } = req.query;
    const filters = { search, status, subscription, dateFrom, dateTo };
    const users = await userModel.getAllUsers(filters);
    res.json({ success: true, data: users });
  } catch (error) {
    console.error('Error listing users:', error);
    res.status(500).json({ success: false, message: 'Failed to list users', error: error.message });
  }
};

const getUserProfile = async (req, res) => {
  try {
    const { userId } = req.params;
    const user = await userModel.getUserById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    // We could fetch basic stats here, but we will leave that for dedicated endpoints.
    res.json({ success: true, data: user });
  } catch (error) {
    console.error('Error getting user profile:', error);
    res.status(500).json({ success: false, message: 'Failed to get user profile', error: error.message });
  }
};

const getUserAttempts = async (req, res) => {
  try {
    const { userId } = req.params;
    const user = await userModel.getUserById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    const attempts = await attemptModel.getAllAttempts(userId);
    res.json({ success: true, data: attempts });
  } catch (error) {
    console.error('Error getting user attempts:', error);
    res.status(500).json({ success: false, message: 'Failed to get user attempts', error: error.message });
  }
};

const blockUnblockUser = async (req, res) => {
  try {
    const { userId } = req.params;
    const { status } = req.body;
    
    if (!['active', 'inactive', 'blocked'].includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid status' });
    }
    
    const success = await userModel.updateUserStatus(userId, status);
    if (!success) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    res.json({ success: true, message: `User status updated to ${status}` });
  } catch (error) {
    console.error('Error updating user status:', error);
    res.status(500).json({ success: false, message: 'Failed to update user status', error: error.message });
  }
};

const resetUserPassword = async (req, res) => {
  try {
    const { userId } = req.params;
    const { newPassword } = req.body;
    if (!newPassword) {
      return res.status(400).json({ success: false, message: 'newPassword is required' });
    }
    // Simple mock hash. Replace with bcrypt in real implementation if not already done.
    const passwordHash = require('crypto').createHash('sha256').update(newPassword).digest('hex');
    
    const success = await userModel.updateUserPassword(userId, passwordHash);
    if (!success) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    res.json({ success: true, message: 'User password reset successfully' });
  } catch (error) {
    console.error('Error resetting user password:', error);
    res.status(500).json({ success: false, message: 'Failed to reset user password', error: error.message });
  }
};

const updateUserDetails = async (req, res) => {
  try {
    const { userId } = req.params;
    const { name, email, phone } = req.body;
    
    const success = await userModel.updateUserDetails(userId, { name, email, phone });
    if (!success) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    res.json({ success: true, message: 'User details updated successfully' });
  } catch (error) {
    console.error('Error updating user details:', error);
    res.status(500).json({ success: false, message: 'Failed to update user details', error: error.message });
  }
};

const toggleSubscription = async (req, res) => {
  try {
    const { userId } = req.params;
    const { status } = req.body;
    
    if (!['active', 'inactive'].includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid subscription status' });
    }
    
    const success = await userModel.updateUserSubscription(userId, status);
    if (!success) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    res.json({ success: true, message: `User subscription updated to ${status}` });
  } catch (error) {
    console.error('Error updating user subscription:', error);
    res.status(500).json({ success: false, message: 'Failed to update user subscription', error: error.message });
  }
};

const getUserActivityHistory = async (req, res) => {
  try {
    const { userId } = req.params;
    const user = await userModel.getUserById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    
    const attempts = await attemptModel.getAllAttempts(userId);
    
    // In a real app, this might include logins, purchases, etc. 
    // Here we aggregate what we have.
    const activity = {
      profile: user,
      testAttempts: attempts,
      summary: {
        totalAttempts: attempts.length,
        averageScore: attempts.length > 0 ? (attempts.reduce((sum, a) => sum + parseFloat(a.score), 0) / attempts.length).toFixed(2) : 0
      }
    };
    
    res.json({ success: true, data: activity });
  } catch (error) {
    console.error('Error getting user activity history:', error);
    res.status(500).json({ success: false, message: 'Failed to get user activity history', error: error.message });
  }
};

module.exports = {
  listUsers,
  getUserProfile,
  getUserAttempts,
  blockUnblockUser,
  resetUserPassword,
  updateUserDetails,
  toggleSubscription,
  getUserActivityHistory
};
