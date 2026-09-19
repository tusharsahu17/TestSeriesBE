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

async function getExamTests(req, res) {
  try {
    const tests = await examModel.getTestsForExam(req.params.examId);
    res.json(tests);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

async function createExam(req, res) {
  try {
    const { name, description, is_active } = req.body;
    if (!name) return res.status(400).json({ error: 'Name is required' });
    
    const insertId = await examModel.createExam({ name, description, is_active });
    res.status(201).json({ message: 'Exam created successfully', id: insertId });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

async function updateExam(req, res) {
  try {
    const examId = req.params.examId;
    await examModel.updateExam(examId, req.body);
    res.json({ message: 'Exam updated successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

async function deleteExam(req, res) {
  try {
    const examId = req.params.examId;
    await examModel.deleteExam(examId);
    res.json({ message: 'Exam deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

async function addSubject(req, res) {
  try {
    const { examId } = req.params;
    const { subjectId } = req.body;
    if (!subjectId) return res.status(400).json({ error: 'Subject ID is required' });
    
    await examModel.addSubjectToExam(examId, subjectId);
    res.status(201).json({ message: 'Subject added to exam successfully' });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ error: 'Subject is already added to this exam' });
    }
    res.status(500).json({ error: error.message });
  }
}

async function removeSubject(req, res) {
  try {
    const { examId, subjectId } = req.params;
    await examModel.removeSubjectFromExam(examId, subjectId);
    res.json({ message: 'Subject removed from exam successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

module.exports = {
  getAllExams,
  getExamDetails,
  getExamSubjects,
  getExamTests,
  createExam,
  updateExam,
  deleteExam,
  addSubject,
  removeSubject
};
