const { query } = require('../pool');
const bcrypt = require('bcryptjs');

async function create(email, password, displayName, systemRole = 'USER') {
  const passwordHash = await bcrypt.hash(password, 12);
  const result = await query(
    `INSERT INTO users (email, password_hash, display_name, system_role)
     VALUES ($1, $2, $3, $4)
     RETURNING id, email, display_name, system_role, created_at`,
    [email.toLowerCase(), passwordHash, displayName, systemRole]
  );
  return result.rows[0];
}

async function findByEmail(email) {
  const result = await query('SELECT * FROM users WHERE email = $1 AND is_active = true', [email.toLowerCase()]);
  return result.rows[0] || null;
}

async function findById(id) {
  const result = await query(
    'SELECT id, email, display_name, system_role, is_active, last_login_at, created_at FROM users WHERE id = $1',
    [id]
  );
  return result.rows[0] || null;
}

async function verifyPassword(user, password) {
  return bcrypt.compare(password, user.password_hash);
}

async function updateLastLogin(id) {
  await query('UPDATE users SET last_login_at = now() WHERE id = $1', [id]);
}

async function count() {
  const result = await query('SELECT COUNT(*) as count FROM users');
  return parseInt(result.rows[0].count);
}

async function findAll() {
  const result = await query(
    'SELECT id, email, display_name, system_role, is_active, last_login_at, created_at FROM users ORDER BY created_at'
  );
  return result.rows;
}

module.exports = { create, findByEmail, findById, verifyPassword, updateLastLogin, count, findAll };
