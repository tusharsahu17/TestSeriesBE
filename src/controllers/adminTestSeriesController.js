const testSeriesModel = require('../models/testSeriesModel');

const createSeries = async (req, res) => {
  try {
    const { title } = req.body;
    if (!title) {
      return res.status(400).json({ error: 'Title is required' });
    }
    const seriesId = await testSeriesModel.createTestSeries(req.body);
    res.status(201).json({ message: 'Test series created successfully', seriesId });
  } catch (error) {
    res.status(500).json({ error: 'Failed to create test series', details: error.message });
  }
};

const updateSeries = async (req, res) => {
  try {
    const { id } = req.params;
    await testSeriesModel.updateTestSeries(id, req.body);
    res.json({ message: 'Test series updated successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update test series', details: error.message });
  }
};

const deleteSeries = async (req, res) => {
  try {
    const { id } = req.params;
    await testSeriesModel.deleteTestSeries(id);
    res.json({ message: 'Test series deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete test series', details: error.message });
  }
};

const archiveSeries = async (req, res) => {
  try {
    const { id } = req.params;
    await testSeriesModel.archiveTestSeries(id);
    res.json({ message: 'Test series archived successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to archive test series', details: error.message });
  }
};

const togglePublishStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { is_published } = req.body;
    if (typeof is_published !== 'boolean') {
      return res.status(400).json({ error: 'is_published boolean value is required' });
    }
    await testSeriesModel.updateTestSeries(id, { is_published });
    res.json({ message: `Test series ${is_published ? 'published' : 'unpublished'} successfully` });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update publish status', details: error.message });
  }
};

const duplicateSeries = async (req, res) => {
  try {
    const { id } = req.params;
    const newSeriesId = await testSeriesModel.duplicateTestSeries(id);
    res.status(201).json({ message: 'Test series duplicated successfully', newSeriesId });
  } catch (error) {
    res.status(500).json({ error: 'Failed to duplicate test series', details: error.message });
  }
};

const addTest = async (req, res) => {
  try {
    const { id } = req.params;
    const { test_id, order } = req.body;
    if (!test_id) {
      return res.status(400).json({ error: 'test_id is required' });
    }
    await testSeriesModel.addTestToSeries(id, test_id, order);
    res.status(201).json({ message: 'Test added to series successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to add test to series', details: error.message });
  }
};

const reorderTests = async (req, res) => {
  try {
    const { id } = req.params;
    const { ordered_test_ids } = req.body;
    if (!Array.isArray(ordered_test_ids)) {
      return res.status(400).json({ error: 'ordered_test_ids array is required' });
    }
    await testSeriesModel.reorderTestsInSeries(id, ordered_test_ids);
    res.json({ message: 'Tests reordered successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to reorder tests', details: error.message });
  }
};

const listSeries = async (req, res) => {
  try {
    const { is_published, is_archived } = req.query;
    const filters = {};
    if (is_published !== undefined) filters.is_published = is_published === 'true';
    if (is_archived !== undefined) filters.is_archived = is_archived === 'true';

    const series = await testSeriesModel.getAllTestSeries(filters);
    res.json(series);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch test series', details: error.message });
  }
};

const getSeriesDetails = async (req, res) => {
  try {
    const { id } = req.params;
    const series = await testSeriesModel.getTestSeriesById(id);
    if (!series) {
      return res.status(404).json({ error: 'Test series not found' });
    }
    res.json(series);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch test series details', details: error.message });
  }
};

module.exports = {
  createSeries,
  updateSeries,
  deleteSeries,
  archiveSeries,
  togglePublishStatus,
  duplicateSeries,
  addTest,
  reorderTests,
  listSeries,
  getSeriesDetails
};
