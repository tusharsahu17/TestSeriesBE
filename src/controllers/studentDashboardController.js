const studentDashboardModel = require('../models/studentDashboardModel');
const notificationModel = require('../models/notificationModel');

function getUserId(req) {
  return Number(req.user?.userId || req.user?.id);
}

const getFullDashboard = async (req, res) => {
  try {
    const data = await studentDashboardModel.getFullDashboard(getUserId(req), req.query);
    res.json({ success: true, data });
  } catch (error) {
    console.error('Error fetching student dashboard:', error);
    res.status(error.status || 500).json({
      success: false,
      message: error.message || 'Failed to fetch student dashboard',
    });
  }
};

const getDashboardSummary = async (req, res) => {
  try {
    const data = await studentDashboardModel.getDashboardSummary(getUserId(req));
    res.json({ success: true, data });
  } catch (error) {
    console.error('Error fetching dashboard summary:', error);
    res.status(error.status || 500).json({
      success: false,
      message: error.message || 'Failed to fetch dashboard summary',
    });
  }
};

const getMyTestSeries = async (req, res) => {
  try {
    const data = await studentDashboardModel.getMyTestSeries(getUserId(req), req.query);
    res.json({ success: true, data });
  } catch (error) {
    console.error('Error fetching student test series:', error);
    res.status(error.status || 500).json({
      success: false,
      message: error.message || 'Failed to fetch test series',
    });
  }
};

const getTestSeriesDetail = async (req, res) => {
  try {
    const seriesId = studentDashboardModel.parsePositiveInt(req.params.seriesId);
    if (!seriesId) {
      return res.status(400).json({ success: false, message: 'Invalid seriesId parameter' });
    }
    const data = await studentDashboardModel.getStudentTestSeriesDetail(getUserId(req), seriesId);
    if (!data) {
      return res.status(404).json({ success: false, message: 'Enrolled test series not found' });
    }
    res.json({ success: true, data });
  } catch (error) {
    console.error('Error fetching test series detail:', error);
    res.status(error.status || 500).json({
      success: false,
      message: error.message || 'Failed to fetch test series details',
    });
  }
};

const getAvailableTests = async (req, res) => {
  try {
    const data = await studentDashboardModel.getAvailableTests(getUserId(req), req.query);
    res.json({ success: true, data });
  } catch (error) {
    console.error('Error fetching available tests:', error);
    res.status(error.status || 500).json({
      success: false,
      message: error.message || 'Failed to fetch available tests',
    });
  }
};

const startTest = async (req, res) => {
  try {
    const data = await studentDashboardModel.validateAndStartTest(
      getUserId(req),
      req.params.testId,
      req.body || {}
    );
    res.status(201).json({
      success: true,
      message: 'Test attempt started',
      data,
    });
  } catch (error) {
    const status = error.status || 500;
    const payload = {
      success: false,
      message: error.message || 'Failed to start test',
    };
    if (error.code) payload.code = error.code;
    if (error.conflictingAttemptId) payload.conflictingAttemptId = error.conflictingAttemptId;
    if (error.conflictingTestId) payload.conflictingTestId = error.conflictingTestId;
    if (error.details) payload.details = error.details;
    res.status(status).json(payload);
  }
};

const abandonAttempt = async (req, res) => {
  try {
    const data = await studentDashboardModel.abandonTestAttempt(getUserId(req), req.params.attemptId);
    if (!data) {
      return res.status(404).json({ success: false, message: 'Attempt not found' });
    }
    res.json({ success: true, message: 'Attempt marked as abandoned', data });
  } catch (error) {
    console.error('Error abandoning attempt:', error);
    res.status(error.status || 500).json({
      success: false,
      message: error.message || 'Failed to abandon attempt',
    });
  }
};

const getRecentAttempts = async (req, res) => {
  try {
    const data = await studentDashboardModel.getRecentAttempts(getUserId(req), req.query);
    res.json({ success: true, data });
  } catch (error) {
    console.error('Error fetching recent attempts:', error);
    res.status(error.status || 500).json({
      success: false,
      message: error.message || 'Failed to fetch recent attempts',
    });
  }
};

