async function enrollStudent(data) {
  const err = new Error('Test series feature has been removed. Tests are accessible directly without enrollment.');
  err.status = 400;
  throw err;
}

async function getAllEnrollments(filters = {}) {
  return [];
}

async function getEnrollmentById(id) {
  return null;
}

async function updateEnrollmentStatus(id, status) {
  return false;
}

module.exports = {
  enrollStudent,
  getAllEnrollments,
  getEnrollmentById,
  updateEnrollmentStatus
};
