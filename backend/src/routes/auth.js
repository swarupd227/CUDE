const express = require('express');
const router = express.Router();

// Lazy-load dependencies — they may not be installed yet
let userRepo, authMiddleware;
try {
  userRepo = require('../db/repositories/userRepo');
  authMiddleware = require('../middleware/auth');
} catch (e) {
  // pg or bcryptjs not installed — all auth endpoints return helpful error
  const fallbackRouter = express.Router();
  fallbackRouter.all('*', (req, res) => {
    res.status(503).json({ error: 'Authentication requires database packages. Run: cd backend && npm install' });
  });
  module.exports = fallbackRouter;
  return;
}

const { generateToken, requireAuth } = authMiddleware;

// ── Register ─────────────────────────────────────────────────────────────────
router.post('/register', async (req, res) => {
  try {
    const { email, password, display_name } = req.body;
    if (!email || !password || !display_name) {
      return res.status(400).json({ error: 'Email, password, and display_name are required.' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters.' });
    }

    // Check if user already exists
    const existing = await userRepo.findByEmail(email);
    if (existing) {
      return res.status(409).json({ error: 'An account with this email already exists.' });
    }

    // First user auto-gets ADMIN role (bootstrap)
    const userCount = await userRepo.count();
    const role = userCount === 0 ? 'ADMIN' : 'USER';

    const user = await userRepo.create(email, password, display_name, role);
    const token = generateToken(user);

    res.status(201).json({
      user: { id: user.id, email: user.email, display_name: user.display_name, role: user.system_role },
      token,
      message: userCount === 0 ? 'Admin account created. You are the platform administrator.' : 'Account created successfully.',
    });
  } catch (e) {
    console.error('Register error:', e.message);
    res.status(500).json({ error: 'Registration failed. Please try again.' });
  }
});

// ── Login ────────────────────────────────────────────────────────────────────
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    const user = await userRepo.findByEmail(email);
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const valid = await userRepo.verifyPassword(user, password);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    await userRepo.updateLastLogin(user.id);
    const token = generateToken(user);

    res.json({
      user: { id: user.id, email: user.email, display_name: user.display_name, role: user.system_role },
      token,
    });
  } catch (e) {
    console.error('Login error:', e.message);
    res.status(500).json({ error: 'Login failed. Please try again.' });
  }
});

// ── Me (current user profile) ────────────────────────────────────────────────
router.get('/me', requireAuth, async (req, res) => {
  try {
    const user = await userRepo.findById(req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found.' });
    res.json({ user });
  } catch (e) {
    res.status(500).json({ error: 'Failed to fetch profile.' });
  }
});

// ── List users (admin only) ──────────────────────────────────────────────────
router.get('/users', requireAuth, async (req, res) => {
  try {
    const users = await userRepo.findAll();
    res.json({ users });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
