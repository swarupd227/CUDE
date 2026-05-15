const { query } = require('../pool');

async function create(asset) {
  const result = await query(
    `INSERT INTO assets (
      id, project_id, connector_id, file_name, full_path, content_domain, asset_format,
      file_size_bytes, content_hash, lifecycle_state, data_classification,
      classification_confidence, classification_zone, ip_ownership_tier,
      release_status, quality_score, ai_enriched, parser_used, parse_duration_ms,
      vault_path, source_connector, project_code, designer,
      export_control, pii_flag, retention_policy, domain_metadata,
      agent_processing_log, parse_steps, ai_analysis, ai_enrichment,
      cross_reference_hints, tags
    ) VALUES (
      $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,
      $24,$25,$26,$27,$28,$29,$30,$31,$32,$33
    ) RETURNING *`,
    [
      asset.id, asset.project_id || null, asset.connector_id || null,
      asset.file_name, asset.full_path || asset.vault_path, asset.content_domain, asset.asset_type || asset.asset_format,
      Math.round((asset.file_size_mb || 0) * 1024 * 1024), asset.content_hash || null,
      asset.lifecycle_state || 'DISCOVERED', asset.data_classification,
      asset.classification_confidence, asset.classification_zone, asset.ip_ownership_tier || 'FIRST_PARTY',
      asset.release_status || 'WIP', asset.quality_score, asset.ai_enriched || false,
      asset.parser_used, asset.parse_total_ms || asset.parse_duration_ms || null,
      asset.vault_path, asset.source_connector || null, asset.project_code, asset.designer,
      JSON.stringify(asset.export_control || {}), JSON.stringify(asset.pii_flag || {}),
      JSON.stringify(asset.retention_policy || {}), JSON.stringify(asset.domain_metadata || {}),
      JSON.stringify(asset.agent_processing_log || []), JSON.stringify(asset.parse_steps || []),
      asset.ai_analysis ? JSON.stringify(asset.ai_analysis) : null,
      asset.ai_enrichment ? JSON.stringify(asset.ai_enrichment) : null,
      asset.cross_reference_hints || [], asset.tags || []
    ]
  );
  return result.rows[0];
}

async function findById(id) {
  const result = await query('SELECT * FROM assets WHERE id = $1', [id]);
  return result.rows[0] ? hydrateAsset(result.rows[0]) : null;
}

