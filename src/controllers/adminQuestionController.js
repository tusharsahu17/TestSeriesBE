const adminQuestionModel = require('../models/adminQuestionModel');
const xlsx = require('xlsx');

const createQuestionHandler = async (req, res) => {
  try {
    const { question_text } = req.body;
    if (!question_text) {
      return res.status(400).json({ error: 'question_text is required' });
    }
    const questionId = await adminQuestionModel.createQuestion(req.body);
    res.status(201).json({ message: 'Question created successfully', questionId });
  } catch (error) {
    res.status(500).json({ error: 'Failed to create question', details: error.message });
  }
};

const updateQuestionHandler = async (req, res) => {
  try {
    const { id } = req.params;
    await adminQuestionModel.updateQuestion(id, req.body);
    res.json({ message: 'Question updated successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update question', details: error.message });
  }
};

const deleteQuestionHandler = async (req, res) => {
  try {
    const { id } = req.params;
    await adminQuestionModel.deleteQuestion(id);
    res.json({ message: 'Question deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete question', details: error.message });
  }
};

const listQuestionsHandler = async (req, res) => {
  try {
    const filters = req.query; // category, subject, topic, subtopic, difficulty, search, etc.
    const questions = await adminQuestionModel.getAllQuestions(filters);
    res.json(questions);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch questions', details: error.message });
  }
};

const getQuestionDetailsHandler = async (req, res) => {
  try {
    const { id } = req.params;
    const question = await adminQuestionModel.getQuestionDetails(id);
    if (!question) {
      return res.status(404).json({ error: 'Question not found' });
    }
    res.json(question);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch question details', details: error.message });
  }
};

const bulkUploadQuestionsHandler = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded. Please upload a CSV or Excel file.' });
    }

    const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const data = xlsx.utils.sheet_to_json(sheet);

    const questionsToCreate = data.map(row => {
      // Map standard headers: Question, Option A, Option B, Option C, Option D, Correct Answer, Explanation, Subject, Topic, Difficulty
      const options = [];
      const correctAns = String(row['Correct Answer']).toUpperCase().trim();
      
      if (row['Option A']) options.push({ option_text: String(row['Option A']), option_key: 'A', is_correct: correctAns === 'A', display_order: 1 });
      if (row['Option B']) options.push({ option_text: String(row['Option B']), option_key: 'B', is_correct: correctAns === 'B', display_order: 2 });
      if (row['Option C']) options.push({ option_text: String(row['Option C']), option_key: 'C', is_correct: correctAns === 'C', display_order: 3 });
      if (row['Option D']) options.push({ option_text: String(row['Option D']), option_key: 'D', is_correct: correctAns === 'D', display_order: 4 });

      return {
        question_text: row['Question'],
        explanation: row['Explanation'] || null,
        subject: row['Subject'] || null,
        topic: row['Topic'] || null,
        difficulty: row['Difficulty'] || 'Medium',
        marks: parseFloat(row['Marks']) || 1,
        negative_marks: parseFloat(row['Negative Marks']) || 0,
        question_type: row['Question Type'] || 'MCQ',
        category: row['Category'] || null,
        options: options
      };
    }).filter(q => q.question_text); // Filter out empty rows

    if (questionsToCreate.length === 0) {
      return res.status(400).json({ error: 'No valid questions found in the file' });
    }

    await adminQuestionModel.bulkCreateQuestions(questionsToCreate);
    res.status(201).json({ message: `${questionsToCreate.length} questions uploaded successfully` });
  } catch (error) {
    res.status(500).json({ error: 'Failed to process bulk upload', details: error.message });
  }
};

module.exports = {
  createQuestionHandler,
  updateQuestionHandler,
  deleteQuestionHandler,
  listQuestionsHandler,
  getQuestionDetailsHandler,
  bulkUploadQuestionsHandler
};
