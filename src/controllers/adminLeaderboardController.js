const adminLeaderboardModel = require('../models/adminLeaderboardModel');

const getSettingsHandler = async (req, res) => {
  try {
    const settings = await adminLeaderboardModel.getSettings();
    res.json(settings);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch leaderboard settings', details: error.message });
  }
};

const updateSettingsHandler = async (req, res) => {
  try {
    await adminLeaderboardModel.updateSettings(req.body);
    res.json({ message: 'Leaderboard settings updated successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update leaderboard settings', details: error.message });
  }
};

const getOverallLeaderboardHandler = async (req, res) => {
  try {
    const leaderboard = await adminLeaderboardModel.getOverallLeaderboard();
    res.json(leaderboard);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch overall leaderboard', details: error.message });
  }
};

const getTestLeaderboardHandler = async (req, res) => {
  try {
    const { testId } = req.params;
    const leaderboard = await adminLeaderboardModel.getTestLeaderboard(testId);
    res.json(leaderboard);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch test leaderboard', details: error.message });
  }
};

const getSeriesLeaderboardHandler = async (req, res) => {
  try {
    const { seriesId } = req.params;
    const leaderboard = await adminLeaderboardModel.getSeriesLeaderboard(seriesId);
    res.json(leaderboard);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch series leaderboard', details: error.message });
  }
};

const getWeeklyLeaderboardHandler = async (req, res) => {
  try {
    const leaderboard = await adminLeaderboardModel.getWeeklyLeaderboard();
    res.json(leaderboard);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch weekly leaderboard', details: error.message });
  }
};

const getMonthlyLeaderboardHandler = async (req, res) => {
  try {
    const leaderboard = await adminLeaderboardModel.getMonthlyLeaderboard();
    res.json(leaderboard);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch monthly leaderboard', details: error.message });
  }
};

const getCategoryLeaderboardHandler = async (req, res) => {
  try {
    const { category } = req.params;
    const leaderboard = await adminLeaderboardModel.getCategoryLeaderboard(category);
    res.json(leaderboard);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch category leaderboard', details: error.message });
  }
};

module.exports = {
  getSettingsHandler,
  updateSettingsHandler,
  getOverallLeaderboardHandler,
  getTestLeaderboardHandler,
  getSeriesLeaderboardHandler,
  getWeeklyLeaderboardHandler,
  getMonthlyLeaderboardHandler,
  getCategoryLeaderboardHandler
};
