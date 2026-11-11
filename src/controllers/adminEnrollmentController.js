const enrollmentModel = require('../models/enrollmentModel');

const createEnrollment = async (req, res) => {
  try {
    const { user_id, test_series_id } = req.body;
    if (!user_id || !test_series_id) {
      return res.status(400).json({
        success: false,
        message: 'user_id and test_series_id are required'
      });
    }

    const enrollmentId = await enrollmentModel.enrollStudent(req.body);
    const enrollment = await enrollmentModel.getEnrollmentById(enrollmentId);
    res.status(201).json({
      success: true,
      message: 'Student enrolled successfully',
      data: enrollment
    });
  } catch (error) {
    const status = error.status || 500;
    console.error('Error creating enrollment:', error);
    res.status(status).json({ success: false, message: error.message || 'Server error' });
  }
};

const listEnrollments = async (req, res) => {
  try {
    const enrollments = await enrollmentModel.getAllEnrollments(req.query);
    res.json({ success: true, data: enrollments });
  } catch (error) {
    console.error('Error listing enrollments:', error);
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

const updateEnrollmentStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    if (!['ACTIVE', 'EXPIRED', 'CANCELLED'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'status must be ACTIVE, EXPIRED, or CANCELLED'
      });
    }

    const updated = await enrollmentModel.updateEnrollmentStatus(id, status);
    if (!updated) {
      return res.status(404).json({ success: false, message: 'Enrollment not found' });
    }
    res.json({ success: true, message: `Enrollment status updated to ${status}` });
  } catch (error) {
    console.error('Error updating enrollment status:', error);
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

module.exports = {
  createEnrollment,
  listEnrollments,
  updateEnrollmentStatus
};

