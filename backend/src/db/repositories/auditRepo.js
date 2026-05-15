const crypto = require('crypto');
const { query } = require('../pool');

const HMAC_SECRET = process.env.AUDIT_HMAC_SECRET || process.env.JWT_SECRET || 'cude-audit-hmac-default';

// Last HMAC for chaining
let lastHmac = null;

function computeHmac(data) {
  const payload = `${lastHmac || 'genesis'}|${data.created_at}|${data.action}|${data.entity_id}|${JSON.stringify(data.after_state || {})}`;
  return crypto.createHmac('sha256', HMAC_SECRET).update(payload).digest('hex');
}

async function write(entry) {
  const hmac = computeHmac(entry);
  lastHmac = hmac;

  const result = await query(
    `INSERT INTO audit_log (project_id, actor_type, actor_id, action, entity_type, entity_id,
      before_state, after_state, ip_address, user_agent, metadata, hmac_signature)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
    [
      entry.project_id || null, entry.actor_type || 'SYSTEM', entry.actor_id || 'system',
      entry.action, entry.entity_type, entry.entity_id,
      entry.before_state ? JSON.stringify(entry.before_state) : null,
      entry.after_state ? JSON.stringify(entry.after_state) : null,
      entry.ip_address || null, entry.user_agent || null,
      JSON.stringify(entry.metadata || {}), hmac
    ]
  );
  return result.rows[0];
}

async function findByProject(projectId, filters = {}, page = 1, limit = 50) {
  const conditions = [];
  const params = [];
  let idx = 1;

  // project_id is optional — if not provided, return all audit entries
  if (projectId) { conditions.push(`project_id = $${idx++}`); params.push(projectId); }
  if (filters.action) { conditions.push(`action = $${idx++}`); params.push(filters.action); }
  if (filters.actor_type) { conditions.push(`actor_type = $${idx++}`); params.push(filters.actor_type); }
  if (filters.from) { conditions.push(`created_at >= $${idx++}`); params.push(filters.from); }
  if (filters.to) { conditions.push(`created_at <= $${idx++}`); params.push(filters.to); }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const countResult = await query(`SELECT COUNT(*) as total FROM audit_log ${where}`, params);
  const total = parseInt(countResult.rows[0].total);

  const result = await query(
    `SELECT * FROM audit_log ${where} ORDER BY created_at DESC LIMIT $${idx} OFFSET $${idx + 1}`,
    [...params, limit, (page - 1) * limit]
  );

  return { entries: result.rows, total, page, pages: Math.ceil(total / limit) };
}

module.exports = { write, findByProject };
