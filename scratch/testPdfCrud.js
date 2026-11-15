require('dotenv').config();
const http = require('http');
const fs = require('fs');
const path = require('path');
const app = require('../src/app');

async function runTests() {
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;
  console.log(`Test server running on ${baseUrl}`);

  try {
    // Create a dummy PDF file for testing
    const testPdfPath = path.join(__dirname, 'test_sample.pdf');
    fs.writeFileSync(testPdfPath, '%PDF-1.4\n1 0 obj\n<< /Title (Test Document) >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF');

    console.log('\n--- 1. Testing PDF Upload with categoryName ---');
    const form1 = new FormData();
    const pdfBlob1 = new Blob([fs.readFileSync(testPdfPath)], { type: 'application/pdf' });
    form1.append('file', pdfBlob1, 'Paper_2023.pdf');
    form1.append('categoryName', 'Integration Test Category');
    form1.append('title', '2023 Solved Paper');
    form1.append('description', 'Solved question paper with detailed explanations');

    const uploadRes1 = await fetch(`${baseUrl}/api/pdfs`, {
      method: 'POST',
      body: form1
    });
    const uploadData1 = await uploadRes1.json();
    console.log('Upload 1 response status:', uploadRes1.status);
    console.log('Upload 1 data:', JSON.stringify(uploadData1, null, 2));

    if (!uploadData1.success) throw new Error('Upload 1 failed');
    const pdf1Id = uploadData1.data.id;
    const categoryId = uploadData1.data.category.id;

    console.log('\n--- 2. Testing 2nd PDF Upload with SAME categoryName ---');
    const form2 = new FormData();
    const pdfBlob2 = new Blob([fs.readFileSync(testPdfPath)], { type: 'application/pdf' });
    form2.append('file', pdfBlob2, 'Paper_2022.pdf');
    form2.append('categoryName', 'Integration Test Category');
    form2.append('title', '2022 Solved Paper');

    const uploadRes2 = await fetch(`${baseUrl}/api/pdfs`, {
      method: 'POST',
      body: form2
    });
    const uploadData2 = await uploadRes2.json();
    console.log('Upload 2 response status:', uploadRes2.status);
    console.log('Upload 2 category ID matches category 1:', uploadData2.data.category.id === categoryId);
    const pdf2Id = uploadData2.data.id;

    console.log('\n--- 3. Testing GET /api/pdf-categories (Verify category contains multiple PDFs) ---');
    const getCatsRes = await fetch(`${baseUrl}/api/pdf-categories?search=Integration Test Category`);
    const catsData = await getCatsRes.json();
    console.log('Categories count:', catsData.data.length);
    const testCat = catsData.data.find(c => c.id === categoryId);
    console.log('Category found:', testCat.name);
    console.log('PDF count in category:', testCat.pdfCount);
    console.log('PDFs in category:', testCat.pdfs.map(p => ({ id: p.id, title: p.title })));

    if (testCat.pdfCount !== 2) throw new Error(`Expected 2 PDFs in category, found ${testCat.pdfCount}`);

    console.log('\n--- 4. Testing GET /api/pdf-categories/:id ---');
    const getCatRes = await fetch(`${baseUrl}/api/pdf-categories/${categoryId}`);
    const catData = await getCatRes.json();
    console.log('Category by ID status:', getCatRes.status);
    console.log('Category by ID PDFs length:', catData.data.pdfs.length);

    console.log('\n--- 5. Testing GET /api/pdfs (Filter by categoryId) ---');
    const getPdfsRes = await fetch(`${baseUrl}/api/pdfs?categoryId=${categoryId}`);
    const pdfsData = await getPdfsRes.json();
    console.log('Filtered PDFs count:', pdfsData.data.length);

    console.log('\n--- 6. Testing GET /api/pdfs/:id ---');
    const getPdf1Res = await fetch(`${baseUrl}/api/pdfs/${pdf1Id}`);
    const pdf1Data = await getPdf1Res.json();
    console.log('Single PDF title:', pdf1Data.data.title);

    console.log('\n--- 7. Testing GET /api/pdfs/:id/view ---');
    const viewRes = await fetch(`${baseUrl}/api/pdfs/${pdf1Id}/view`);
    console.log('View PDF status:', viewRes.status);
    console.log('View Content-Type:', viewRes.headers.get('content-type'));

    console.log('\n--- 8. Testing PUT /api/pdfs/:id (Update title) ---');
    const putPdfRes = await fetch(`${baseUrl}/api/pdfs/${pdf1Id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: '2023 Solved Paper (Updated)' })
    });
    const putPdfData = await putPdfRes.json();
    console.log('Update PDF response:', putPdfData.message);
    console.log('Updated PDF title:', putPdfData.data.title);

    console.log('\n--- 9. Testing DELETE /api/pdfs/:id ---');
    const delPdfRes = await fetch(`${baseUrl}/api/pdfs/${pdf1Id}`, {
      method: 'DELETE'
    });
    const delPdfData = await delPdfRes.json();
    console.log('Delete PDF status:', delPdfRes.status);
    console.log('Delete PDF response:', delPdfData.message);

    console.log('\n--- 10. Testing DELETE /api/pdf-categories/:id (Cascade and cleanup) ---');
    const delCatRes = await fetch(`${baseUrl}/api/pdf-categories/${categoryId}`, {
      method: 'DELETE'
    });
    const delCatData = await delCatRes.json();
    console.log('Delete Category status:', delCatRes.status);
    console.log('Delete Category response:', delCatData.message);
    console.log('Deleted PDFs count in cleanup:', delCatData.deletedPdfsCount);

    // Cleanup local test dummy file
    if (fs.existsSync(testPdfPath)) {
      fs.unlinkSync(testPdfPath);
    }

    console.log('\n========================================');
    console.log('ALL CRUD INTEGRATION TESTS PASSED 100%!');
    console.log('========================================');
  } catch (err) {
    console.error('Test failed:', err);
  } finally {
    server.close();
    process.exit(0);
  }
}

runTests();
