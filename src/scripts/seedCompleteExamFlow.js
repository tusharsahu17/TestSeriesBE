require('dotenv').config();
const { createDbConnection } = require('../config/db');
const examModel = require('../models/examModel');
const subjectModel = require('../models/subjectModel');
const hierarchyModel = require('../models/adminSubjectHierarchyModel');
const testModel = require('../models/testModel');
const questionModel = require('../models/adminQuestionModel');

async function seedCompleteExamFlow() {
  let connection;
  try {
    connection = await createDbConnection();
    console.log('--- Starting Complete Exam Management Flow Seed ---');

    // =========================================================================
    // STEP 1: CREATE EXAMS (SSC CGL, Railway NTPC, Banking, UPSC)
    // =========================================================================
    console.log('\n[Step 1] Creating / Ensuring Exams...');
    const examsData = [
      {
        name: 'SSC CGL',
        description: 'Staff Selection Commission - Combined Graduate Level Examination',
        category: 'Staff Selection Commission',
        exam_type: 'Competitive',
        duration_minutes: 60,
        total_questions: 100,
        total_marks: 200,
        passing_marks: 80,
        difficulty: 'Medium'
      },
      {
        name: 'Railway NTPC',
        description: 'Railway Recruitment Board - Non-Technical Popular Categories',
        category: 'Railways',
        exam_type: 'Competitive',
        duration_minutes: 90,
        total_questions: 100,
        total_marks: 100,
        passing_marks: 40,
        difficulty: 'Medium'
      },
      {
        name: 'Banking (IBPS PO)',
        description: 'Institute of Banking Personnel Selection - Probationary Officer',
        category: 'Banking',
        exam_type: 'Competitive',
        duration_minutes: 60,
        total_questions: 100,
        total_marks: 100,
        passing_marks: 50,
        difficulty: 'Hard'
      },
      {
        name: 'UPSC Civil Services',
        description: 'Union Public Service Commission - Preliminary General Studies',
        category: 'Civil Services',
        exam_type: 'Competitive',
        duration_minutes: 120,
        total_questions: 100,
        total_marks: 200,
        passing_marks: 66,
        difficulty: 'Hard'
      }
    ];

    const examMap = {}; // name -> id
    for (const ex of examsData) {
      const [existing] = await connection.query('SELECT id FROM exams WHERE name = ?', [ex.name]);
      if (existing.length > 0) {
        examMap[ex.name] = existing[0].id;
        console.log(`  ✓ Exam exists: ${ex.name} (ID: ${existing[0].id})`);
      } else {
        const id = await examModel.createExam(ex);
        examMap[ex.name] = id;
        console.log(`  + Created Exam: ${ex.name} (ID: ${id})`);
      }
    }

    // =========================================================================
    // STEP 2: CREATE SUBJECTS (Mathematics, English, Reasoning, General Awareness)
    // =========================================================================
    console.log('\n[Step 2] Creating / Ensuring Subjects...');
    const subjectsData = [
      { name: 'Mathematics', description: 'Quantitative Aptitude and Numerical Ability' },
      { name: 'English', description: 'English Language Comprehension and Grammar' },
      { name: 'Reasoning', description: 'General Intelligence and Logical Reasoning' },
      { name: 'General Awareness', description: 'General Knowledge, Current Affairs, and General Science' }
    ];

    const subjectMap = {}; // name -> id
    for (const sub of subjectsData) {
      const [existing] = await connection.query('SELECT id FROM subjects WHERE name = ?', [sub.name]);
      if (existing.length > 0) {
        subjectMap[sub.name] = existing[0].id;
        console.log(`  ✓ Subject exists: ${sub.name} (ID: ${existing[0].id})`);
      } else {
        const id = await subjectModel.createSubject(sub);
        subjectMap[sub.name] = id;
        console.log(`  + Created Subject: ${sub.name} (ID: ${id})`);
      }
    }

    // =========================================================================
    // STEP 3: MAP SUBJECTS TO EXAMS (Using exam_subjects)
    // =========================================================================
    console.log('\n[Step 3] Mapping Subjects to Exams (exam_subjects)...');
    const examSubjectsPlan = [
      { exam: 'SSC CGL', subjects: ['Mathematics', 'English', 'Reasoning', 'General Awareness'] },
      { exam: 'Railway NTPC', subjects: ['Mathematics', 'Reasoning', 'General Awareness'] },
      { exam: 'Banking (IBPS PO)', subjects: ['Mathematics', 'English', 'Reasoning', 'General Awareness'] },
      { exam: 'UPSC Civil Services', subjects: ['General Awareness', 'Reasoning', 'Mathematics', 'English'] }
    ];

    for (const plan of examSubjectsPlan) {
      const examId = examMap[plan.exam];
      let order = 1;
      for (const subjName of plan.subjects) {
        const subjectId = subjectMap[subjName];
        await examModel.addSubjectToExam(examId, subjectId, order++);
      }
      console.log(`  ✓ Mapped ${plan.subjects.length} subjects to ${plan.exam}`);
    }

    // =========================================================================
    // STEP 4: CREATE TOPICS AND SUBTOPICS
    // =========================================================================
    console.log('\n[Step 4] Creating Topics and Subtopics...');
    const hierarchyPlan = [
      {
        subject: 'Mathematics',
        topics: [
          {
            name: 'Percentage',
            description: 'Concepts, fraction to percentage conversion, and applications',
            subtopics: [
              'Basic Concepts & Percentage Conversions',
              'Price, Consumption & Expenditure',
              'Successive Percentage & Population'
            ]
          },
          {
            name: 'Profit, Loss & Discount',
            description: 'Cost Price, Selling Price, Marked Price and Successive Discounts',
            subtopics: [
              'Cost Price & Selling Price Calculations',
              'Marked Price & Discount Schemes',
              'Dishonest Dealer & Faulty Weights'
            ]
          },
          {
            name: 'Number System',
            description: 'Divisibility, remainders, unit digit, and number properties',
            subtopics: [
              'Divisibility Rules',
              'Remainders Theorem',
              'HCF and LCM Applications'
            ]
          }
        ]
      },
      {
        subject: 'English',
        topics: [
          {
            name: 'Grammar Rules',
            description: 'Essential rules of grammar for competitive exams',
            subtopics: [
              'Subject-Verb Agreement',
              'Tenses & Conditionals',
              'Prepositions and Conjunctions'
            ]
          },
          {
            name: 'Vocabulary',
            description: 'Synonyms, Antonyms, Idioms and Phrases',
            subtopics: [
              'Synonyms & Antonyms',
              'Idioms & Phrases',
              'One Word Substitution'
            ]
          }
        ]
      },
      {
        subject: 'Reasoning',
        topics: [
          {
            name: 'Coding-Decoding',
            description: 'Letter and number patterns decoding',
            subtopics: [
              'Letter-to-Letter Coding',
              'Number and Symbol Coding',
              'Matrix Coding'
            ]
          },
          {
            name: 'Syllogism',
            description: 'Deductive reasoning statements and conclusions',
            subtopics: [
              'Standard 2-Statement Syllogisms',
              'Possibility Cases',
              'Only a few / Few Cases'
            ]
          }
        ]
      },
      {
        subject: 'General Awareness',
        topics: [
          {
            name: 'Indian Polity',
            description: 'Constitution of India, Fundamental Rights and Governance',
            subtopics: [
              'Preamble & Constitutional Features',
              'Fundamental Rights & Duties',
              'Parliament & President'
            ]
          },
          {
            name: 'Modern Indian History',
            description: 'Freedom struggle and colonial India',
            subtopics: [
              'Revolt of 1857',
              'Gandhian Era (1919-1947)',
              'Social and Religious Reform Movements'
            ]
          }
        ]
      }
    ];

    const topicMap = {}; // topicName -> id
    const subtopicMap = {}; // subtopicName -> id

    for (const h of hierarchyPlan) {
      const subjectId = subjectMap[h.subject];
      for (const t of h.topics) {
        const [existingT] = await connection.query(
          'SELECT id FROM topics WHERE subject_id = ? AND name = ?',
          [subjectId, t.name]
        );
        let topicId;
        if (existingT.length > 0) {
          topicId = existingT[0].id;
          console.log(`  ✓ Topic exists: ${t.name} (Subject: ${h.subject})`);
        } else {
          topicId = await hierarchyModel.createTopic(subjectId, {
            name: t.name,
            description: t.description,
            is_active: true
          });
          console.log(`  + Created Topic: ${t.name} (ID: ${topicId})`);
        }
        topicMap[t.name] = topicId;

        // Subtopics
        for (const stName of t.subtopics) {
          const [existingST] = await connection.query(
            'SELECT id FROM subtopics WHERE topic_id = ? AND name = ?',
            [topicId, stName]
          );
          let subtopicId;
          if (existingST.length > 0) {
            subtopicId = existingST[0].id;
          } else {
            subtopicId = await hierarchyModel.createSubtopic(topicId, {
              name: stName,
              description: `Subtopic on ${stName}`,
              is_active: true
            });
            console.log(`    + Created Subtopic: ${stName} (ID: ${subtopicId})`);
          }
          subtopicMap[stName] = subtopicId;
        }
      }
    }

    // =========================================================================
    // STEP 6 (Prep): SEED QUESTION BANK WITH TOPIC & SUBTOPIC TAGGING
    // =========================================================================
    console.log('\n[Step 6 Prep] Seeding Question Bank with rich Topic & Subtopic tagging...');
    const questionsSeed = [
      // Mathematics - Percentage
      {
        question_text: 'If the price of sugar increases by 25%, by what percent must a family decrease its consumption so that expenditure remains unchanged?',
        marks: 2,
        negative_marks: 0.5,
        difficulty: 'Easy',
        explanation: 'Required reduction = [r / (100 + r)] * 100 = [25 / 125] * 100 = 20%.',
        subject: 'Mathematics',
        subject_id: subjectMap['Mathematics'],
        topic: 'Percentage',
        topic_id: topicMap['Percentage'],
        subtopic: 'Price, Consumption & Expenditure',
        subtopic_id: subtopicMap['Price, Consumption & Expenditure'],
        options: [
          { option_text: '15%', option_key: 'A', is_correct: false, display_order: 1 },
          { option_text: '20%', option_key: 'B', is_correct: true, display_order: 2 },
          { option_text: '25%', option_key: 'C', is_correct: false, display_order: 3 },
          { option_text: '16.66%', option_key: 'D', is_correct: false, display_order: 4 }
        ]
      },
      {
        question_text: 'Two numbers are respectively 20% and 50% more than a third number. What percentage is the first number of the second number?',
        marks: 2,
        negative_marks: 0.5,
        difficulty: 'Easy',
        explanation: 'Let third number be 100. First = 120, Second = 150. (120/150) * 100 = 80%.',
        subject: 'Mathematics',
        subject_id: subjectMap['Mathematics'],
        topic: 'Percentage',
        topic_id: topicMap['Percentage'],
        subtopic: 'Basic Concepts & Percentage Conversions',
        subtopic_id: subtopicMap['Basic Concepts & Percentage Conversions'],
        options: [
          { option_text: '70%', option_key: 'A', is_correct: false, display_order: 1 },
          { option_text: '75%', option_key: 'B', is_correct: false, display_order: 2 },
          { option_text: '80%', option_key: 'C', is_correct: true, display_order: 3 },
          { option_text: '85%', option_key: 'D', is_correct: false, display_order: 4 }
        ]
      },
      {
        question_text: 'The population of a town increases by 10% in the first year and decreases by 10% in the second year. If the initial population was 100,000, what is the net change?',
        marks: 2,
        negative_marks: 0.5,
        difficulty: 'Medium',
        explanation: 'Net change = +10 - 10 - (10*10)/100 = -1% (Decrease of 1,000).',
        subject: 'Mathematics',
        subject_id: subjectMap['Mathematics'],
        topic: 'Percentage',
        topic_id: topicMap['Percentage'],
        subtopic: 'Successive Percentage & Population',
        subtopic_id: subtopicMap['Successive Percentage & Population'],
        options: [
          { option_text: '1% decrease', option_key: 'A', is_correct: true, display_order: 1 },
          { option_text: '1% increase', option_key: 'B', is_correct: false, display_order: 2 },
          { option_text: 'No change', option_key: 'C', is_correct: false, display_order: 3 },
          { option_text: '2% decrease', option_key: 'D', is_correct: false, display_order: 4 }
        ]
      },

      // Mathematics - Profit, Loss & Discount
      {
        question_text: 'A merchant marks his goods 40% above the cost price and allows a discount of 25%. What is his profit percentage?',
        marks: 2,
        negative_marks: 0.5,
        difficulty: 'Medium',
        explanation: 'CP = 100, MP = 140, SP = 140 * 0.75 = 105. Profit = 5%.',
        subject: 'Mathematics',
        subject_id: subjectMap['Mathematics'],
        topic: 'Profit, Loss & Discount',
        topic_id: topicMap['Profit, Loss & Discount'],
        subtopic: 'Marked Price & Discount Schemes',
        subtopic_id: subtopicMap['Marked Price & Discount Schemes'],
        options: [
          { option_text: '5%', option_key: 'A', is_correct: true, display_order: 1 },
          { option_text: '10%', option_key: 'B', is_correct: false, display_order: 2 },
          { option_text: '12%', option_key: 'C', is_correct: false, display_order: 3 },
          { option_text: '15%', option_key: 'D', is_correct: false, display_order: 4 }
        ]
      },

      // English - Grammar Rules
      {
        question_text: 'Identify the error: "Each of the students (A) / are required to submit (B) / their assignments by Friday (C) / No error (D)"',
        marks: 2,
        negative_marks: 0.5,
        difficulty: 'Medium',
        explanation: '"Each" is singular and takes a singular verb "is required", not "are required".',
        subject: 'English',
        subject_id: subjectMap['English'],
        topic: 'Grammar Rules',
        topic_id: topicMap['Grammar Rules'],
        subtopic: 'Subject-Verb Agreement',
        subtopic_id: subtopicMap['Subject-Verb Agreement'],
        options: [
          { option_text: 'Part A', option_key: 'A', is_correct: false, display_order: 1 },
          { option_text: 'Part B', option_key: 'B', is_correct: true, display_order: 2 },
          { option_text: 'Part C', option_key: 'C', is_correct: false, display_order: 3 },
          { option_text: 'Part D (No error)', option_key: 'D', is_correct: false, display_order: 4 }
        ]
      },

      // Reasoning - Coding-Decoding
      {
        question_text: 'In a certain code language, "TEACHER" is written as "VGCEJGT". How will "CHILDREN" be written in that code?',
        marks: 2,
        negative_marks: 0.5,
        difficulty: 'Easy',
        explanation: 'Each letter is shifted by +2 positions in the alphabet: C(+2)=E, H(+2)=J, I(+2)=K, L(+2)=N, D(+2)=F, R(+2)=T, E(+2)=G, N(+2)=P -> EJKNFTGP.',
        subject: 'Reasoning',
        subject_id: subjectMap['Reasoning'],
        topic: 'Coding-Decoding',
        topic_id: topicMap['Coding-Decoding'],
        subtopic: 'Letter-to-Letter Coding',
        subtopic_id: subtopicMap['Letter-to-Letter Coding'],
        options: [
          { option_text: 'EJKNFTGP', option_key: 'A', is_correct: true, display_order: 1 },
          { option_text: 'EJKNFTHP', option_key: 'B', is_correct: false, display_order: 2 },
          { option_text: 'EGKNFGTP', option_key: 'C', is_correct: false, display_order: 3 },
          { option_text: 'EJKMFTGP', option_key: 'D', is_correct: false, display_order: 4 }
        ]
      },

      // General Awareness - Indian Polity
      {
        question_text: 'Which Article of the Indian Constitution guarantees the "Right to Constitutional Remedies"?',
        marks: 2,
        negative_marks: 0.5,
        difficulty: 'Easy',
        explanation: 'Article 32 was called the "Heart and Soul of the Constitution" by Dr. B.R. Ambedkar.',
        subject: 'General Awareness',
        subject_id: subjectMap['General Awareness'],
        topic: 'Indian Polity',
        topic_id: topicMap['Indian Polity'],
        subtopic: 'Fundamental Rights & Duties',
        subtopic_id: subtopicMap['Fundamental Rights & Duties'],
        options: [
          { option_text: 'Article 19', option_key: 'A', is_correct: false, display_order: 1 },
          { option_text: 'Article 21', option_key: 'B', is_correct: false, display_order: 2 },
          { option_text: 'Article 32', option_key: 'C', is_correct: true, display_order: 3 },
          { option_text: 'Article 44', option_key: 'D', is_correct: false, display_order: 4 }
        ]
      }
    ];

    const createdQuestionIds = [];
    for (const q of questionsSeed) {
      const [existingQ] = await connection.query(
        'SELECT id FROM questions WHERE question_text = ?',
        [q.question_text]
      );
      if (existingQ.length > 0) {
        createdQuestionIds.push(existingQ[0].id);
      } else {
        const qId = await questionModel.createQuestion(q);
        createdQuestionIds.push(qId);
        console.log(`  + Added Question: "${q.question_text.slice(0, 50)}..." (ID: ${qId})`);
      }
    }

    // =========================================================================
    // STEP 5: CREATE TESTS (Select Exam -> Subject -> Test Type -> Topics)
    // =========================================================================
    console.log('\n[Step 5] Creating Tests with full Topic-Wise support...');

    // Test A: Topic-wise Test (SSC CGL -> Mathematics -> topic_wise -> Percentage)
    const topicTestSSC = {
      exam_id: examMap['SSC CGL'],
      subject_id: subjectMap['Mathematics'],
      test_type: 'topic_wise',
      topic_id: topicMap['Percentage'],
      subtopic_id: subtopicMap['Price, Consumption & Expenditure'],
      name: 'SSC CGL Mathematics: Percentage Practice Test 01',
      description: 'Topic-wise practice test covering percentage increase/decrease, consumption and successive changes',
      duration_minutes: 20,
      total_marks: 20,
      passing_marks: 8,
      difficulty: 'Medium',
      instructions: 'Each question carries 2 marks. 0.5 negative marks for wrong answers.',
      is_free: true,
      is_active: true,
      is_published: false
    };

    // Test B: Multi-Topic Test (Railway NTPC -> Mathematics -> Percentage + Profit & Loss)
    const multiTopicTestNTPC = {
      exam_id: examMap['Railway NTPC'],
      subject_id: subjectMap['Mathematics'],
      test_type: 'topic_wise',
      topic_id: topicMap['Percentage'],
      topic_ids: [topicMap['Percentage'], topicMap['Profit, Loss & Discount']],
      name: 'Railway NTPC: Arithmetic Mastery (Percentage + Profit & Loss)',
      description: 'Comprehensive chapter test covering Percentage and Profit, Loss & Discount',
      duration_minutes: 30,
      total_marks: 30,
      passing_marks: 12,
      difficulty: 'Medium',
      is_free: true,
      is_active: true,
      is_published: false
    };

    // Test C: Topic-wise Test (Banking -> Reasoning -> Coding-Decoding)
    const topicTestBanking = {
      exam_id: examMap['Banking (IBPS PO)'],
      subject_id: subjectMap['Reasoning'],
      test_type: 'topic_wise',
      topic_id: topicMap['Coding-Decoding'],
      name: 'IBPS PO Reasoning: Coding-Decoding Chapter Test',
      description: 'Practice questions on advanced coding-decoding patterns',
      duration_minutes: 15,
      total_marks: 20,
      passing_marks: 10,
      difficulty: 'Hard',
      is_free: true,
      is_active: true,
      is_published: false
    };

    // Test D: Topic-wise Test (UPSC -> General Awareness -> Indian Polity)
    const topicTestUPSC = {
      exam_id: examMap['UPSC Civil Services'],
      subject_id: subjectMap['General Awareness'],
      test_type: 'topic_wise',
      topic_id: topicMap['Indian Polity'],
      subtopic_id: subtopicMap['Fundamental Rights & Duties'],
      name: 'UPSC Prelims: Indian Polity - Fundamental Rights Test',
      description: 'High-yield conceptual questions on Fundamental Rights and Articles 12-35',
      duration_minutes: 25,
      total_marks: 40,
      passing_marks: 15,
      difficulty: 'Hard',
      is_free: false,
      is_active: true,
      is_published: false
    };

    const testsToCreate = [topicTestSSC, multiTopicTestNTPC, topicTestBanking, topicTestUPSC];
    const createdTestIds = [];

    for (const t of testsToCreate) {
      const [existing] = await connection.query('SELECT id FROM tests WHERE name = ?', [t.name]);
      let testId;
      if (existing.length > 0) {
        testId = existing[0].id;
        console.log(`  ✓ Test already exists: ${t.name} (ID: ${testId})`);
      } else {
        testId = await testModel.createTest(t);
        console.log(`  + Created ${t.test_type} Test: ${t.name} (ID: ${testId})`);
      }
      createdTestIds.push(testId);
    }

    // =========================================================================
    // STEP 6: ADD QUESTIONS FROM QUESTION BANK TO TESTS
    // =========================================================================
    console.log('\n[Step 6] Assigning Questions from Question Bank to Tests...');
    const test1Id = createdTestIds[0]; // SSC CGL Percentage Test
    // Find all percentage questions
    const [percentageQuestions] = await connection.query(
      'SELECT id FROM questions WHERE topic_id = ?',
      [topicMap['Percentage']]
    );
    const qIdsForTest1 = percentageQuestions.map(q => q.id);
    if (qIdsForTest1.length > 0) {
      const assignRes = await testModel.addQuestionsToTest(test1Id, qIdsForTest1);
      console.log(`  ✓ Assigned ${assignRes.added} questions to Test ID ${test1Id}`);
    }

    // Test 2: Railway NTPC Arithmetic (Percentage + Profit/Loss)
    const test2Id = createdTestIds[1];
    const [arithQuestions] = await connection.query(
      'SELECT id FROM questions WHERE topic_id IN (?, ?)',
      [topicMap['Percentage'], topicMap['Profit, Loss & Discount']]
    );
    const qIdsForTest2 = arithQuestions.map(q => q.id);
    if (qIdsForTest2.length > 0) {
      const assignRes = await testModel.addQuestionsToTest(test2Id, qIdsForTest2);
      console.log(`  ✓ Assigned ${assignRes.added} questions to Test ID ${test2Id}`);
    }

    // Test 3: IBPS PO Coding-Decoding
    const test3Id = createdTestIds[2];
    const [reasoningQuestions] = await connection.query(
      'SELECT id FROM questions WHERE topic_id = ?',
      [topicMap['Coding-Decoding']]
    );
    const qIdsForTest3 = reasoningQuestions.map(q => q.id);
    if (qIdsForTest3.length > 0) {
      const assignRes = await testModel.addQuestionsToTest(test3Id, qIdsForTest3);
      console.log(`  ✓ Assigned ${assignRes.added} questions to Test ID ${test3Id}`);
    }

    // Test 4: UPSC Polity
    const test4Id = createdTestIds[3];
    const [polityQuestions] = await connection.query(
      'SELECT id FROM questions WHERE topic_id = ?',
      [topicMap['Indian Polity']]
    );
    const qIdsForTest4 = polityQuestions.map(q => q.id);
    if (qIdsForTest4.length > 0) {
      const assignRes = await testModel.addQuestionsToTest(test4Id, qIdsForTest4);
      console.log(`  ✓ Assigned ${assignRes.added} questions to Test ID ${test4Id}`);
    }

    // =========================================================================
    // STEP 7: PUBLISH TESTS
    // =========================================================================
    console.log('\n[Step 7] Publishing Tests...');
    for (const testId of createdTestIds) {
      await testModel.updateTest(testId, { is_published: true });
      console.log(`  ✓ Published Test ID ${testId}`);
    }

    console.log('\n=== COMPLETE EXAM MANAGEMENT & TOPIC-WISE FLOW SEEDED SUCCESSFULLY ===');
  } catch (err) {
    console.error('Error seeding complete exam flow:', err);
  } finally {
    if (connection) await connection.end();
  }
}

if (require.main === module) {
  seedCompleteExamFlow()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}

module.exports = { seedCompleteExamFlow };
