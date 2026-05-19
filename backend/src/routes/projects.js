const express = require('express');
const router = express.Router();

let projectRepo, userRepo, auditRepo;
try {
  projectRepo = require('../db/repositories/projectRepo');
  userRepo = require('../db/repositories/userRepo');
  auditRepo = require('../db/repositories/auditRepo');
} catch (e) {
  // DB packages not installed — return helpful error
  const fallback = express.Router();
  fallback.all('*', (req, res) => res.status(503).json({ error: 'Database not available. Run: cd backend && npm install' }));
  module.exports = fallback;
  return;
}

const { requireAuth, requireRole } = require('../middleware/auth');

// ── List projects (for current user) ─────────────────────────────────────────
router.get('/', requireAuth, async (req, res) => {
  try {
    const isAdmin = req.user.role === 'ADMIN';
    const projects = isAdmin
      ? await projectRepo.findAll()
      : await projectRepo.findAll(req.user.id);
    res.json({ projects });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Get single project ───────────────────────────────────────────────────────
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const project = await projectRepo.findById(req.params.id);
    if (!project) return res.status(404).json({ error: 'Project not found' });
    const members = await projectRepo.getMembers(project.id);
    res.json({ project, members });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Create project ───────────────────────────────────────────────────────────
router.post('/', requireAuth, async (req, res) => {
  try {
    const { code, name, description, sensitivity_ceiling, industry_template } = req.body;
    if (!code || !name) return res.status(400).json({ error: 'Project code and name are required' });

    // Check code uniqueness
    const existing = await projectRepo.findByCode(code);
    if (existing) return res.status(409).json({ error: `Project code "${code}" already exists` });

    const project = await projectRepo.create(
      code, name, description, req.user.id,
      sensitivity_ceiling || 'TRADE_SECRET',
      industry_template || null
    );

    // Auto-apply ontology template for the selected industry — so the project
    // starts with a meaningful schema instead of empty/defaults.
    let templateApplied = null;
    if (industry_template) {
      try {
        const { applyTemplateToOntology } = require('../services/ontologyTemplateService');
        templateApplied = await applyTemplateToOntology(industry_template);
      } catch (e) {
        console.log('⚠️  Ontology template auto-apply failed:', e.message);
      }
    }

    // Audit
    try {
      await auditRepo.write({
        project_id: project.id, actor_type: 'USER', actor_id: req.user.email,
        action: 'project.created', entity_type: 'project', entity_id: project.id,
        after_state: { code, name, sensitivity_ceiling: sensitivity_ceiling || 'TRADE_SECRET', industry_template, template_applied: templateApplied },
      });
    } catch (_) {}

    res.status(201).json({ project, template_applied: templateApplied });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Delete project ───────────────────────────────────────────────────────────
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const { query: dbQuery } = require('../db/pool');
    const project = await projectRepo.findById(req.params.id);
    if (!project) return res.status(404).json({ error: 'Project not found' });

    // Delete in order — clear all FK references before deleting project
    await dbQuery('DELETE FROM event_log WHERE project_id = $1', [req.params.id]);
    await dbQuery('DELETE FROM audit_log WHERE project_id = $1', [req.params.id]);
    await dbQuery('DELETE FROM asset_relationships WHERE project_id = $1', [req.params.id]);
    await dbQuery('DELETE FROM approval_queue WHERE project_id = $1', [req.params.id]);
    await dbQuery('DELETE FROM classification_decisions WHERE asset_id IN (SELECT id FROM assets WHERE project_id = $1)', [req.params.id]);
    await dbQuery('DELETE FROM assets WHERE project_id = $1', [req.params.id]);
    await dbQuery('DELETE FROM connectors WHERE project_id = $1', [req.params.id]);
    await dbQuery('DELETE FROM policy_rules WHERE project_id = $1', [req.params.id]);
    await dbQuery('DELETE FROM agent_runs WHERE project_id = $1', [req.params.id]);
    await dbQuery('DELETE FROM project_members WHERE project_id = $1', [req.params.id]);
    await dbQuery('DELETE FROM projects WHERE id = $1', [req.params.id]);

    try {
      await auditRepo.write({
        actor_type: 'USER', actor_id: req.user.email,
        action: 'project.deleted', entity_type: 'project', entity_id: req.params.id,
        after_state: { name: project.name, code: project.code },
      });
    } catch (_) {}

    res.json({ success: true, deleted: project.code });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Update project ───────────────────────────────────────────────────────────
router.patch('/:id', requireAuth, async (req, res) => {
  try {
    const before = await projectRepo.findById(req.params.id);
    if (!before) return res.status(404).json({ error: 'Project not found' });

    const project = await projectRepo.update(req.params.id, req.body);

    try {
      await auditRepo.write({
        project_id: project.id, actor_type: 'USER', actor_id: req.user.email,
        action: 'project.updated', entity_type: 'project', entity_id: project.id,
        before_state: { name: before.name, status: before.status },
        after_state: req.body,
      });
    } catch (_) {}

    res.json({ project });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Archive project ──────────────────────────────────────────────────────────
router.post('/:id/archive', requireAuth, async (req, res) => {
  try {
    const project = await projectRepo.update(req.params.id, { status: 'ARCHIVED' });
    if (!project) return res.status(404).json({ error: 'Project not found' });

    try {
      await auditRepo.write({
        project_id: project.id, actor_type: 'USER', actor_id: req.user.email,
        action: 'project.archived', entity_type: 'project', entity_id: project.id,
        after_state: { status: 'ARCHIVED' },
      });
    } catch (_) {}

    res.json({ project, message: 'Project archived' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Clear all assets from project ────────────────────────────────────────────
router.delete('/:id/assets/clear', requireAuth, async (req, res) => {
  try {
    const { query: dbQuery } = require('../db/pool');

    // Count before deleting
    const countResult = await dbQuery('SELECT COUNT(*) as count FROM assets WHERE project_id = $1', [req.params.id]);
    const assetCount = parseInt(countResult.rows[0].count);

    // Get asset IDs before deleting (needed for Neo4j cleanup)
    const assetIdsResult = await dbQuery('SELECT id FROM assets WHERE project_id = $1', [req.params.id]);
    const assetIds = assetIdsResult.rows.map(r => r.id);

    // Delete in order — approval queue items first, then assets
    await dbQuery('DELETE FROM approval_queue WHERE asset_id IN (SELECT id FROM assets WHERE project_id = $1)', [req.params.id]);
    await dbQuery('DELETE FROM classification_decisions WHERE asset_id IN (SELECT id FROM assets WHERE project_id = $1)', [req.params.id]);
    await dbQuery('DELETE FROM asset_relationships WHERE source_asset_id IN (SELECT id FROM assets WHERE project_id = $1) OR target_asset_id IN (SELECT id FROM assets WHERE project_id = $1)', [req.params.id]);
    await dbQuery('DELETE FROM assets WHERE project_id = $1', [req.params.id]);

    // Clean Neo4j — remove asset nodes and all their relationships
    try {
      const graphService = require('../services/graphService');
      if (graphService.isAvailable()) {
        for (const id of assetIds) {
          await graphService.deleteAssetNode(id).catch(() => {});
        }
      }
    } catch (_) {}

    // Also clear from in-memory catalog + approval queue
    try {
      const { catalog, approvalQueue } = require('../data/seedData');
      // Collect asset IDs being removed (for queue cleanup)
      const removedAssetIds = new Set();
      // Remove assets matching this project
      for (let i = catalog.length - 1; i >= 0; i--) {
        if (catalog[i].project_id === req.params.id || catalog[i].project_code === req.params.id) {
          removedAssetIds.add(catalog[i].id);
          catalog.splice(i, 1);
        }
      }
      // Remove queue items — match by project_id OR by asset_id (for items without project_id)
      for (let i = approvalQueue.length - 1; i >= 0; i--) {
        if (approvalQueue[i].project_id === req.params.id || removedAssetIds.has(approvalQueue[i].asset_id)) {
          approvalQueue.splice(i, 1);
        }
      }
    } catch (_) {}

    // Audit
    try {
      await auditRepo.write({
        project_id: req.params.id, actor_type: 'USER', actor_id: req.user.email,
        action: 'project.assets_cleared', entity_type: 'project', entity_id: req.params.id,
        after_state: { assets_deleted: assetCount },
      });
    } catch (_) {}

    res.json({ success: true, assets_deleted: assetCount });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Add member ───────────────────────────────────────────────────────────────
router.post('/:id/members', requireAuth, async (req, res) => {
  try {
    const { email, role } = req.body;
    if (!email || !role) return res.status(400).json({ error: 'Email and role are required' });
    if (!['OWNER', 'STEWARD', 'AUDITOR', 'VIEWER'].includes(role)) {
      return res.status(400).json({ error: 'Invalid role. Must be OWNER, STEWARD, AUDITOR, or VIEWER' });
    }

    const user = await userRepo.findByEmail(email);
    if (!user) return res.status(404).json({ error: `No user found with email: ${email}` });

    const member = await projectRepo.addMember(req.params.id, user.id, role, req.user.id);

    try {
      await auditRepo.write({
        project_id: req.params.id, actor_type: 'USER', actor_id: req.user.email,
        action: 'member.added', entity_type: 'project_member', entity_id: user.id,
        after_state: { email, role },
      });
    } catch (_) {}

    res.json({ member, user: { id: user.id, email: user.email, display_name: user.display_name } });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Remove member ────────────────────────────────────────────────────────────
router.delete('/:id/members/:userId', requireAuth, async (req, res) => {
  try {
    await projectRepo.removeMember(req.params.id, req.params.userId);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Get project members ──────────────────────────────────────────────────────
router.get('/:id/members', requireAuth, async (req, res) => {
  try {
    const members = await projectRepo.getMembers(req.params.id);
    res.json({ members });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Project Connectors ───────────────────────────────────────────────────────
router.get('/:id/connectors', requireAuth, async (req, res) => {
  try {
    const { query } = require('../db/pool');
    const result = await query('SELECT * FROM connectors WHERE project_id = $1 ORDER BY created_at', [req.params.id]);
    res.json({ connectors: result.rows });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/:id/connectors', requireAuth, async (req, res) => {
  try {
    const { query: dbQuery } = require('../db/pool');
    let { type, name, category, icon, description, auth_type, supported_domains, config, setup_steps, template_id, display_name } = req.body;

    // If creating from a template, pre-fill from template
    if (template_id) {
      try {
        const tpl = await dbQuery('SELECT * FROM connector_templates WHERE id = $1', [template_id]);
        if (tpl.rows[0]) {
          const t = tpl.rows[0];
          type = type || t.type;
          name = display_name || name || t.name;
          category = category || t.category;
          icon = icon || t.icon;
          description = description || t.description;
          auth_type = auth_type || t.auth_type;
          supported_domains = supported_domains || t.supported_domains;
          config = { ...(typeof t.config === 'string' ? JSON.parse(t.config) : t.config), ...config };
          setup_steps = setup_steps || t.setup_steps;
        }
      } catch (_) {}
    }

    if (!type || !name) return res.status(400).json({ error: 'Connector type and name are required' });

    const id = `${req.params.id.substring(0,8)}_${type}_${Date.now()}`;
    const status = config && Object.values(config).some(v => v && v !== '') ? 'CONFIGURED' : 'UNCONFIGURED';
    const result = await dbQuery(
      `INSERT INTO connectors (id, project_id, type, name, category, icon, description, auth_type, supported_domains, config, setup_steps, status, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
      [id, req.params.id, type, name, category || 'Custom', icon || '🔌', description || '',
       auth_type || 'NONE', supported_domains || [], JSON.stringify(config || {}),
       setup_steps || [], status, req.user.id === 'demo-user' ? null : req.user.id]
    );

    try {
      await auditRepo.write({
        project_id: req.params.id, actor_type: 'USER', actor_id: req.user.email,
        action: 'connector.created', entity_type: 'connector', entity_id: id,
        after_state: { type, name, category },
      });
    } catch (_) {}

    res.status(201).json({ connector: result.rows[0] });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.patch('/:projectId/connectors/:connectorId', requireAuth, async (req, res) => {
  try {
    const { query: dbQuery } = require('../db/pool');
    const { config, status } = req.body;
    const updates = [];
    const params = [req.body.connectorId || req.params.connectorId];
    let idx = 2;

    if (config) { updates.push(`config = $${idx++}`); params.push(JSON.stringify(config)); }
    if (status) { updates.push(`status = $${idx++}`); params.push(status); }
    if (!updates.length) return res.status(400).json({ error: 'Nothing to update' });

    updates.push(`updated_at = now()`);
    const result = await dbQuery(
      `UPDATE connectors SET ${updates.join(', ')} WHERE id = $1 RETURNING *`, params
    );
    res.json({ connector: result.rows[0] });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.delete('/:projectId/connectors/:connectorId', requireAuth, async (req, res) => {
  try {
    const { query: dbQuery } = require('../db/pool');
    await dbQuery('DELETE FROM connectors WHERE id = $1 AND project_id = $2', [req.params.connectorId, req.params.projectId]);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Project Assets (scoped) ──────────────────────────────────────────────────
router.get('/:id/assets', requireAuth, async (req, res) => {
  try {
    const { query: dbQuery } = require('../db/pool');
    const { domain, classification, zone, search, page = 1, limit = 20 } = req.query;
    const conditions = ['project_id = $1'];
    const params = [req.params.id];
    let idx = 2;

    if (domain) { conditions.push(`content_domain = $${idx++}`); params.push(domain); }
    if (classification) { conditions.push(`data_classification = $${idx++}`); params.push(classification); }
    if (zone) { conditions.push(`classification_zone = $${idx++}`); params.push(zone); }
    if (search) { conditions.push(`file_name ILIKE $${idx++}`); params.push(`%${search}%`); }

    const where = conditions.join(' AND ');
    const countResult = await dbQuery(`SELECT COUNT(*) as total FROM assets WHERE ${where}`, params);
    const total = parseInt(countResult.rows[0].total);
    const offset = (parseInt(page) - 1) * parseInt(limit);

    const result = await dbQuery(
      `SELECT * FROM assets WHERE ${where} ORDER BY created_at DESC LIMIT $${idx} OFFSET $${idx+1}`,
      [...params, parseInt(limit), offset]
    );

    res.json({ assets: result.rows, total, page: parseInt(page), pages: Math.ceil(total / parseInt(limit)) });
  } catch (e) {
    // Fallback to in-memory catalog filtered by project
    const { catalog } = require('../data/seedData');
    const filtered = catalog.filter(a => a.project_id === req.params.id || a.project_code === req.params.id);
    res.json({ assets: filtered, total: filtered.length, page: 1, pages: 1 });
  }
});

// ── Project Policy Rules ─────────────────────────────────────────────────────
router.get('/:id/policies', requireAuth, async (req, res) => {
  try {
    const { query: dbQuery } = require('../db/pool');
    // Get project-specific rules + global rules (project_id IS NULL)
    const result = await dbQuery(
      'SELECT * FROM policy_rules WHERE project_id = $1 OR project_id IS NULL ORDER BY priority ASC, created_at',
      [req.params.id]
    );
    res.json({ rules: result.rows });
  } catch (e) {
    // Fallback to in-memory rules
    const { RULES } = require('../services/policyEngine');
    res.json({ rules: RULES.map(r => ({ ...r, rule_code: r.id, recommended_tier: r.tier, project_id: null })) });
  }
});

router.post('/:id/policies', requireAuth, async (req, res) => {
  try {
    const { query: dbQuery } = require('../db/pool');
    const { rule_code, description, signals, recommended_tier, priority, enabled } = req.body;
    if (!rule_code || !description || !signals?.length || !recommended_tier) {
      return res.status(400).json({ error: 'rule_code, description, signals (array), and recommended_tier are required' });
    }
    const result = await dbQuery(
      `INSERT INTO policy_rules (project_id, rule_code, description, signals, recommended_tier, priority, enabled, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (project_id, rule_code) DO UPDATE SET description=$3, signals=$4, recommended_tier=$5, priority=$6, enabled=$7, updated_at=now()
       RETURNING *`,
      [req.params.id, rule_code, description, signals, recommended_tier, priority || 50, enabled !== false,
       req.user?.id !== 'demo-user' ? req.user?.id : null]
    );
    try {
      await auditRepo.write({ project_id: req.params.id, actor_type: 'USER', actor_id: req.user.email, action: 'policy.modified', entity_type: 'policy_rule', entity_id: rule_code, after_state: { rule_code, recommended_tier, signals } });
    } catch (_) {}
    res.status(201).json({ rule: result.rows[0] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.patch('/:projectId/policies/:ruleId', requireAuth, async (req, res) => {
  try {
    const { query: dbQuery } = require('../db/pool');
    const { description, signals, recommended_tier, priority, enabled } = req.body;
    const updates = []; const params = [req.params.ruleId]; let idx = 2;
    if (description) { updates.push(`description=$${idx++}`); params.push(description); }
    if (signals) { updates.push(`signals=$${idx++}`); params.push(signals); }
    if (recommended_tier) { updates.push(`recommended_tier=$${idx++}`); params.push(recommended_tier); }
    if (priority !== undefined) { updates.push(`priority=$${idx++}`); params.push(priority); }
    if (enabled !== undefined) { updates.push(`enabled=$${idx++}`); params.push(enabled); }
    if (!updates.length) return res.status(400).json({ error: 'Nothing to update' });
    updates.push('updated_at=now()');
    const result = await dbQuery(`UPDATE policy_rules SET ${updates.join(',')} WHERE id=$1 RETURNING *`, params);
    res.json({ rule: result.rows[0] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/:projectId/policies/:ruleId', requireAuth, async (req, res) => {
  try {
    const { query: dbQuery } = require('../db/pool');
    // Only allow deleting project-specific rules, not global ones
    const check = await dbQuery('SELECT project_id FROM policy_rules WHERE id = $1', [req.params.ruleId]);
    if (!check.rows[0]) return res.status(404).json({ error: 'Rule not found' });
    // Global rules can only be deleted by Admin/Owner via the global /api/policies/:id endpoint
    if (!check.rows[0].project_id) return res.status(400).json({ error: 'Global rules should be managed from Settings. Use the global policy endpoint or disable it instead.' });
    await dbQuery('DELETE FROM policy_rules WHERE id = $1', [req.params.ruleId]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Project Stats ────────────────────────────────────────────────────────────
router.get('/:id/stats', requireAuth, async (req, res) => {
  try {
    const assetRepo = require('../db/repositories/assetRepo');
    const stats = await assetRepo.getStats(req.params.id);
    res.json(stats);
  } catch (e) {
    res.json({ total: 0, enriched: 0, domain_counts: {}, class_counts: {}, zone_counts: {} });
  }
});

module.exports = router;
