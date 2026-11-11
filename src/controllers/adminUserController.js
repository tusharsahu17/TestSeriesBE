const bcrypt = require('bcrypt');
const userModel = require('../models/userModel');
const adminUserDetailModel = require('../models/adminUserDetailModel');

const ALLOWED_USER_STATUSES = ['active', 'inactive', 'blocked'];
const ALLOWED_SUBSCRIPTION_STATUSES = ['active', 'inactive', 'free'];
const ALLOWED_ENROLLMENT_STATUSES = ['ACTIVE', 'EXPIRED', 'CANCELLED'];

function validateUserId(rawUserId, res) {
  const userId = adminUserDetailModel.parsePositiveInt(rawUserId);
  if (!userId) {
    res.status(400).json({ success: false, message: 'Invalid userId parameter' });
    return null;
  }
  return userId;
}

const listUsers = async (req, res) => {
  try {
    const { search, status, subscription, dateFrom, dateTo } = req.query;
    const users = await userModel.getAllUsers({ search, status, subscription, dateFrom, dateTo });
    res.json({ success: true, data: users });
  } catch (error) {
    console.error('Error listing users:', error);
    res.status(500).json({ success: false, message: 'Failed to list users', error: error.message });
  }
};

const getUserProfile = async (req, res) => {
  try {
    const userId = validateUserId(req.params.userId, res);
    if (!userId) return;

    const profile = await adminUserDetailModel.getStudentProfileDetails(userId);
    if (!profile) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    res.json({ success: true, data: profile });
  } catch (error) {
    console.error('Error getting user profile:', error);
    res.status(500).json({ success: false, message: 'Failed to get user profile', error: error.message });
  }
};

const getUserAnalytics = async (req, res) => {
  try {
    const userId = validateUserId(req.params.userId, res);
    if (!userId) return;

    const analytics = await adminUserDetailModel.getStudentAnalytics(userId);
    if (!analytics) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    res.json({ success: true, data: analytics });
  } catch (error) {
    console.error('Error getting user analytics:', error);
    res.status(500).json({ success: false, message: 'Failed to get user analytics', error: error.message });
  }
};

const getUserTestHistory = async (req, res) => {
  try {
    const userId = validateUserId(req.params.userId, res);
    if (!userId) return;

    const history = await adminUserDetailModel.getStudentTestHistory(userId, req.query);
    if (!history) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    res.json({ success: true, data: history });
  } catch (error) {
    console.error('Error getting user test history:', error);
    res.status(500).json({ success: false, message: 'Failed to get user test history', error: error.message });
  }
};

const getUserAttempts = async (req, res) => {
  try {
    const userId = validateUserId(req.params.userId, res);
    if (!userId) return;

    const history = await adminUserDetailModel.getStudentTestHistory(userId, {
      ...req.query,
      limit: req.query.limit || 50,
    });
    if (!history) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    res.json({ success: true, data: history.items, pagination: history.pagination });
  } catch (error) {
    console.error('Error getting user attempts:', error);
    res.status(500).json({ success: false, message: 'Failed to get user attempts', error: error.message });
  }
};

const getUserAttemptDetail = async (req, res) => {
  try {
    const userId = validateUserId(req.params.userId, res);
    if (!userId) return;

    const attemptId = adminUserDetailModel.parsePositiveInt(req.params.attemptId);
    if (!attemptId) {
      return res.status(400).json({ success: false, message: 'Invalid attemptId parameter' });
    }

    const detail = await adminUserDetailModel.getStudentAttemptDetail(userId, attemptId);
    if (!detail) {
      return res.status(404).json({ success: false, message: 'Attempt not found for this student' });
    }
    res.json({ success: true, data: detail });
  } catch (error) {
    console.error('Error getting user attempt detail:', error);
    res.status(500).json({ success: false, message: 'Failed to get attempt detail', error: error.message });
  }
};

const getUserTestSeries = async (req, res) => {
  try {
    const userId = validateUserId(req.params.userId, res);
    if (!userId) return;

    const series = await adminUserDetailModel.getStudentTestSeries(userId, req.query);
    if (!series) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    res.json({ success: true, data: series });
  } catch (error) {
    console.error('Error getting user test series:', error);
    res.status(500).json({ success: false, message: 'Failed to get user test series', error: error.message });
  }
};

