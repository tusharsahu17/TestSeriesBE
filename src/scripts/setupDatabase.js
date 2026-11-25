require('dotenv').config();
const mysql = require('mysql2/promise');

async function setupDatabase() {
  let connection;
  try {
    connection = await mysql.createConnection(process.env.DATABASE_URL);
    console.log('Connected to the database. Starting setup...');

    // Disable foreign key checks to allow dropping tables with references
    await connection.query('SET FOREIGN_KEY_CHECKS = 0');

    const tablesToDrop = [
      'attempt_answers',
      'test_attempts',
      'question_options',
      'test_questions',
      'questions',
      'test_topics',
      'tests',
      'subtopics',
      'topics',
      'exam_subjects',
      'subjects',
      'exams',
      'users',
      // Old tables just in case
      'user_answers',
      'options',
      'quizzes',
      'answers',
      'quiz_attempts',
      'exam_types'
    ];

    for (const table of tablesToDrop) {
      await connection.query(`DROP TABLE IF EXISTS ${table}`);
      console.log(`Dropped table ${table} if it existed.`);
    }

    await connection.query('SET FOREIGN_KEY_CHECKS = 1');

    // 1. Create users table (needed for attempts)
    await connection.query(`
      CREATE TABLE users (
        id BIGINT PRIMARY KEY AUTO_INCREMENT,
        username VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        role ENUM('admin', 'student') DEFAULT 'student',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('Created table users');

    // 2. Create exams table
    await connection.query(`
      CREATE TABLE exams (
        id BIGINT PRIMARY KEY AUTO_INCREMENT,
        name VARCHAR(150) NOT NULL,
        slug VARCHAR(180) UNIQUE NOT NULL,
        description TEXT,
        category VARCHAR(100),
        exam_type VARCHAR(100),
        duration_minutes INT,
        total_questions INT,
        total_marks INT,
        passing_marks INT,
        max_attempts INT,
        difficulty VARCHAR(50),
        image_url VARCHAR(500),
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);
    console.log('Created table exams');

    // 3. Create subjects table
    await connection.query(`
      CREATE TABLE subjects (
        id BIGINT PRIMARY KEY AUTO_INCREMENT,
        name VARCHAR(150) NOT NULL,
        description TEXT,
        icon VARCHAR(100),
        image_url VARCHAR(500),
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);
    console.log('Created table subjects');

    // 4. Create exam_subjects table
    await connection.query(`
      CREATE TABLE exam_subjects (
        id BIGINT PRIMARY KEY AUTO_INCREMENT,
        exam_id BIGINT NOT NULL,
        subject_id BIGINT NOT NULL,
        display_order INT DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (exam_id) REFERENCES exams(id) ON DELETE CASCADE,
        FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE,
        UNIQUE(exam_id, subject_id)
      )
    `);
    console.log('Created table exam_subjects');

    // 4b. Create topics table
    await connection.query(`
      CREATE TABLE topics (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        subject_id BIGINT NOT NULL,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE
      )
    `);
    console.log('Created table topics');

    // 4c. Create subtopics table
    await connection.query(`
      CREATE TABLE subtopics (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        topic_id BIGINT NOT NULL,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (topic_id) REFERENCES topics(id) ON DELETE CASCADE
      )
    `);
    console.log('Created table subtopics');

    // 5. Create tests table
    await connection.query(`
      CREATE TABLE tests (
        id BIGINT PRIMARY KEY AUTO_INCREMENT,
        exam_id BIGINT,
        subject_id BIGINT NOT NULL,
        topic_id BIGINT NULL,
        subtopic_id BIGINT NULL,
        name VARCHAR(200) NOT NULL,
        description TEXT,
        duration_minutes INT,
        total_questions INT DEFAULT 0,
        total_marks INT DEFAULT 0,
        passing_marks INT,
        difficulty VARCHAR(50),
        test_type VARCHAR(50) DEFAULT 'topic_wise',
        is_free BOOLEAN DEFAULT TRUE,
        is_active BOOLEAN DEFAULT TRUE,
        display_order INT DEFAULT 0,
        instructions TEXT,
        negative_marking DECIMAL(5,2) DEFAULT 0.00,
        start_time DATETIME NULL,
        end_time DATETIME NULL,
        max_attempts INT DEFAULT 1,
        randomize_questions BOOLEAN DEFAULT FALSE,
        randomize_options BOOLEAN DEFAULT FALSE,
        navigation_settings VARCHAR(50) DEFAULT 'free',
        auto_submit BOOLEAN DEFAULT TRUE,
        is_published BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (exam_id) REFERENCES exams(id) ON DELETE SET NULL,
        FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE,
        FOREIGN KEY (topic_id) REFERENCES topics(id) ON DELETE SET NULL,
        FOREIGN KEY (subtopic_id) REFERENCES subtopics(id) ON DELETE SET NULL
      )
    `);
    console.log('Created table tests');

    // 5b. Create test_topics junction table (for multi-topic tests)
    await connection.query(`
      CREATE TABLE test_topics (
        id BIGINT PRIMARY KEY AUTO_INCREMENT,
        test_id BIGINT NOT NULL,
        topic_id BIGINT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (test_id) REFERENCES tests(id) ON DELETE CASCADE,
        FOREIGN KEY (topic_id) REFERENCES topics(id) ON DELETE CASCADE,
        UNIQUE KEY uq_test_topic (test_id, topic_id)
      )
    `);
    console.log('Created table test_topics');

    // 6. Create questions table
    await connection.query(`
      CREATE TABLE questions (
        id BIGINT PRIMARY KEY AUTO_INCREMENT,
        test_id BIGINT NULL,
        subject_id BIGINT NULL,
        topic_id BIGINT NULL,
        subtopic_id BIGINT NULL,
        question_text TEXT NOT NULL,
        question_type VARCHAR(50) DEFAULT 'MCQ',
        marks DECIMAL(5,2) DEFAULT 1,
        negative_marks DECIMAL(5,2) DEFAULT 0,
        difficulty VARCHAR(50),
        explanation TEXT,
        category VARCHAR(100) NULL,
        subject VARCHAR(100) NULL,
        topic VARCHAR(100) NULL,
        subtopic VARCHAR(100) NULL,
        tags VARCHAR(255) NULL,
        display_order INT DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (test_id) REFERENCES tests(id) ON DELETE SET NULL,
        FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE SET NULL,
        FOREIGN KEY (topic_id) REFERENCES topics(id) ON DELETE SET NULL,
        FOREIGN KEY (subtopic_id) REFERENCES subtopics(id) ON DELETE SET NULL
      )
    `);
    console.log('Created table questions');

    // 6b. Create test_questions junction table (Question Bank mapping)
    await connection.query(`
      CREATE TABLE test_questions (
        id BIGINT PRIMARY KEY AUTO_INCREMENT,
        test_id BIGINT NOT NULL,
        question_id BIGINT NOT NULL,
        question_order INT DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (test_id) REFERENCES tests(id) ON DELETE CASCADE,
        FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE,
        UNIQUE KEY uq_test_question (test_id, question_id)
      )
    `);
    console.log('Created table test_questions');

    // 7. Create question_options table
    await connection.query(`
      CREATE TABLE question_options (
        id BIGINT PRIMARY KEY AUTO_INCREMENT,
        question_id BIGINT NOT NULL,
        option_text TEXT NOT NULL,
        option_key VARCHAR(10),
        is_correct BOOLEAN DEFAULT FALSE,
        display_order INT DEFAULT 0,
        FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE
      )
    `);
    console.log('Created table question_options');

    // 8. Create test_attempts table
    await connection.query(`
      CREATE TABLE test_attempts (
        id BIGINT PRIMARY KEY AUTO_INCREMENT,
        user_id BIGINT NOT NULL,
        test_id BIGINT NOT NULL,
        started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        submitted_at TIMESTAMP NULL,
        total_questions INT,
        attempted_questions INT DEFAULT 0,
        correct_answers INT DEFAULT 0,
        wrong_answers INT DEFAULT 0,
        skipped_questions INT DEFAULT 0,
        total_marks DECIMAL(10,2) DEFAULT 0,
        obtained_marks DECIMAL(10,2) DEFAULT 0,
        percentage DECIMAL(5,2) DEFAULT 0,
        \`rank\` INT,
        time_taken_seconds INT DEFAULT 0,
        status VARCHAR(30) DEFAULT 'IN_PROGRESS',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (test_id) REFERENCES tests(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);
    console.log('Created table test_attempts');

    // 9. Create attempt_answers table
    await connection.query(`
      CREATE TABLE attempt_answers (
        id BIGINT PRIMARY KEY AUTO_INCREMENT,
        attempt_id BIGINT NOT NULL,
        question_id BIGINT NOT NULL,
        selected_option_id BIGINT,
        is_correct BOOLEAN,
        marks_obtained DECIMAL(10,2),
        answered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (attempt_id) REFERENCES test_attempts(id) ON DELETE CASCADE,
        FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE,
        FOREIGN KEY (selected_option_id) REFERENCES question_options(id) ON DELETE CASCADE
      )
    `);
    console.log('Created table attempt_answers');

    // Optional: Seed dummy data
    console.log('Seeding dummy exam and subject data...');
    const [examResult] = await connection.query(
      "INSERT INTO exams (name, slug, description, category, exam_type, duration_minutes, total_questions, total_marks, passing_marks, max_attempts, difficulty) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      ['JEE Main', 'jee-main', 'Engineering Entrance Examination', 'Competitive', 'Entrance', 180, 90, 300, 120, 3, 'Advanced']
    );
    const examId = examResult.insertId;

    const [mathResult] = await connection.query("INSERT INTO subjects (name, description) VALUES (?, ?)", ['Mathematics', 'Advanced Math']);
    const [physResult] = await connection.query("INSERT INTO subjects (name, description) VALUES (?, ?)", ['Physics', 'Advanced Physics']);

    await connection.query("INSERT INTO exam_subjects (exam_id, subject_id, display_order) VALUES (?, ?, ?)", [examId, mathResult.insertId, 1]);
    await connection.query("INSERT INTO exam_subjects (exam_id, subject_id, display_order) VALUES (?, ?, ?)", [examId, physResult.insertId, 2]);

    const [testResult] = await connection.query(
      "INSERT INTO tests (subject_id, name, description, duration_minutes, total_questions, total_marks, passing_marks, difficulty, test_type) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [mathResult.insertId, 'Algebra Test 1', 'Basic algebra', 30, 20, 100, 40, 'Medium', 'Practice']
    );

    const [qResult] = await connection.query(
      "INSERT INTO questions (test_id, question_text, marks) VALUES (?, ?, ?)",
      [testResult.insertId, 'What is 2 + 2?', 5]
    );

    await connection.query("INSERT INTO question_options (question_id, option_text, option_key, is_correct) VALUES (?, ?, ?, ?)", [qResult.insertId, '3', 'A', false]);
    await connection.query("INSERT INTO question_options (question_id, option_text, option_key, is_correct) VALUES (?, ?, ?, ?)", [qResult.insertId, '4', 'B', true]);

    console.log('Database setup completed successfully.');
  } catch (error) {
    console.error('Error setting up the database:', error);
  } finally {
    if (connection) {
      await connection.end();
    }
    process.exit(0);
  }
}

setupDatabase();
