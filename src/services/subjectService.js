const subjectModel = require('../models/subjectModel');
const examTypeModel = require('../models/examTypeModel');

const getSubjects = async (examTypeId) => {
  const examType = await examTypeModel.getExamTypeById(examTypeId);
  if (!examType) {
    const err = new Error('Exam Type not found');
    err.status = 404;
    throw err;
  }
  return await subjectModel.getSubjectsByExamTypeId(examTypeId);
};

const getTestsForSubject = async (subjectId) => {
  const subject = await subjectModel.getSubjectById(subjectId);
  if (!subject) {
    const err = new Error('Subject not found');
    err.status = 404;
    throw err;
  }
  return await subjectModel.getQuizzesBySubjectId(subjectId);
};

module.exports = {
  getSubjects,
  getTestsForSubject
};
