const express = require('express');
const cors = require('cors');
const { createDbConnection } = require('./config/db');
const authRoutes = require('./routes/auth');
const examRoutes = require('./routes/examRoutes');
const subjectRoutes = require('./routes/subjectRoutes');
const testRoutes = require('./routes/testRoutes');
const attemptRoutes = require('./routes/attemptRoutes');
const uploadRoutes = require('./routes/uploadRoutes');
const swaggerUi = require('swagger-ui-express');
const swaggerSpec = require('./config/swagger');

const app = express();

app.use(cors());
app.use(express.json());

app.use('/api/auth', authRoutes);
app.use('/api/exams', examRoutes);
app.use('/api/subjects', subjectRoutes);
app.use('/api/tests', testRoutes);
app.use('/api/attempts', attemptRoutes);
app.use('/api/upload', uploadRoutes);
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
