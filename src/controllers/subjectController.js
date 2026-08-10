const subjectModel = require('../models/subjectModel');

async function getSubjectTests(req, res) {
  try {
    const tests = await subjectModel.getTestsBySubjectId(req.params.subjectId);
    res.json(tests);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

module.exports = {
  getSubjectTests
};