const getAllAttempts = async (req, res) => {
  try {
    const data = await studentDashboardModel.getAllEvaluatedAttempts(getUserId(req), req.query);
    res.json({ success: true, data });
  } catch (error) {
    console.error('Error fetching attempt history:', error);
    res.status(error.status || 500).json({
      success: false,
      message: error.message || 'Failed to fetch attempt history',
    });
  }
};

const getAttemptResult = async (req, res) => {
  try {
    const data = await studentDashboardModel.getAttemptResultDetail(
      getUserId(req),
      req.params.attemptId
    );
    if (!data) {
      return res.status(404).json({ success: false, message: 'Attempt not found' });
    }
    res.json({ success: true, data });
  } catch (error) {
    const status = error.status || 500;
    const payload = {
      success: false,
      message: error.message || 'Failed to fetch attempt result',
    };
    if (error.code) payload.code = error.code;
    if (error.attemptStatus) payload.attemptStatus = error.attemptStatus;
    res.status(status).json(payload);
  }
};

const getPerformanceAnalytics = async (req, res) => {
  try {
    const data = await studentDashboardModel.getPerformanceAnalytics(getUserId(req), req.query);
    res.json({ success: true, data });
  } catch (error) {
    console.error('Error fetching performance analytics:', error);
    res.status(error.status || 500).json({
      success: false,
      message: error.message || 'Failed to fetch performance analytics',
    });
  }
};

const getDashboardNotifications = async (req, res) => {
  try {
    const limitRaw = Number.parseInt(req.query.limit, 10);
    const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 5) : 5;
    const data = await notificationModel.getUserNotifications(getUserId(req), {
      ...req.query,
      page: 1,
      limit,
    });
    res.json({ success: true, data });
  } catch (error) {
    console.error('Error fetching dashboard notifications:', error);
    res.status(error.status || 500).json({
      success: false,
      message: error.message || 'Failed to fetch notifications',
    });
  }
};

const getAllNotifications = async (req, res) => {
  try {
    const data = await notificationModel.getUserNotifications(getUserId(req), {
      ...req.query,
      limit: req.query.limit || 20,
    });
    res.json({ success: true, data });
  } catch (error) {
    console.error('Error fetching all notifications:', error);
    res.status(error.status || 500).json({
      success: false,
      message: error.message || 'Failed to fetch notifications',
    });
  }
};

const markNotificationRead = async (req, res) => {
  try {
    const notificationId = studentDashboardModel.parsePositiveInt(req.params.id);
    if (!notificationId) {
      return res.status(400).json({ success: false, message: 'Invalid notification id parameter' });
    }
    const data = await notificationModel.markNotificationAsRead(getUserId(req), notificationId);
    if (!data) {
      return res.status(404).json({ success: false, message: 'Notification not found' });
    }
    res.json({ success: true, message: 'Notification marked as read', data });
  } catch (error) {
    console.error('Error marking notification as read:', error);
    res.status(error.status || 500).json({
      success: false,
      message: error.message || 'Failed to mark notification as read',
    });
  }
};

const markAllNotificationsRead = async (req, res) => {
  try {
    const data = await notificationModel.markAllNotificationsAsRead(getUserId(req));
    res.json({ success: true, message: 'All notifications marked as read', data });
  } catch (error) {
    console.error('Error marking all notifications as read:', error);
    res.status(error.status || 500).json({
      success: false,
      message: error.message || 'Failed to mark notifications as read',
    });
  }
};

module.exports = {
  getFullDashboard,
  getDashboardSummary,
  getMyTestSeries,
  getTestSeriesDetail,
  getAvailableTests,
  startTest,
  abandonAttempt,
  getRecentAttempts,
  getAllAttempts,
  getAttemptResult,
  getPerformanceAnalytics,
  getDashboardNotifications,
  getAllNotifications,
  markNotificationRead,
  markAllNotificationsRead,
};

