const examTypeService = require('../services/examTypeService');

const getExamTypes = async (req, res) => {
  try {
    const examTypes = await examTypeService.getExamTypes();
    res.json(examTypes);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

const createExamType = async (req, res) => {
  try {
    const { name, description, image, is_active } = req.body;
    if (!name) {
      return res.status(400).json({ message: 'Exam type name is required' });
    }
    const insertId = await examTypeService.createExamType({ name, description, image, is_active });
    res.status(201).json({ message: 'Exam type created successfully', id: insertId });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

module.exports = {
  getExamTypes,
  createExamType
};
