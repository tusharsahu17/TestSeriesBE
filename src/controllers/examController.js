const examModel = require('../models/examModel');
const hierarchyModel = require('../models/adminSubjectHierarchyModel');

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

async function getExamTests(req, res) {
  try {
    const examId = req.params.examId || req.params.id;
    const { is_published, is_active } = req.query;
    const filters = {};
    if (is_published !== undefined) {
      if (is_published !== 'all') {
        filters.is_published = is_published === 'true';
      }
    } else {
      // Default to published tests only for student/public endpoint
      filters.is_published = true;
    }
    if (is_active !== undefined) {
      if (is_active !== 'all') {
        filters.is_active = is_active === 'true';
      }
    } else {
      // Default to active tests only for student/public endpoint
      filters.is_active = true;
    }
    if (req.query.subject_id) filters.subject_id = req.query.subject_id;
    if (req.query.topic_id) filters.topic_id = req.query.topic_id;
    if (req.query.subtopic_id) filters.subtopic_id = req.query.subtopic_id;
    if (req.query.test_type) filters.test_type = req.query.test_type;
    if (req.query.search) filters.search = req.query.search;
    const tests = await examModel.getTestsForExam(examId, filters);
    res.json(tests);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

async function getExamHierarchy(req, res) {
  try {
    const examId = req.params.examId || req.params.id;
    const hierarchy = await hierarchyModel.getFullHierarchyByExam(examId, { studentView: true });
    if (!hierarchy) return res.status(404).json({ error: 'Exam not found' });
    res.json(hierarchy);
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
  removeSubjectFromExam,
  getExamTests,
  getExamHierarchy
};
