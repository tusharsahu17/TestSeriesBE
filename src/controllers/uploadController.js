const { createDbConnection } = require('../config/db');
const xlsx = require('xlsx');

async function uploadData(req, res) {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  let connection;
  try {
    console.log('Reading uploaded Excel file...');
    const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
    connection = await createDbConnection();

    // Dictionaries to keep track of inserted IDs to link relations
    const examMap = {};
    const subjectMap = {};
    const testMap = {};
    
    const results = {
      exams: 0,
      subjects: 0,
      tests: 0,
      questions: 0
    };

    // 1. SEED EXAMS
    if (workbook.SheetNames.includes('Exams')) {
      const exams = xlsx.utils.sheet_to_json(workbook.Sheets['Exams']);
      for (const row of exams) {
        const [result] = await connection.query(
          "INSERT INTO exams (name, slug, description, category, exam_type, duration_minutes, total_questions, total_marks, passing_marks, max_attempts, difficulty) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
          [
            row.name, row.slug, row.description || '', row.category || 'Standard', row.exam_type || 'General',
            row.duration_minutes || 60, row.total_questions || 0, row.total_marks || 0,
            row.passing_marks || 0, row.max_attempts || null, row.difficulty || 'Medium'
          ]
        );
        examMap[row.slug] = result.insertId;
        results.exams++;
      }
    }

    // 2. SEED SUBJECTS
    if (workbook.SheetNames.includes('Subjects')) {
      const subjects = xlsx.utils.sheet_to_json(workbook.Sheets['Subjects']);
      for (const row of subjects) {
        const [result] = await connection.query(
          "INSERT INTO subjects (name, description) VALUES (?, ?)",
          [row.name, row.description || '']
        );
        const subjectId = result.insertId;
        subjectMap[row.name] = subjectId;
        results.subjects++;

        if (row.exam_slug && examMap[row.exam_slug]) {
          await connection.query(
            "INSERT INTO exam_subjects (exam_id, subject_id, display_order) VALUES (?, ?, ?)",
            [examMap[row.exam_slug], subjectId, row.display_order || 1]
          );
        }
      }
    }

    // 3. SEED TESTS
    if (workbook.SheetNames.includes('Tests')) {
      const tests = xlsx.utils.sheet_to_json(workbook.Sheets['Tests']);
      for (const row of tests) {
        const subjectId = subjectMap[row.subject_name];
        if (!subjectId) continue;

        const [result] = await connection.query(
          "INSERT INTO tests (subject_id, name, description, duration_minutes, total_questions, total_marks, passing_marks, difficulty, test_type) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
          [
            subjectId, row.name, row.description || '', row.duration_minutes || 60,
            row.total_questions || 0, row.total_marks || 0, row.passing_marks || 0,
            row.difficulty || 'Medium', row.test_type || 'Practice'
          ]
        );
        testMap[row.name] = result.insertId;
        results.tests++;
      }
    }

    // 4. SEED QUESTIONS
    if (workbook.SheetNames.includes('Questions')) {
      const questions = xlsx.utils.sheet_to_json(workbook.Sheets['Questions']);
      for (const row of questions) {
        const testId = testMap[row.test_name] || row.test_id;
        if (!testId) continue;

        const [questionResult] = await connection.query(
          "INSERT INTO questions (test_id, question_text, marks) VALUES (?, ?, ?)",
          [testId, row.question_text, row.marks || 1]
        );
        
        const newQuestionId = questionResult.insertId;
        results.questions++;

        const options = [
          { text: row.option_a, key: 'A', is_correct: row.correct_option === 'A' },
          { text: row.option_b, key: 'B', is_correct: row.correct_option === 'B' },
          { text: row.option_c, key: 'C', is_correct: row.correct_option === 'C' },
          { text: row.option_d, key: 'D', is_correct: row.correct_option === 'D' },
        ];

        for (const opt of options) {
          if (opt.text) {
            await connection.query(
              "INSERT INTO question_options (question_id, option_text, option_key, is_correct) VALUES (?, ?, ?, ?)",
              [newQuestionId, opt.text, opt.key, opt.is_correct]
            );
          }
        }
      }
    }

    res.json({ message: 'Successfully seeded data', results });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to process file', details: error.message });
  } finally {
    if (connection) await connection.end();
  }
}

module.exports = {
  uploadData
};
