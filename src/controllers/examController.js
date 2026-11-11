const examModel = require('../models/examModel');

async function getAllExams(req, res) {
  try {
    const exams = await examModel.getExams();
    res.json(exams);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

async function getExamDetails(req, res) {
  try {
    const exam = await examModel.getExamById(req.params.examId || req.params.id);
    if (!exam) return res.status(404).json({ message: 'Exam not found' });
    res.json(exam);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

async function createExam(req, res) {
  try {
    const { name } = req.body;
    if (!name) {
      return res.status(400).json({ message: 'Exam name is required' });
    }
    const id = await examModel.createExam(req.body);
    res.status(201).json({ id, message: 'Exam created successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

async function updateExam(req, res) {
  try {
    const id = req.params.id || req.params.examId;
    await examModel.updateExam(id, req.body);
    res.json({ message: 'Exam updated successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

async function deleteExam(req, res) {
  try {
    const id = req.params.id || req.params.examId;
    await examModel.deleteExam(id);
    res.json({ message: 'Exam deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

async function getExamSubjects(req, res) {
  try {
    const subjects = await examModel.getSubjectsForExam(req.params.examId || req.params.id);
    res.json(subjects);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

async function addSubjectToExam(req, res) {
  try {
    const examId = req.params.examId || req.params.id;
    const { subjectId, display_order } = req.body;
    if (!subjectId) {
      return res.status(400).json({ message: 'Subject ID is required' });
    }
    await examModel.addSubjectToExam(examId, subjectId, display_order);
    res.status(201).json({ message: 'Subject added to exam successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

async function removeSubjectFromExam(req, res) {
  try {
    const examId = req.params.examId || req.params.id;
    const subjectId = req.params.subjectId;
    await examModel.removeSubjectFromExam(examId, subjectId);
    res.json({ message: 'Subject removed from exam successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

module.exports = {
  getAllExams,
  getExamDetails,
  createExam,
  updateExam,
  deleteExam,
  getExamSubjects,
  addSubjectToExam,
  removeSubjectFromExam
};
