const examTypeModel = require('../models/examTypeModel');

const getExamTypes = async () => {
  return await examTypeModel.getAllExamTypes();
};

const createExamType = async (examTypeData) => {
  return await examTypeModel.createExamType(examTypeData);
};

module.exports = {
  getExamTypes,
  createExamType
};
