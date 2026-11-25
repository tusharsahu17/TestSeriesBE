require('dotenv').config();
const http = require('http');
const app = require('./src/app');

function makeRequest(server, method, path, body = null) {
  return new Promise((resolve, reject) => {
    const address = server.address();
    const options = {
      hostname: '127.0.0.1',
      port: address.port,
      path: path,
      method: method,
      headers: {
        'Content-Type': 'application/json'
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve({ status: res.statusCode, body: json });
        } catch (e) {
          resolve({ status: res.statusCode, raw: data });
        }
      });
    });

    req.on('error', reject);
    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

async function runVerification() {
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  console.log(`Test verification server running on port ${port}\n`);

  let allPassed = true;
  function assert(condition, message) {
    if (!condition) {
      console.error(`❌ FAILED: ${message}`);
      allPassed = false;
    } else {
      console.log(`✅ PASSED: ${message}`);
    }
  }

  try {
    // 1. Verify Exams
    console.log('\n--- 1. Testing GET /api/exams ---');
    const examsRes = await makeRequest(server, 'GET', '/api/exams');
    assert(examsRes.status === 200, 'Status is 200');
    assert(Array.isArray(examsRes.body), 'Exams is an array');
    const examNames = examsRes.body.map(e => e.name);
    console.log('Available exams:', examNames);
    assert(examNames.includes('SSC CGL'), 'Contains SSC CGL');
    assert(examNames.includes('Railway NTPC'), 'Contains Railway NTPC');
    assert(examNames.includes('Banking (IBPS PO)'), 'Contains Banking (IBPS PO)');
    assert(examNames.includes('UPSC Civil Services'), 'Contains UPSC Civil Services');
    const sscExam = examsRes.body.find(e => e.name === 'SSC CGL');

    // 2. Verify Mapping Subjects to Exams & Hierarchy
    console.log('\n--- 2. Testing GET /api/exams/:examId/subjects ---');
    const sscSubjRes = await makeRequest(server, 'GET', `/api/exams/${sscExam.id}/subjects`);
    assert(sscSubjRes.status === 200, 'Status is 200');
    assert(Array.isArray(sscSubjRes.body) && sscSubjRes.body.length > 0, 'Returns mapped subjects');
    console.log('SSC CGL Subjects:', sscSubjRes.body.map(s => `${s.name} (Topics: ${s.topics_count}, Tests: ${s.tests_count})`));
    const mathSubj = sscSubjRes.body.find(s => s.name === 'Mathematics');

    // 3. Verify Exam Hierarchy Tree
    console.log('\n--- 3. Testing GET /api/exams/:examId/hierarchy ---');
    const hierarchyRes = await makeRequest(server, 'GET', `/api/exams/${sscExam.id}/hierarchy`);
    assert(hierarchyRes.status === 200, 'Status is 200');
    assert(hierarchyRes.body.id === sscExam.id, 'Returns exam root');
    assert(Array.isArray(hierarchyRes.body.subjects), 'Contains subjects array');
    const mathInTree = hierarchyRes.body.subjects.find(s => s.name === 'Mathematics');
    assert(mathInTree && mathInTree.topics.length > 0, 'Mathematics has topics in hierarchy');
    console.log('Mathematics Topics in Hierarchy:', mathInTree.topics.map(t => `${t.name} (Subtopics: ${t.subtopics.length}, Tests: ${t.tests_count})`));

    // 4. Verify Topics for a Subject
    console.log('\n--- 4. Testing GET /api/subjects/:subjectId/topics ---');
    const topicsRes = await makeRequest(server, 'GET', `/api/subjects/${mathSubj.id}/topics`);
    assert(topicsRes.status === 200, 'Status is 200');
    assert(Array.isArray(topicsRes.body) && topicsRes.body.length > 0, 'Returns topics');
    const percentageTopic = topicsRes.body.find(t => t.name === 'Percentage');
    assert(Boolean(percentageTopic), 'Found Percentage topic');

    // 5. Verify Topic Details
    console.log('\n--- 5. Testing GET /api/admin/hierarchy/topics/:id ---');
    const topicDetailsRes = await makeRequest(server, 'GET', `/api/admin/hierarchy/topics/${percentageTopic.id}`);
    assert(topicDetailsRes.status === 200, 'Status is 200');
    assert(topicDetailsRes.body.name === 'Percentage', 'Topic name is Percentage');
    assert(Array.isArray(topicDetailsRes.body.subtopics) && topicDetailsRes.body.subtopics.length > 0, 'Has subtopics');
    console.log('Percentage Subtopics:', topicDetailsRes.body.subtopics.map(st => st.name));

    // 6. Verify Listing Tests Filtered by test_type and topic_id
    console.log('\n--- 6. Testing GET /api/admin/tests?test_type=topic_wise&topic_id=... ---');
    const topicTestsRes = await makeRequest(server, 'GET', `/api/admin/tests?test_type=topic_wise&topic_id=${percentageTopic.id}`);
    assert(topicTestsRes.status === 200, 'Status is 200');
    assert(Array.isArray(topicTestsRes.body) && topicTestsRes.body.length > 0, 'Returns topic-wise tests for topic');
    console.log('Topic-wise tests for Percentage:', topicTestsRes.body.map(t => `${t.name} (Type: ${t.test_type}, Topic: ${t.topic_name})`));

    // 7. Verify Questions in Question Bank Filtered by topic_id
    console.log('\n--- 7. Testing GET /api/admin/questions?topic_id=... ---');
    const questionsRes = await makeRequest(server, 'GET', `/api/admin/questions?topic_id=${percentageTopic.id}`);
    assert(questionsRes.status === 200, 'Status is 200');
    assert(Array.isArray(questionsRes.body) && questionsRes.body.length > 0, 'Returns questions for topic');
    console.log(`Found ${questionsRes.body.length} questions tagged with Percentage topic`);

    // 8. Test Flow: Create a NEW Topic-Wise Test, Assign Questions, and Publish!
    console.log('\n--- 8. Testing Dynamic Topic-Wise Test Creation & Publishing ---');
    const newTestPayload = {
      exam_id: sscExam.id,
      subject_id: mathSubj.id,
      test_type: 'topic_wise',
      topic_id: percentageTopic.id,
      name: 'Automated Test: Percentage Speed Drill',
      description: 'Test created dynamically via API verification',
      duration_minutes: 15,
      total_marks: 10,
      passing_marks: 4,
      difficulty: 'Easy',
      is_free: true,
      is_published: false
    };

    const createTestRes = await makeRequest(server, 'POST', '/api/admin/tests', newTestPayload);
    assert(createTestRes.status === 201, 'POST /api/admin/tests returned 201');
    const dynamicTestId = createTestRes.body.testId;
    assert(Boolean(dynamicTestId), `Created Test ID: ${dynamicTestId}`);

    // Assign questions from question bank
    const qIdsToAssign = questionsRes.body.slice(0, 2).map(q => q.id);
    const assignQRes = await makeRequest(server, 'POST', `/api/admin/tests/${dynamicTestId}/questions`, {
      question_ids: qIdsToAssign
    });
    assert(assignQRes.status === 200, 'POST /api/admin/tests/:id/questions returned 200');
    assert(assignQRes.body.added === qIdsToAssign.length, `Assigned ${qIdsToAssign.length} questions`);

    // Check test questions
    const testQsRes = await makeRequest(server, 'GET', `/api/admin/tests/${dynamicTestId}/questions`);
    assert(testQsRes.status === 200, 'GET /api/admin/tests/:id/questions returned 200');
    assert(testQsRes.body.count === qIdsToAssign.length, `Test has ${testQsRes.body.count} questions`);

    // Publish Test
    const publishRes = await makeRequest(server, 'PATCH', `/api/admin/tests/${dynamicTestId}/publish`, {
      is_published: true
    });
    assert(publishRes.status === 200, 'PATCH /api/admin/tests/:id/publish returned 200');

    // Verify test is published and accessible via public /api/tests?topic_id=...
    const publicTestsRes = await makeRequest(server, 'GET', `/api/tests?topic_id=${percentageTopic.id}&is_published=true`);
    assert(publicTestsRes.status === 200, 'GET /api/tests returned 200');
    const foundPublished = publicTestsRes.body.find(t => t.id === dynamicTestId);
    assert(Boolean(foundPublished), 'Newly published topic-wise test is discoverable via public API');

    // Clean up dynamic test
    await makeRequest(server, 'DELETE', `/api/admin/tests/${dynamicTestId}`);
    console.log('Cleaned up dynamic test');

    console.log('\n==========================================');
    if (allPassed) {
      console.log('🎉 ALL VERIFICATION TESTS PASSED SUCCESSFULLY!');
    } else {
      console.error('❌ SOME TESTS FAILED.');
      process.exit(1);
    }
  } finally {
    server.close();
  }
}

runVerification()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Test error:', err);
    process.exit(1);
  });