const assignUserTestSeries = async (req, res) => {
  try {
    const userId = validateUserId(req.params.userId, res);
    if (!userId) return;

    const created = await adminUserDetailModel.assignTestSeriesToStudent(userId, req.body);
    res.status(201).json({
      success: true,
      message: 'Test series assigned to student successfully',
      data: created,
    });
  } catch (error) {
    const status = error.status || 500;
    console.error('Error assigning test series to student:', error);
    res.status(status).json({ success: false, message: error.message || 'Failed to assign test series' });
  }
};

const extendUserTestSeries = async (req, res) => {
  try {
    const userId = validateUserId(req.params.userId, res);
    if (!userId) return;

    const enrollmentId = adminUserDetailModel.parsePositiveInt(req.params.enrollmentId);
    if (!enrollmentId) {
      return res.status(400).json({ success: false, message: 'Invalid enrollmentId parameter' });
    }

    const updated = await adminUserDetailModel.extendTestSeriesAccess(userId, enrollmentId, req.body);
    if (!updated) {
      return res.status(404).json({ success: false, message: 'Enrollment not found for this student' });
    }
    res.json({
      success: true,
      message: 'Test series access extended successfully',
      data: updated,
    });
  } catch (error) {
    const status = error.status || 500;
    console.error('Error extending test series access:', error);
    res.status(status).json({ success: false, message: error.message || 'Failed to extend access' });
  }
};

const updateUserTestSeriesStatus = async (req, res) => {
  try {
    const userId = validateUserId(req.params.userId, res);
    if (!userId) return;

    const enrollmentId = adminUserDetailModel.parsePositiveInt(req.params.enrollmentId);
    if (!enrollmentId) {
      return res.status(400).json({ success: false, message: 'Invalid enrollmentId parameter' });
    }

    const status = req.body?.status ? String(req.body.status).toUpperCase() : '';
    if (!ALLOWED_ENROLLMENT_STATUSES.includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'status must be ACTIVE, EXPIRED, or CANCELLED',
      });
    }

    const updated = await adminUserDetailModel.updateStudentEnrollmentStatus(userId, enrollmentId, status);
    if (!updated) {
      return res.status(404).json({ success: false, message: 'Enrollment not found for this student' });
    }
    res.json({
      success: true,
      message: `Enrollment status updated to ${status}`,
      data: updated,
    });
  } catch (error) {
    console.error('Error updating enrollment status:', error);
    res.status(500).json({ success: false, message: 'Failed to update enrollment status', error: error.message });
  }
};

const getUserPayments = async (req, res) => {
  try {
    const userId = validateUserId(req.params.userId, res);
    if (!userId) return;

    const payments = await adminUserDetailModel.getStudentPayments(userId, req.query);
    if (!payments) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    res.json({ success: true, data: payments });
  } catch (error) {
    console.error('Error getting user payments:', error);
    res.status(500).json({ success: false, message: 'Failed to get user payments', error: error.message });
  }
};

const getUserPaymentDetail = async (req, res) => {
  try {
    const userId = validateUserId(req.params.userId, res);
    if (!userId) return;

    const paymentId = adminUserDetailModel.parsePositiveInt(req.params.paymentId);
    if (!paymentId) {
      return res.status(400).json({ success: false, message: 'Invalid paymentId parameter' });
    }

    const payment = await adminUserDetailModel.getStudentPaymentDetail(userId, paymentId);
    if (!payment) {
      return res.status(404).json({ success: false, message: 'Payment not found for this student' });
    }
    res.json({ success: true, data: payment });
  } catch (error) {
    console.error('Error getting user payment detail:', error);
    res.status(500).json({ success: false, message: 'Failed to get payment detail', error: error.message });
  }
};

const getUserActivityHistory = async (req, res) => {
  try {
    const userId = validateUserId(req.params.userId, res);
    if (!userId) return;

    const activity = await adminUserDetailModel.getStudentActivity(userId, req.query);
    if (!activity) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    res.json({ success: true, data: activity });
  } catch (error) {
    console.error('Error getting user activity history:', error);
    res.status(500).json({ success: false, message: 'Failed to get user activity history', error: error.message });
  }
};

