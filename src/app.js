const express = require('express');
const cors = require('cors');
const { createDbConnection } = require('./config/db');
const authRoutes = require('./routes/auth');
const adminRoutes = require('./routes/adminRoutes');
const adminUserRoutes = require('./routes/adminUserRoutes');
const adminDashboardRoutes = require('./routes/adminDashboardRoutes');
const adminEnrollmentRoutes = require('./routes/adminEnrollmentRoutes');
const adminPaymentRoutes = require('./routes/adminPaymentRoutes');
const adminTestSeriesRoutes = require('./routes/adminTestSeriesRoutes');
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
const uploadRoutes = require('./routes/uploadRoutes');
const swaggerUi = require('swagger-ui-express');
const swaggerSpec = require('./config/swagger');

const app = express();

app.use(cors({
  origin: true,
  credentials: true,
}));
app.use(express.json());

app.use('/api/auth', authRoutes);
app.use('/api/exams', examRoutes);
app.use('/api/subjects', subjectRoutes);
app.use('/api/tests', testRoutes);
app.use('/api/attempts', attemptRoutes);
app.use('/api/upload', uploadRoutes);

app.use('/api/admin/auth', adminRoutes);
app.use('/api/admin/users', adminUserRoutes);
app.use('/api/admin/dashboard', adminDashboardRoutes);
app.use('/api/admin/enrollments', adminEnrollmentRoutes);
app.use('/api/admin/payments', adminPaymentRoutes);
app.use('/api/admin/test-series', adminTestSeriesRoutes);
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
