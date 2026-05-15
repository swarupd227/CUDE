const express = require('express');
const router = express.Router();

let dbAvailable = false;
try { require('pg'); dbAvailable = true; } catch (_) {}

// ── List all templates ───────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  if (!dbAvailable) return res.json({ templates: [] });
  try {
    const { query } = require('../db/pool');
    const result = await query('SELECT * FROM connector_templates ORDER BY is_builtin DESC, created_at DESC');
    res.json({ templates: result.rows });
  } catch (e) {
    res.json({ templates: [], error: e.message });
  }
});

// ── Get single template ──────────────────────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const { query } = require('../db/pool');
    const result = await query('SELECT * FROM connector_templates WHERE id = $1', [req.params.id]);
    if (!result.rows[0]) return res.status(404).json({ error: 'Template not found' });
    res.json({ template: result.rows[0] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Create template ──────────────────────────────────────────────────────────
router.post('/', async (req, res) => {
  try {
    const { query } = require('../db/pool');
    const { type, name, category, icon, description, config, auth_type, supported_domains, setup_steps } = req.body;
    if (!type || !name) return res.status(400).json({ error: 'Type and name are required' });

    const result = await query(
      `INSERT INTO connector_templates (type, name, category, icon, description, config, auth_type, supported_domains, setup_steps, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
      [type, name, category || 'Custom', icon || '🔌', description || '',
       JSON.stringify(config || {}), auth_type || 'NONE', supported_domains || [],
       setup_steps || [], req.user?.id !== 'demo-user' ? req.user?.id : null]
    );
    res.status(201).json({ template: result.rows[0] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Update template ──────────────────────────────────────────────────────────
router.patch('/:id', async (req, res) => {
  try {
    const { query } = require('../db/pool');
    const { name, config, description } = req.body;
    const updates = [];
    const params = [req.params.id];
    let idx = 2;

    if (name) { updates.push(`name = $${idx++}`); params.push(name); }
    if (config) { updates.push(`config = $${idx++}`); params.push(JSON.stringify(config)); }
    if (description !== undefined) { updates.push(`description = $${idx++}`); params.push(description); }
    if (!updates.length) return res.status(400).json({ error: 'Nothing to update' });

    updates.push('updated_at = now()');
    const result = await query(
      `UPDATE connector_templates SET ${updates.join(', ')} WHERE id = $1 RETURNING *`, params
    );
    res.json({ template: result.rows[0] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Delete template ──────────────────────────────────────────────────────────
router.delete('/:id', async (req, res) => {
  try {
    const { query } = require('../db/pool');
    const check = await query('SELECT is_builtin FROM connector_templates WHERE id = $1', [req.params.id]);
    if (check.rows[0]?.is_builtin) return res.status(400).json({ error: 'Cannot delete built-in template' });
    await query('DELETE FROM connector_templates WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
