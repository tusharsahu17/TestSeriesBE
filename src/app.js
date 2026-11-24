const express = require('express');
const cors = require('cors');
const path = require('path');
const { createDbConnection } = require('./config/db');
const authRoutes = require('./routes/auth');
const adminRoutes = require('./routes/adminRoutes');
const adminUserRoutes = require('./routes/adminUserRoutes');
const adminDashboardRoutes = require('./routes/adminDashboardRoutes');
const adminEnrollmentRoutes = require('./routes/adminEnrollmentRoutes');
const adminPaymentRoutes = require('./routes/adminPaymentRoutes');
const adminTestRoutes = require('./routes/adminTestRoutes');
const adminQuestionRoutes = require('./routes/adminQuestionRoutes');
const adminSubjectHierarchyRoutes = require('./routes/adminSubjectHierarchyRoutes');
const adminResultRoutes = require('./routes/adminResultRoutes');
const adminLeaderboardRoutes = require('./routes/adminLeaderboardRoutes');
const adminCategoryRoutes = require('./routes/adminCategoryRoutes');
const examRoutes = require('./routes/examRoutes');
const subjectRoutes = require('./routes/subjectRoutes');
const testRoutes = require('./routes/testRoutes');
const attemptRoutes = require('./routes/attemptRoutes');
const userDashboardRoutes = require('./routes/userDashboardRoutes');
const uploadRoutes = require('./routes/uploadRoutes');
const pdfRoutes = require('./routes/pdfRoutes');
const pdfCategoryRoutes = require('./routes/pdfCategoryRoutes');
const { initPdfTables } = require('./config/initPdf');
const { initQuestionBankAdmin } = require('./config/initQuestionBankAdmin');
const { initTestsAdmin } = require('./config/initTestsAdmin');
const swaggerUi = require('swagger-ui-express');
const swaggerSpec = require('./config/swagger');

// Ensure PDF tables exist automatically
initPdfTables().catch(err => {
  console.warn('PDF tables auto-init warning:', err.message);
});

// Ensure Question Bank schema and ON DELETE SET NULL foreign key constraint exist
initQuestionBankAdmin().catch(err => {
  console.warn('Question bank auto-init warning:', err.message);
});

// Ensure tests table schema (including exam_id) exists automatically
initTestsAdmin().catch(err => {
  console.warn('Tests table auto-init warning:', err.message);
});

const app = express();

app.use(cors({
  origin: true,
  credentials: true,
}));
app.use(express.json());

// Serve uploaded static files
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

app.use('/api/auth', authRoutes);
app.use('/api/exams', examRoutes);
app.use('/api/subjects', subjectRoutes);
app.use('/api/tests', testRoutes);
app.use('/api/attempts', attemptRoutes);
app.use('/api/user', userDashboardRoutes);
app.use('/api/upload', uploadRoutes);

// PDF and Category Routes
app.use('/api/pdfs', pdfRoutes);
app.use('/api/pdf-categories', pdfCategoryRoutes);
app.use('/api/admin/pdfs', pdfRoutes);
app.use('/api/admin/pdf-categories', pdfCategoryRoutes);

app.use('/api/admin/auth', adminRoutes);
app.use('/api/admin/users', adminUserRoutes);
app.use('/api/admin/dashboard', adminDashboardRoutes);
app.use('/api/admin/enrollments', adminEnrollmentRoutes);
app.use('/api/admin/payments', adminPaymentRoutes);
app.use('/api/admin/tests', adminTestRoutes);
app.use('/api/admin/questions', adminQuestionRoutes);
app.use('/api/admin/hierarchy', adminSubjectHierarchyRoutes);
app.use('/api/admin/results', adminResultRoutes);
app.use('/api/admin/leaderboards', adminLeaderboardRoutes);
app.use('/api/admin/categories', adminCategoryRoutes);
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
app.get('/', (req, res) => {
  res.json({ message: 'Welcome to the Node.js API!' });
});

app.get('/db-status', async (req, res) => {
  try {
    const connection = await createDbConnection();
    await connection.ping();
    await connection.end();
    res.json({ status: 'Connected to the database successfully!' });
  } catch (error) {
    res.status(500).json({ status: 'Database connection failed', error: error.message });
  }
});

module.exports = app;
