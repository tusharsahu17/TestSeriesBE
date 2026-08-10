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
    const exam = await examModel.getExamById(req.params.examId);
    if (!exam) return res.status(404).json({ message: 'Exam not found' });
    res.json(exam);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

async function getExamSubjects(req, res) {
  try {
    const subjects = await examModel.getSubjectsForExam(req.params.examId);
    res.json(subjects);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

module.exports = {
  getAllExams,
  getExamDetails,
  getExamSubjects
};