const getUserReport = async (req, res) => {
  try {
    const userId = validateUserId(req.params.userId, res);
    if (!userId) return;

    const report = await adminUserDetailModel.getStudentReport(userId);
    if (!report) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const format = String(req.query.format || 'json').toLowerCase();
    if (format === 'csv') {
      const csv = adminUserDetailModel.formatStudentReportCsv(report);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="student-${userId}-report.csv"`);
      return res.send(csv);
    }

    res.json({ success: true, data: report });
  } catch (error) {
    console.error('Error generating user report:', error);
    res.status(500).json({ success: false, message: 'Failed to generate user report', error: error.message });
  }
};

const blockUnblockUser = async (req, res) => {
  try {
    const userId = validateUserId(req.params.userId, res);
    if (!userId) return;

    const status = req.body?.status ? String(req.body.status).toLowerCase() : '';
    if (!ALLOWED_USER_STATUSES.includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid status. Must be active, inactive, or blocked' });
    }

    const success = await userModel.updateUserStatus(userId, status);
    if (!success) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    await userModel.logAdminUserAction(userId, 'STATUS_CHANGED', null, { status });
    res.json({
      success: true,
      message: `User status updated to ${status}`,
      data: { id: userId, status },
    });
  } catch (error) {
    console.error('Error updating user status:', error);
    res.status(500).json({ success: false, message: 'Failed to update user status', error: error.message });
  }
};

const resetUserPassword = async (req, res) => {
  try {
    const userId = validateUserId(req.params.userId, res);
    if (!userId) return;

    const { newPassword, confirmPassword } = req.body || {};
    if (typeof newPassword !== 'string' || newPassword.trim().length < 6) {
      return res.status(400).json({
        success: false,
        message: 'newPassword is required and must be at least 6 characters',
      });
    }
    if (newPassword.length > 128) {
      return res.status(400).json({
        success: false,
        message: 'newPassword must not exceed 128 characters',
      });
    }
    if (confirmPassword !== undefined && confirmPassword !== newPassword) {
      return res.status(400).json({
        success: false,
        message: 'Passwords do not match',
      });
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    const success = await userModel.updateUserPassword(userId, passwordHash);
    if (!success) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    await userModel.logAdminUserAction(userId, 'PASSWORD_RESET', null, { resetByAdmin: true });
    res.json({ success: true, message: 'User password reset successfully' });
  } catch (error) {
    console.error('Error resetting user password:', error);
    res.status(500).json({ success: false, message: 'Failed to reset user password', error: error.message });
  }
};

const updateUserDetails = async (req, res) => {
  try {
    const userId = validateUserId(req.params.userId, res);
    if (!userId) return;

    const { name, email, phone } = req.body || {};
    const updates = {};

    if (name !== undefined) {
      updates.name = name === null ? null : String(name).trim();
    }
    if (email !== undefined) {
      const trimmedEmail = email === null ? null : String(email).trim();
      if (trimmedEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
        return res.status(400).json({ success: false, message: 'Invalid email format' });
      }
      updates.email = trimmedEmail || null;
    }
    if (phone !== undefined) {
      updates.phone = phone === null ? null : String(phone).trim() || null;
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ success: false, message: 'At least one field (name, email, phone) is required' });
    }

    const success = await userModel.updateUserDetails(userId, updates);
    if (!success) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    await userModel.logAdminUserAction(userId, 'PROFILE_UPDATED', null, {
      updatedFields: Object.keys(updates),
    });

    const updatedProfile = await adminUserDetailModel.getStudentProfileDetails(userId);
    res.json({
      success: true,
      message: 'User details updated successfully',
      data: updatedProfile,
    });
  } catch (error) {
    console.error('Error updating user details:', error);
    res.status(500).json({ success: false, message: 'Failed to update user details', error: error.message });
  }
};

const toggleSubscription = async (req, res) => {
  try {
    const userId = validateUserId(req.params.userId, res);
    if (!userId) return;

    const status = req.body?.status ? String(req.body.status).toLowerCase() : '';
    if (!ALLOWED_SUBSCRIPTION_STATUSES.includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid subscription status' });
    }

    const success = await userModel.updateUserSubscription(userId, status);
    if (!success) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    await userModel.logAdminUserAction(userId, 'SUBSCRIPTION_UPDATED', null, { status });
    res.json({
      success: true,
      message: `User subscription updated to ${status}`,
      data: { id: userId, subscription_status: status },
    });
  } catch (error) {
    console.error('Error updating user subscription:', error);
    res.status(500).json({ success: false, message: 'Failed to update user subscription', error: error.message });
  }
};

module.exports = {
  listUsers,
  getUserProfile,
  getUserAnalytics,
  getUserTestHistory,
  getUserAttempts,
  getUserAttemptDetail,
  getUserTestSeries,
  assignUserTestSeries,
  extendUserTestSeries,
  updateUserTestSeriesStatus,
  getUserPayments,
  getUserPaymentDetail,
  getUserActivityHistory,
  getUserReport,
  blockUnblockUser,
  resetUserPassword,
  updateUserDetails,
  toggleSubscription,
};
