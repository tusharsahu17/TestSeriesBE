const { createDbConnection } = require('../config/db');

async function getDashboardMetrics() {
  let connection;
  try {
    connection = await createDbConnection();

    // 1. Total registered users
    const [[{ totalUsers }]] = await connection.query('SELECT COUNT(*) as totalUsers FROM users');

    // 2. Total exams / test series
    const [[{ totalExams }]] = await connection.query('SELECT COUNT(*) as totalExams FROM exams');

    // 3. Total tests
    const [[{ totalTests }]] = await connection.query('SELECT COUNT(*) as totalTests FROM tests');

    // 4. Total questions
    const [[{ totalQuestions }]] = await connection.query('SELECT COUNT(*) as totalQuestions FROM questions');

    // 5. Tests attempted today
    const [[{ attemptsToday }]] = await connection.query(`
      SELECT COUNT(*) as attemptsToday 
      FROM test_attempts 
      WHERE DATE(started_at) = CURDATE()
    `);

    // 6. Average score (for completed attempts)
    const [[{ averageScore }]] = await connection.query(`
      SELECT AVG(percentage) as averageScore 
      FROM test_attempts 
      WHERE status = 'COMPLETED'
    `);

    // 7. Recent registrations (last 5)
    const [recentRegistrations] = await connection.query(`
      SELECT id, username, created_at 
      FROM users 
      ORDER BY id DESC 
      LIMIT 5
    `);

    // 8. Recent test attempts
    const [recentAttempts] = await connection.query(`
      SELECT a.id, a.user_id, a.test_id, a.status, a.percentage, a.started_at, u.username, t.name as test_name
      FROM test_attempts a
      LEFT JOIN users u ON a.user_id = u.id
      LEFT JOIN tests t ON a.test_id = t.id
      ORDER BY a.started_at DESC 
      LIMIT 5
    `);

    // --- Mock Data for Missing Schema ---
    
    // Active users (Mock)
    const activeUsers = Math.floor(totalUsers * 0.4); 

    // Revenue / Subscriptions (Mock)
    const revenue = 12500; 
    const pendingPayments = 1200;

    // Top-performing test series (Mock)
    const topPerformingTestSeries = [
      { id: 1, name: 'SSC CGL Mock Series', avgScore: 82.5, attempts: 154 },
      { id: 2, name: 'UPSC Prelims', avgScore: 65.2, attempts: 98 },
      { id: 3, name: 'Banking PO', avgScore: 71.8, attempts: 210 }
    ];

    // User activity graph (Mock - last 7 days)
    const userActivityGraph = [
      { day: 'Mon', activeUsers: 120 },
      { day: 'Tue', activeUsers: 150 },
      { day: 'Wed', activeUsers: 180 },
      { day: 'Thu', activeUsers: 170 },
      { day: 'Fri', activeUsers: 210 },
      { day: 'Sat', activeUsers: 300 },
      { day: 'Sun', activeUsers: 320 }
    ];

    // Revenue graph data (Mock - last 6 months)
    const revenueGraphData = [
      { month: 'Jan', revenue: 4000 },
      { month: 'Feb', revenue: 4500 },
      { month: 'Mar', revenue: 5200 },
      { month: 'Apr', revenue: 4800 },
      { month: 'May', revenue: 6100 },
      { month: 'Jun', revenue: 7500 }
    ];

    return {
      overview: {
        totalRegisteredUsers: totalUsers || 0,
        activeUsers,
        totalTestSeries: totalExams || 0,
        totalTests: totalTests || 0,
        totalQuestions: totalQuestions || 0,
        testsAttemptedToday: attemptsToday || 0,
        revenue,
        pendingPayments,
        averageScore: averageScore ? parseFloat(averageScore).toFixed(2) : 0
      },
      recentRegistrations,
      recentTestAttempts: recentAttempts,
      topPerformingTestSeries,
      graphs: {
        userActivity: userActivityGraph,
        revenue: revenueGraphData
      }
    };
  } finally {
    if (connection) await connection.end();
  }
}

module.exports = {
  getDashboardMetrics
};
