require('dotenv').config();
const mysql = require('mysql2/promise');

async function seedDatabase() {
  let connection;
  try {
    connection = await mysql.createConnection(process.env.DATABASE_URL);
    console.log('Connected to the database. Starting additional data seeding...');

    // 1. Add NEET Exam
    const [neetResult] = await connection.query(
      "INSERT INTO exams (name, slug, description, category, exam_type, duration_minutes, total_questions, total_marks, passing_marks, max_attempts, difficulty) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      ['NEET', 'neet-ug', 'Medical Entrance Examination', 'Competitive', 'Entrance', 200, 200, 720, 300, 3, 'Advanced']
    );
    const neetId = neetResult.insertId;

    // 2. Add NEET Subjects (Biology, Chemistry is shared but let's add it if missing)
    const [bioResult] = await connection.query("INSERT INTO subjects (name, description) VALUES (?, ?)", ['Biology', 'Botany & Zoology']);
    const [chemResult] = await connection.query("INSERT INTO subjects (name, description) VALUES (?, ?)", ['Chemistry', 'Physical, Organic & Inorganic']);

    // Map to NEET
    await connection.query("INSERT INTO exam_subjects (exam_id, subject_id, display_order) VALUES (?, ?, ?)", [neetId, bioResult.insertId, 1]);
    await connection.query("INSERT INTO exam_subjects (exam_id, subject_id, display_order) VALUES (?, ?, ?)", [neetId, chemResult.insertId, 2]);

    // 3. Add Tests for Biology
    const [cellTest] = await connection.query(
      "INSERT INTO tests (subject_id, name, description, duration_minutes, total_questions, total_marks, passing_marks, difficulty, test_type) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [bioResult.insertId, 'Cell Structure & Function', 'Basic biology test', 45, 30, 120, 50, 'Medium', 'Practice']
    );

    const [q1] = await connection.query(
      "INSERT INTO questions (test_id, question_text, marks) VALUES (?, ?, ?)",
      [cellTest.insertId, 'Which of the following is the powerhouse of the cell?', 4]
    );
    await connection.query("INSERT INTO question_options (question_id, option_text, option_key, is_correct) VALUES (?, ?, ?, ?)", [q1.insertId, 'Nucleus', 'A', false]);
    await connection.query("INSERT INTO question_options (question_id, option_text, option_key, is_correct) VALUES (?, ?, ?, ?)", [q1.insertId, 'Mitochondria', 'B', true]);
    await connection.query("INSERT INTO question_options (question_id, option_text, option_key, is_correct) VALUES (?, ?, ?, ?)", [q1.insertId, 'Ribosome', 'C', false]);

    // 4. Add UPSC Exam
    const [upscResult] = await connection.query(
      "INSERT INTO exams (name, slug, description, category, exam_type, duration_minutes, total_questions, total_marks, passing_marks, max_attempts, difficulty) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      ['UPSC Prelims', 'upsc-prelims', 'Civil Services Examination', 'Competitive', 'Govt Job', 120, 100, 200, 100, 6, 'Hard']
    );
    const upscId = upscResult.insertId;

    // Add UPSC Subject
    const [histResult] = await connection.query("INSERT INTO subjects (name, description) VALUES (?, ?)", ['Indian History', 'Ancient, Medieval and Modern']);
    await connection.query("INSERT INTO exam_subjects (exam_id, subject_id, display_order) VALUES (?, ?, ?)", [upscId, histResult.insertId, 1]);

    const [histTest] = await connection.query(
      "INSERT INTO tests (subject_id, name, description, duration_minutes, total_questions, total_marks, passing_marks, difficulty, test_type) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [histResult.insertId, 'Modern Indian History', 'Freedom struggle', 60, 50, 100, 33, 'Hard', 'Mock']
    );
    
    const [q2] = await connection.query(
      "INSERT INTO questions (test_id, question_text, marks) VALUES (?, ?, ?)",
      [histTest.insertId, 'Who was the first Governor-General of independent India?', 2]
    );
    await connection.query("INSERT INTO question_options (question_id, option_text, option_key, is_correct) VALUES (?, ?, ?, ?)", [q2.insertId, 'Lord Mountbatten', 'A', true]);
    await connection.query("INSERT INTO question_options (question_id, option_text, option_key, is_correct) VALUES (?, ?, ?, ?)", [q2.insertId, 'C. Rajagopalachari', 'B', false]);

    console.log('Additional seeding completed successfully.');
  } catch (error) {
    console.error('Error seeding data:', error);
  } finally {
    if (connection) {
      await connection.end();
    }
    process.exit(0);
  }
}

seedDatabase();
