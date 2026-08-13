const subjectModel = require('../models/subjectModel');

async function getSubjectTests(req, res) {
  try {
    const tests = await subjectModel.getTestsBySubjectId(req.params.subjectId);
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
