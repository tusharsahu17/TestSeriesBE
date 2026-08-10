require('dotenv').config();
const mysql = require('mysql2/promise');

async function seedMath() {
  let connection;
  try {
    connection = await mysql.createConnection(process.env.DATABASE_URL);
    
    // Get Mathematics subject
    const [subjects] = await connection.query("SELECT id FROM subjects WHERE name = 'Mathematics' LIMIT 1");
    if (subjects.length === 0) {
       console.log('Mathematics subject not found.');
       return;
    }
    const mathId = subjects[0].id;
    
    // Add 5 tests
    const tests = [
      { name: 'Calculus Fundamentals', desc: 'Limits, continuity, and derivatives' },
      { name: 'Linear Algebra Basics', desc: 'Matrices, determinants, and vector spaces' },
      { name: 'Probability & Statistics', desc: 'Permutations, combinations, and probability distributions' },
      { name: 'Trigonometry Mastery', desc: 'Trigonometric functions and identities' },
      { name: 'Coordinate Geometry', desc: 'Lines, circles, and conic sections' }
    ];
    
    for (let i = 0; i < tests.length; i++) {
       const t = tests[i];
       const [testResult] = await connection.query(
         "INSERT INTO tests (subject_id, name, description, duration_minutes, total_questions, total_marks, passing_marks, difficulty, test_type, display_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
         [mathId, t.name, t.desc, 60, 50, 100, 40, 'Medium', 'Practice', i + 2]
       );
       
       // Add one dummy question for each just so they aren't empty
       const [qResult] = await connection.query(
         "INSERT INTO questions (test_id, question_text, marks) VALUES (?, ?, ?)",
         [testResult.insertId, `Sample question for ${t.name}: Solve for x.`, 2]
       );
       await connection.query("INSERT INTO question_options (question_id, option_text, option_key, is_correct) VALUES (?, ?, ?, ?)", [qResult.insertId, '0', 'A', true]);
       await connection.query("INSERT INTO question_options (question_id, option_text, option_key, is_correct) VALUES (?, ?, ?, ?)", [qResult.insertId, '1', 'B', false]);
       await connection.query("INSERT INTO question_options (question_id, option_text, option_key, is_correct) VALUES (?, ?, ?, ?)", [qResult.insertId, '2', 'C', false]);
       await connection.query("INSERT INTO question_options (question_id, option_text, option_key, is_correct) VALUES (?, ?, ?, ?)", [qResult.insertId, '3', 'D', false]);
    }
    
    console.log('Successfully added 5 dummy tests for Mathematics!');
  } catch (error) {
    console.error(error);
  } finally {
    if (connection) await connection.end();
    process.exit(0);
  }
}
seedMath();