async function findAll(filters = {}, page = 1, limit = 20) {
  const conditions = [];
  const params = [];
  let paramIdx = 1;

  if (filters.project_id) { conditions.push(`project_id = $${paramIdx++}`); params.push(filters.project_id); }
  if (filters.domain) { conditions.push(`content_domain = $${paramIdx++}`); params.push(filters.domain); }
  if (filters.classification) { conditions.push(`data_classification = $${paramIdx++}`); params.push(filters.classification); }
  if (filters.zone) { conditions.push(`classification_zone = $${paramIdx++}`); params.push(filters.zone); }
  if (filters.project_code) { conditions.push(`project_code = $${paramIdx++}`); params.push(filters.project_code); }
  if (filters.search) {
    conditions.push(`(file_name ILIKE $${paramIdx} OR project_code ILIKE $${paramIdx} OR content_domain ILIKE $${paramIdx})`);
    params.push(`%${filters.search}%`);
    paramIdx++;
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const countResult = await query(`SELECT COUNT(*) as total FROM assets ${where}`, params);
  const total = parseInt(countResult.rows[0].total);

  const offset = (page - 1) * limit;
  const result = await query(
    `SELECT * FROM assets ${where} ORDER BY created_at DESC LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
    [...params, limit, offset]
  );

  return {
    assets: result.rows.map(hydrateAsset),
    total,
    page,
    pages: Math.ceil(total / limit),
  };
}

async function update(id, patch) {
  const allowedFields = [
    'lifecycle_state','data_classification','classification_confidence','classification_zone',
    'quality_score','ai_enriched','ai_analysis','ai_enrichment','pii_flag','domain_metadata',
    'agent_processing_log','retention_policy','cross_reference_hints','tags'
  ];
  const fields = Object.keys(patch).filter(k => allowedFields.includes(k));
  if (!fields.length) return findById(id);

  const sets = fields.map((f, i) => {
    const val = patch[f];
    return `${f} = $${i + 2}`;
  }).join(', ');
  const values = fields.map(f => {
    const v = patch[f];
    return typeof v === 'object' && v !== null ? JSON.stringify(v) : v;
  });

  const result = await query(
    `UPDATE assets SET ${sets}, updated_at = now() WHERE id = $1 RETURNING *`,
    [id, ...values]
  );
  return result.rows[0] ? hydrateAsset(result.rows[0]) : null;
}

async function findByContentHash(hash, projectId) {
  const result = await query(
    'SELECT * FROM assets WHERE content_hash = $1 AND project_id = $2',
    [hash, projectId]
  );
  return result.rows[0] ? hydrateAsset(result.rows[0]) : null;
}

async function getStats(projectId = null) {
  const where = projectId ? 'WHERE project_id = $1' : '';
  const params = projectId ? [projectId] : [];

  const result = await query(`
    SELECT
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE ai_enriched = true) as enriched,
      COUNT(*) FILTER (WHERE classification_zone = 'AUTONOMOUS') as autonomous,
      COUNT(*) FILTER (WHERE classification_zone = 'SUPERVISED' OR classification_zone = 'PENDING_REVIEW') as pending_review,
      COUNT(*) FILTER (WHERE (export_control->>'itar_applicable')::boolean = true) as itar_flagged,
      AVG(classification_confidence) as avg_confidence,
      AVG(quality_score) as avg_quality
    FROM assets ${where}
  `, params);

  const domainResult = await query(`SELECT content_domain, COUNT(*) as count FROM assets ${where} GROUP BY content_domain`, params);
  const classResult = await query(`SELECT data_classification, COUNT(*) as count FROM assets ${where} GROUP BY data_classification`, params);
  const zoneResult = await query(`SELECT classification_zone, COUNT(*) as count FROM assets ${where} GROUP BY classification_zone`, params);

  const row = result.rows[0];
  return {
    total: parseInt(row.total),
    enriched: parseInt(row.enriched),
    enriched_pct: row.total > 0 ? Math.round(parseInt(row.enriched) / parseInt(row.total) * 100) : 0,
    pipeline_health: row.total > 0 ? Math.round(parseInt(row.autonomous) / parseInt(row.total) * 100) : 0,
    pending_approvals: parseInt(row.pending_review),
    itar_flagged: parseInt(row.itar_flagged),
    avg_confidence: parseFloat(parseFloat(row.avg_confidence || 0).toFixed(2)),
    avg_quality: parseFloat(parseFloat(row.avg_quality || 0).toFixed(2)),
    domain_counts: Object.fromEntries(domainResult.rows.map(r => [r.content_domain, parseInt(r.count)])),
    class_counts: Object.fromEntries(classResult.rows.map(r => [r.data_classification, parseInt(r.count)])),
    zone_counts: Object.fromEntries(zoneResult.rows.map(r => [r.classification_zone, parseInt(r.count)])),
    active_agents: 0,
    total_agents: 10,
  };
}

// Hydrate JSONB fields from DB rows to plain objects
function hydrateAsset(row) {
  if (!row) return null;
  const domainMeta = typeof row.domain_metadata === 'string' ? JSON.parse(row.domain_metadata) : (row.domain_metadata || {});

  // Reconstruct the muas_* key that the frontend expects
  const domKey = row.content_domain?.toLowerCase().replace('_document','').replace('_circuit','').replace('_recording','') || '';
  const muasKey = domKey ? `muas_${domKey}` : null;

  const asset = {
    ...row,
    file_size_mb: row.file_size_bytes ? parseFloat((row.file_size_bytes / 1024 / 1024).toFixed(3)) : 0,
    asset_type: row.asset_format || row.asset_type,
    export_control: typeof row.export_control === 'string' ? JSON.parse(row.export_control) : (row.export_control || {}),
    pii_flag: typeof row.pii_flag === 'string' ? JSON.parse(row.pii_flag) : (row.pii_flag || {}),
    retention_policy: typeof row.retention_policy === 'string' ? JSON.parse(row.retention_policy) : (row.retention_policy || {}),
    domain_metadata: domainMeta,
    agent_processing_log: typeof row.agent_processing_log === 'string' ? JSON.parse(row.agent_processing_log) : (row.agent_processing_log || []),
    parse_steps: typeof row.parse_steps === 'string' ? JSON.parse(row.parse_steps) : (row.parse_steps || []),
    ai_analysis: typeof row.ai_analysis === 'string' ? JSON.parse(row.ai_analysis) : row.ai_analysis,
    ai_enrichment: typeof row.ai_enrichment === 'string' ? JSON.parse(row.ai_enrichment) : row.ai_enrichment,
  };

  // Set the muas_* key so frontend can find domain-specific metadata
  if (muasKey && Object.keys(domainMeta).length > 0) {
    asset[muasKey] = domainMeta;
  }

  return asset;
}

module.exports = { create, findById, findAll, update, findByContentHash, getStats, hydrateAsset };
