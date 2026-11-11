const jwt = require('jsonwebtoken');
const { createDbConnection } = require('../config/db');

function normalizeJwtUser(decoded) {
  if (!decoded || typeof decoded !== 'object') return decoded;
  const resolvedUserId = decoded.userId ?? decoded.id ?? null;
  return {
    ...decoded,
    id: resolvedUserId,
    userId: resolvedUserId,
  };
}

const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (token == null) {
    return res.status(401).json({ success: false, message: 'Token required' });
  }

  jwt.verify(token, process.env.JWT_SECRET || 'secret_key', (err, user) => {
    if (err) {
      return res.status(403).json({ success: false, message: 'Invalid or expired token' });
    }
    req.user = normalizeJwtUser(user);
    next();
  });
};

const optionalAuthenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  if (!authHeader) return next();

  const token = authHeader.split(' ')[1];
  if (!token) {
    return res.status(401).json({ success: false, message: 'Token required' });
  }

  jwt.verify(token, process.env.JWT_SECRET || 'secret_key', (err, user) => {
    if (err) {
      return res.status(403).json({ success: false, message: 'Invalid or expired token' });
    }
    req.user = normalizeJwtUser(user);
    next();
  });
};

const authenticateStudent = (req, res, next) => {
  authenticateToken(req, res, async () => {
    const userId = Number(req.user?.userId || req.user?.id);
    if (!Number.isInteger(userId) || userId <= 0 || req.user?.role === 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Authenticated student account required',
      });
    }

    let connection;
    try {
      connection = await createDbConnection();
      const [rows] = await connection.query(
        'SELECT id, username, role, status, subscription_status, name, email FROM users WHERE id = ?',
        [userId]
      );
      if (rows.length === 0) {
        return res.status(401).json({ success: false, message: 'User account not found' });
      }
      const dbUser = rows[0];
      if (dbUser.role !== 'student') {
        return res.status(403).json({ success: false, message: 'Student access required' });
      }
      if (dbUser.status === 'blocked' || dbUser.status === 'inactive') {
        return res.status(403).json({
          success: false,
          message: `Account is ${dbUser.status}. Please contact support.`,
        });
      }

      req.user = {
        ...req.user,
        id: dbUser.id,
        userId: dbUser.id,
        username: dbUser.username,
        role: dbUser.role,
        status: dbUser.status,
        subscription_status: dbUser.subscription_status,
        name: dbUser.name,
        email: dbUser.email,
      };
      next();
    } catch (error) {
      console.error('Error authenticating student:', error);
      res.status(500).json({ success: false, message: 'Authentication verification failed' });
    } finally {
      if (connection) await connection.end();
    }
  });
};

module.exports = {
  authenticateToken,
  optionalAuthenticateToken,
  authenticateStudent,
};
