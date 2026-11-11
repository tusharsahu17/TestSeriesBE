const dashboardModel = require('../models/dashboardModel');

const getDashboardOverview = async (req, res) => {
  try {
    const data = await dashboardModel.getDashboardMetrics(req.query);
    res.json({ success: true, data });
  } catch (error) {
    console.error('Error fetching dashboard metrics:', error);
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

const getOverviewCards = async (req, res) => {
  try {
    const data = await dashboardModel.getOverviewStats();
    res.json({ success: true, data });
  } catch (error) {
    console.error('Error fetching overview cards:', error);
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

const getStudentAnalytics = async (req, res) => {
  try {
    const data = await dashboardModel.getStudentAnalytics(req.query);
    res.json({ success: true, data });
  } catch (error) {
    console.error('Error fetching student analytics:', error);
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

const getTestAnalytics = async (req, res) => {
  try {
    const data = await dashboardModel.getTestAnalytics(req.query);
    res.json({ success: true, data });
  } catch (error) {
    console.error('Error fetching test analytics:', error);
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

const getTestSeriesPerformance = async (req, res) => {
  try {
    const data = await dashboardModel.getTestSeriesPerformance(req.query);
    res.json({ success: true, data });
  } catch (error) {
    console.error('Error fetching test series performance:', error);
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

const getRevenueAnalytics = async (req, res) => {
  try {
    const data = await dashboardModel.getRevenueAnalytics(req.query);
    res.json({ success: true, data });
  } catch (error) {
    console.error('Error fetching revenue analytics:', error);
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

const getStudentPerformanceAnalytics = async (req, res) => {
  try {
    const data = await dashboardModel.getStudentPerformanceAnalytics();
    res.json({ success: true, data });
  } catch (error) {
    console.error('Error fetching student performance analytics:', error);
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

module.exports = {
  getDashboardOverview,
  getOverviewCards,
  getStudentAnalytics,
  getTestAnalytics,
  getTestSeriesPerformance,
  getRevenueAnalytics,
  getStudentPerformanceAnalytics
};
