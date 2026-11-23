const subjectModel = require('../models/subjectModel');

async function getSubjectTests(req, res) {
  try {
    const { is_published } = req.query;
    const filters = {};
    if (is_published !== undefined) {
      if (is_published !== 'all') {
        filters.is_published = is_published === 'true';
      }
    } else {
      // Default to published tests only for student/public endpoint
      filters.is_published = true;
    }
    const tests = await subjectModel.getTestsBySubjectId(req.params.subjectId, filters);
    res.json(tests);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

async function getAllSubjects(req, res) {
  try {
    const subjects = await subjectModel.getAllSubjects();
    res.json({ subjects });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

async function createSubject(req, res) {
  try {
    const id = await subjectModel.createSubject(req.body);
    res.status(201).json({ id, message: 'Subject created successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

async function updateSubject(req, res) {
  try {
    await subjectModel.updateSubject(req.params.id, req.body);
    res.json({ message: 'Subject updated successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

async function deleteSubject(req, res) {
  try {
    await subjectModel.deleteSubject(req.params.id);
    res.json({ message: 'Subject deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

module.exports = {
  getSubjectTests,
  getAllSubjects,
  createSubject,
  updateSubject,
  deleteSubject
};
