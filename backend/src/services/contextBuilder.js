// Agent Context Builder — constructs rich context packages per the Enterprise Spec Section 5.2
// Provides project context, policy context, precedent context, and operational context

async function buildArbiterContext(asset, catalog) {
  const context = {
    asset: buildAssetContext(asset),
    project: await buildProjectContext(asset.project_id),
    policies: await buildPolicyContext(asset.project_id),
    precedents: await buildPrecedentContext(asset.project_id, asset.content_domain),
    operational: buildOperationalContext(catalog),
    glossary: await buildGlossaryContext(asset),
  };
  return context;
}

function buildAssetContext(asset) {
  return {
    id: asset.id,
    file_name: asset.file_name,
    full_path: asset.full_path || asset.vault_path,
    content_domain: asset.content_domain,
    asset_format: asset.asset_type || asset.asset_format,
    file_size_mb: asset.file_size_mb,
    created_at: asset.created_at,
    modified_at: asset.modified_at,
    classification_confidence: asset.classification_confidence,
    data_classification: asset.data_classification,
    classification_zone: asset.classification_zone,
    lifecycle_state: asset.lifecycle_state,
    domain_metadata: asset.domain_metadata || {},
    ai_analysis: asset.ai_analysis ? { content_summary: asset.ai_analysis.content_summary, key_topics: asset.ai_analysis.key_topics } : null,
  };
}

async function buildProjectContext(projectId) {
  if (!projectId) return { name: 'Default', sensitivity_ceiling: 'TRADE_SECRET' };
  try {
    const projectRepo = require('../db/repositories/projectRepo');
    const project = await projectRepo.findById(projectId);
    if (!project) return { name: 'Unknown', sensitivity_ceiling: 'TRADE_SECRET' };
    const members = await projectRepo.getMembers(projectId);
    const settings = typeof project.settings === 'string' ? JSON.parse(project.settings) : (project.settings || {});
    return {
      id: project.id,
      name: project.name,
      code: project.code,
      sensitivity_ceiling: project.sensitivity_ceiling,
      status: project.status,
      sla_supervised_hours: settings.sla_supervised_hours || 48,
      sla_gated_hours: settings.sla_gated_hours || 24,
      steward_count: members.filter(m => m.role === 'STEWARD' || m.role === 'OWNER').length,
      created_at: project.created_at,
    };
  } catch { return { name: 'Default', sensitivity_ceiling: 'TRADE_SECRET' }; }
}

async function buildPolicyContext(projectId) {
  try {
    const { query } = require('../db/pool');
    const result = await query(
      `SELECT rule_code, description, signals, recommended_tier, priority, enabled
       FROM policy_rules WHERE (project_id = $1 OR project_id IS NULL) AND enabled = true
       ORDER BY priority ASC`,
      [projectId]
    );
    return result.rows;
  } catch {
    // Fallback to in-memory rules
    const { RULES } = require('./policyEngine');
    return RULES;
  }
}

async function buildPrecedentContext(projectId, domain, limit = 10) {
  try {
    const { query } = require('../db/pool');
    const result = await query(
      `SELECT cd.tier, cd.confidence, cd.zone, cd.signals_detected, cd.rationale,
              cd.decided_by_type, cd.created_at, a.file_name, a.content_domain
       FROM classification_decisions cd
       JOIN assets a ON cd.asset_id = a.id
       WHERE a.project_id = $1 AND cd.decided_by_type = 'HUMAN'
       ${domain ? 'AND a.content_domain = $3' : ''}
       ORDER BY cd.created_at DESC LIMIT $2`,
      domain ? [projectId, limit, domain] : [projectId, limit]
    );
    return result.rows.map(r => ({
      file_name: r.file_name,
      content_domain: r.content_domain,
      decided_tier: r.tier,
      confidence: r.confidence,
      signals: r.signals_detected,
      rationale: r.rationale,
      decided_by: r.decided_by_type,
      decided_at: r.created_at,
    }));
  } catch { return []; }
}

function buildOperationalContext(catalog) {
  const { approvalQueue } = require('../data/seedData');
  const pending = approvalQueue ? approvalQueue.filter(q => q.status === 'PENDING') : [];
  return {
    queue_depth: pending.length,
    catalog_size: catalog ? catalog.length : 0,
    sla_items_at_risk: pending.filter(q => {
      const deadline = new Date(q.expires_at);
      return (deadline.getTime() - Date.now()) < 12 * 3600000;
    }).length,
  };
}

async function buildGlossaryContext(asset) {
  try {
    const { matchGlossaryTerms, loadGlossaryTerms } = require('./policyEngine');
    const allTerms = await loadGlossaryTerms();
    if (!allTerms.length) return { terms_count: 0, matched: [] };

    // Find which glossary terms match this asset
    const dm = asset.domain_metadata || {};
    const match = await matchGlossaryTerms(
      asset.file_name,
      dm.text_preview || '',
      asset.ai_analysis?.content_summary || ''
    );

    return {
      terms_count: allTerms.length,
      matched: match.matched_terms,
      injected_signals: match.injected_signals,
      // Include full glossary for agent context (terms with related_signals that affect classification)
      classification_relevant: allTerms
        .filter(t => t.related_signals?.length > 0)
        .map(t => ({ term: t.term, category: t.category, signals: t.related_signals })),
    };
  } catch { return { terms_count: 0, matched: [] }; }
}

module.exports = { buildArbiterContext, buildAssetContext, buildProjectContext, buildPolicyContext, buildPrecedentContext, buildOperationalContext, buildGlossaryContext };
