require('dotenv').config();
const mysql = require('mysql2/promise');
const xlsx = require('xlsx');
const path = require('path');

async function seedExcel() {
  const filePath = path.join(__dirname, '../../data.xlsx');
  
  console.log(`Reading Excel file from ${filePath}...`);
  
  let workbook;
  try {
    workbook = xlsx.readFile(filePath);
  } catch (error) {
    console.error('Could not find data.xlsx. Please ensure you have created it in the root of my-node-app.');
    process.exit(1);
  }

  let connection;
  try {
    connection = await mysql.createConnection(process.env.DATABASE_URL);
    console.log('Connected to the database. Starting full seeding process...');

    // Dictionaries to keep track of inserted IDs to link relations
    const examMap = {};    // slug -> id
    const subjectMap = {}; // name -> id
    const testMap = {};    // name -> id

    // ==========================================
    // 1. SEED EXAMS
    // ==========================================
    if (workbook.SheetNames.includes('Exams')) {
      console.log('--- Seeding Exams ---');
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
        console.log(`Inserted Exam: ${row.name}`);
      }
    } else {
      console.log('No "Exams" sheet found. Skipping...');
    }

    // ==========================================
    // 2. SEED SUBJECTS
    // ==========================================
    if (workbook.SheetNames.includes('Subjects')) {
      console.log('--- Seeding Subjects ---');
      const subjects = xlsx.utils.sheet_to_json(workbook.Sheets['Subjects']);
      for (const row of subjects) {
        // Insert Subject
        const [result] = await connection.query(
          "INSERT INTO subjects (name, description) VALUES (?, ?)",
          [row.name, row.description || '']
        );
        const subjectId = result.insertId;
        subjectMap[row.name] = subjectId;

        // Map to Exam if exam_slug is provided
        if (row.exam_slug && examMap[row.exam_slug]) {
          await connection.query(
            "INSERT INTO exam_subjects (exam_id, subject_id, display_order) VALUES (?, ?, ?)",
            [examMap[row.exam_slug], subjectId, row.display_order || 1]
          );
        }
        console.log(`Inserted Subject: ${row.name}`);
      }
    } else {
      console.log('No "Subjects" sheet found. Skipping...');
    }

    // ==========================================
    // 3. SEED TESTS
    // ==========================================
    if (workbook.SheetNames.includes('Tests')) {
      console.log('--- Seeding Tests ---');
      const tests = xlsx.utils.sheet_to_json(workbook.Sheets['Tests']);
      for (const row of tests) {
        const subjectId = subjectMap[row.subject_name];
        if (!subjectId) {
          console.warn(`Warning: Could not find subject '${row.subject_name}' for test '${row.name}'. Skipping.`);
          continue;
        }

        const [result] = await connection.query(
          "INSERT INTO tests (subject_id, name, description, duration_minutes, total_questions, total_marks, passing_marks, difficulty, test_type) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
          [
            subjectId, row.name, row.description || '', row.duration_minutes || 60,
            row.total_questions || 0, row.total_marks || 0, row.passing_marks || 0,
            row.difficulty || 'Medium', row.test_type || 'Practice'
          ]
        );
        testMap[row.name] = result.insertId;
        console.log(`Inserted Test: ${row.name}`);
      }
    } else {
      console.log('No "Tests" sheet found. Skipping...');
    }

    // ==========================================
    // 4. SEED QUESTIONS
    // ==========================================
    if (workbook.SheetNames.includes('Questions')) {
      console.log('--- Seeding Questions & Options ---');
      const questions = xlsx.utils.sheet_to_json(workbook.Sheets['Questions']);
      let questionCount = 0;

      for (const row of questions) {
        // Find test_id based on test_name OR fallback to test_id column
        const testId = testMap[row.test_name] || row.test_id;
        if (!testId) {
          console.warn(`Warning: Could not find test '${row.test_name}' for a question. Skipping.`);
          continue;
        }

        const [questionResult] = await connection.query(
          "INSERT INTO questions (test_id, question_text, marks) VALUES (?, ?, ?)",
          [testId, row.question_text, row.marks || 1]
        );
        
        const newQuestionId = questionResult.insertId;
        questionCount++;

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
      console.log(`Inserted ${questionCount} Questions and their options.`);
    } else {
      console.log('No "Questions" sheet found. Skipping...');
    }
    
    console.log('\n✅ Successfully seeded all data from Excel!');
  } catch (error) {
    console.error('Error seeding data:', error);
  } finally {
    if (connection) {
      await connection.end();
    }
    process.exit(0);
  }
}

seedExcel();
