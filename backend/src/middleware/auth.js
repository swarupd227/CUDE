const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'cude-jwt-dev-secret-change-in-production';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '24h';

// Generate JWT token
function generateToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, role: user.system_role, display_name: user.display_name },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
}

// Verify JWT token
function verifyToken(token) {
  return jwt.verify(token, JWT_SECRET);
}

// Express middleware — require authentication
function requireAuth(req, res, next) {
  // Skip auth in demo mode (USE_DATABASE=false)
  if (process.env.USE_DATABASE === 'false') {
    req.user = { id: 'demo-user', email: 'demo@cude.local', role: 'ADMIN', display_name: 'Demo User' };
    return next();
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required. Please log in.' });
  }

  try {
    const token = authHeader.split(' ')[1];
    const decoded = verifyToken(token);
    req.user = decoded;
    next();
  } catch (e) {
    if (e.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Session expired. Please log in again.' });
    }
    return res.status(401).json({ error: 'Invalid authentication token.' });
  }
}

// Express middleware — require specific roles
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Authentication required.' });
    // ADMIN always passes
    if (req.user.role === 'ADMIN') return next();
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: `Insufficient permissions. Required role: ${roles.join(' or ')}` });
    }
    next();
  };
}

module.exports = { generateToken, verifyToken, requireAuth, requireRole, JWT_SECRET };
