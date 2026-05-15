const { query, transaction } = require('../pool');

async function create(code, name, description, ownerId, sensitivityCeiling = 'TRADE_SECRET') {
  return transaction(async (client) => {
    const result = await client.query(
      `INSERT INTO projects (code, name, description, owner_id, sensitivity_ceiling)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [code, name, description, ownerId, sensitivityCeiling]
    );
    const project = result.rows[0];
    // Auto-add owner as project member
    await client.query(
      `INSERT INTO project_members (project_id, user_id, role, invited_by)
       VALUES ($1, $2, 'OWNER', $2)`,
      [project.id, ownerId]
    );
    return project;
  });
}

async function findById(id) {
  const result = await query('SELECT * FROM projects WHERE id = $1', [id]);
  return result.rows[0] || null;
}

async function findByCode(code) {
  const result = await query('SELECT * FROM projects WHERE code = $1', [code]);
  return result.rows[0] || null;
}

async function findAll(userId = null) {
  if (userId) {
    const result = await query(
      `SELECT p.*, pm.role as member_role FROM projects p
       JOIN project_members pm ON p.id = pm.project_id
       WHERE pm.user_id = $1 AND p.status = 'ACTIVE'
       ORDER BY p.created_at DESC`,
      [userId]
    );
    return result.rows;
  }
  const result = await query("SELECT * FROM projects WHERE status = 'ACTIVE' ORDER BY created_at DESC");
  return result.rows;
}

async function update(id, patch) {
  const fields = Object.keys(patch).filter(k => ['name','description','sensitivity_ceiling','status','settings'].includes(k));
  if (!fields.length) return findById(id);
  const sets = fields.map((f, i) => `${f} = $${i + 2}`).join(', ');
  const values = fields.map(f => typeof patch[f] === 'object' ? JSON.stringify(patch[f]) : patch[f]);
  const result = await query(
    `UPDATE projects SET ${sets}, updated_at = now() WHERE id = $1 RETURNING *`,
    [id, ...values]
  );
  return result.rows[0];
}

async function addMember(projectId, userId, role, invitedBy) {
  const result = await query(
    `INSERT INTO project_members (project_id, user_id, role, invited_by)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (project_id, user_id) DO UPDATE SET role = $3
     RETURNING *`,
    [projectId, userId, role, invitedBy]
  );
  return result.rows[0];
}

async function getMembers(projectId) {
  const result = await query(
    `SELECT pm.*, u.email, u.display_name FROM project_members pm
     JOIN users u ON pm.user_id = u.id
     WHERE pm.project_id = $1
     ORDER BY pm.created_at`,
    [projectId]
  );
  return result.rows;
}

async function removeMember(projectId, userId) {
  await query('DELETE FROM project_members WHERE project_id = $1 AND user_id = $2', [projectId, userId]);
}

async function getUserRole(projectId, userId) {
  const result = await query(
    'SELECT role FROM project_members WHERE project_id = $1 AND user_id = $2',
    [projectId, userId]
  );
  return result.rows[0]?.role || null;
}

module.exports = { create, findById, findByCode, findAll, update, addMember, getMembers, removeMember, getUserRole };
