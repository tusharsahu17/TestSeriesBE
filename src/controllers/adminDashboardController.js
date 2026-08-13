const dashboardModel = require('../models/dashboardModel');

const getDashboardOverview = async (req, res) => {
  try {
    const data = await dashboardModel.getDashboardMetrics();
    res.json({
      success: true,
      data
    });
  } catch (error) {
    console.error('Error fetching dashboard metrics:', error);
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

module.exports = {
  getDashboardOverview
};
