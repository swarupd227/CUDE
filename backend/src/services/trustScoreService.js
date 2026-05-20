// Trust Score — a composite 0-100 data-health metric per asset.
//
// Answers the CDO's core question: "Can I trust this data?" by combining
// five dimensions into a single grade with a transparent breakdown:
//
//   1. Confidence   (25%) — classification confidence from the policy engine
//   2. Freshness    (20%) — how recently the asset was scanned / modified
//   3. Lineage      (20%) — does it trace to a source / have known consumers?
//   4. Ownership    (15%) — is a steward / owner / designer assigned?
//   5. Governance   (20%) — quality score, PII handling, classification posture
//
// The score is intentionally explainable: every component returns its own
// 0-100 sub-score plus a one-line reason, so the UI can show *why* an asset
// scored the way it did.

const { query: dbQuery } = require('../db/pool');

const WEIGHTS = {
  confidence: 0.25,
  freshness:  0.20,
  lineage:    0.20,
  ownership:  0.15,
  governance: 0.20,
};

const DAY = 24 * 60 * 60 * 1000;

function clamp(n, lo = 0, hi = 100) { return Math.max(lo, Math.min(hi, n)); }

function gradeFor(score) {
  if (score >= 90) return 'A';
  if (score >= 75) return 'B';
  if (score >= 60) return 'C';
  if (score >= 40) return 'D';
  return 'F';
}

// ── Per-component scorers ────────────────────────────────────────────────────

function scoreConfidence(asset) {
  const conf = Number(asset.classification_confidence) || 0;
  const pct = conf <= 1 ? conf * 100 : conf; // tolerate 0-1 or 0-100
  const score = clamp(Math.round(pct));
  let detail;
  if (!asset.data_classification) detail = 'Not yet classified';
  else if (pct >= 90) detail = `High-confidence ${asset.data_classification} (${score}%)`;
  else if (pct >= 70) detail = `${asset.data_classification} classified at ${score}% confidence`;
  else detail = `Low-confidence classification (${score}%) — needs review`;
  return { score, detail };
}

function scoreFreshness(asset) {
  const ts = asset.modified_at || asset.updated_at || asset.discovered_at || asset.created_at;
  if (!ts) return { score: 50, detail: 'No timestamp available' };
  const ageDays = (Date.now() - new Date(ts).getTime()) / DAY;
  let score, detail;
  if (ageDays <= 30)        { score = 100; detail = `Scanned within the last 30 days`; }
  else if (ageDays <= 90)   { score = 85;  detail = `Last refreshed ~${Math.round(ageDays)} days ago`; }
  else if (ageDays <= 180)  { score = 65;  detail = `Stale — ${Math.round(ageDays)} days since last scan`; }
  else if (ageDays <= 365)  { score = 45;  detail = `Stale — over ${Math.round(ageDays / 30)} months old`; }
  else                      { score = 25;  detail = `Very stale — over a year since last scan`; }
  return { score: clamp(score), detail };
}

function scoreLineage(asset, ctx) {
  const isStructured = asset.content_domain === 'STRUCTURED_DATA';
  if (isStructured) {
    const cols = ctx.columnCount || 0;
    const edges = ctx.lineageEdgeCount || 0;
    if (cols === 0) return { score: 30, detail: 'No column metadata captured' };
    if (edges === 0) return { score: 60, detail: `${cols} columns, but no column lineage traced` };
    return { score: 100, detail: `${cols} columns with ${edges} lineage edges traced` };
  }
  // Documents / media: relationship coverage in the knowledge graph
  const rels = ctx.relationshipCount || 0;
  if (rels === 0) return { score: 40, detail: 'No relationships — isolated asset' };
  if (rels < 3)   return { score: 70, detail: `${rels} relationship(s) mapped` };
  return { score: 100, detail: `${rels} relationships mapped in the graph` };
}

function scoreOwnership(asset, ctx) {
  const hasDesigner = asset.designer && asset.designer !== 'unknown@company.com' && asset.designer !== 'unknown';
  const hasProject = !!asset.project_id && asset.project_code !== 'UNASSIGNED';
  const hasOwner = ctx.projectHasOwner;
  if (hasDesigner && hasProject && hasOwner) return { score: 100, detail: 'Owner, project and steward all assigned' };
  if (hasProject && hasOwner) return { score: 85, detail: 'Governed by a project with an assigned owner' };
  if (hasProject) return { score: 65, detail: 'Assigned to a project, no named steward' };
  if (hasDesigner) return { score: 55, detail: `Designer set (${String(asset.designer).split('@')[0]}), no project` };
  return { score: 25, detail: 'No owner, steward or project assigned' };
}

function scoreGovernance(asset, ctx) {
  let score = 100;
  const reasons = [];

  // Quality score from parsing (0-1)
  const q = Number(asset.quality_score) || 0;
  const qPct = q <= 1 ? q * 100 : q;
  if (qPct > 0 && qPct < 70) { score -= 15; reasons.push(`low parse quality (${Math.round(qPct)}%)`); }

  // PII handling: PII present but classified PUBLIC/INTERNAL is a red flag
  const pii = asset.pii_flag || {};
  const piiCols = ctx.piiColumnCount || 0;
  const hasPii = pii.contains_pii || piiCols > 0;
  if (hasPii) {
    const cls = asset.data_classification;
    if (cls === 'PUBLIC' || cls === 'INTERNAL' || !cls) {
      score -= 35; reasons.push(`PII present but classified ${cls || 'unclassified'}`);
    } else {
      reasons.push(`PII present, appropriately classified ${cls}`);
    }
  }

  // Schema violations (missing required props etc.) passed in via context
  if (ctx.violationCount > 0) { score -= Math.min(30, ctx.violationCount * 10); reasons.push(`${ctx.violationCount} schema violation(s)`); }

  // Not enriched by AI yet — minor governance gap
  if (!asset.ai_enriched) { score -= 8; reasons.push('not yet AI-enriched'); }

  score = clamp(score);
  const detail = reasons.length ? reasons.join('; ') : 'No governance issues detected';
  return { score, detail };
}

// ── Composite ────────────────────────────────────────────────────────────────

function scoreAsset(asset, ctx = {}) {
  const components = {
    confidence: { label: 'Classification Confidence', weight: WEIGHTS.confidence, ...scoreConfidence(asset) },
    freshness:  { label: 'Freshness',                 weight: WEIGHTS.freshness,  ...scoreFreshness(asset) },
    lineage:    { label: 'Lineage Coverage',          weight: WEIGHTS.lineage,    ...scoreLineage(asset, ctx) },
    ownership:  { label: 'Ownership & Stewardship',   weight: WEIGHTS.ownership,  ...scoreOwnership(asset, ctx) },
    governance: { label: 'Governance & Quality',      weight: WEIGHTS.governance, ...scoreGovernance(asset, ctx) },
  };

  const total = Object.values(components).reduce((s, c) => s + c.score * c.weight, 0);
  const score = Math.round(total);

  return {
    score,
    grade: gradeFor(score),
    components: Object.entries(components).map(([key, c]) => ({
      key, label: c.label,
      score: c.score,
      weight: Math.round(c.weight * 100),
      detail: c.detail,
    })),
  };
}

// ── Batch helpers — fetch context counts for many assets at once ────────────

async function buildContext(assetIds) {
  const ctx = {}; // assetId -> { columnCount, piiColumnCount, lineageEdgeCount, relationshipCount, projectHasOwner }
  if (!assetIds.length) return ctx;
  for (const id of assetIds) ctx[id] = { columnCount: 0, piiColumnCount: 0, lineageEdgeCount: 0, relationshipCount: 0, projectHasOwner: false };

  try {
    const cols = await dbQuery(
      `SELECT asset_id, COUNT(*) AS c, SUM(CASE WHEN is_pii THEN 1 ELSE 0 END) AS pii
       FROM asset_columns WHERE asset_id = ANY($1::uuid[]) GROUP BY asset_id`,
      [assetIds]
    );
    cols.rows.forEach(r => { if (ctx[r.asset_id]) { ctx[r.asset_id].columnCount = parseInt(r.c); ctx[r.asset_id].piiColumnCount = parseInt(r.pii) || 0; } });
  } catch (_) {}

  try {
    const edges = await dbQuery(
      `SELECT ac.asset_id, COUNT(*) AS c
       FROM column_lineage cl
       JOIN asset_columns ac ON ac.id IN (cl.upstream_column_id, cl.downstream_column_id)
       WHERE ac.asset_id = ANY($1::uuid[]) GROUP BY ac.asset_id`,
      [assetIds]
    );
    edges.rows.forEach(r => { if (ctx[r.asset_id]) ctx[r.asset_id].lineageEdgeCount = parseInt(r.c); });
  } catch (_) {}

  try {
    const rels = await dbQuery(
      `SELECT aid AS asset_id, COUNT(*) AS c FROM (
         SELECT source_asset_id AS aid FROM asset_relationships WHERE source_asset_id = ANY($1::uuid[])
         UNION ALL
         SELECT target_asset_id AS aid FROM asset_relationships WHERE target_asset_id = ANY($1::uuid[])
       ) t GROUP BY aid`,
      [assetIds]
    );
    rels.rows.forEach(r => { if (ctx[r.asset_id]) ctx[r.asset_id].relationshipCount = parseInt(r.c); });
  } catch (_) {}

  return ctx;
}

// Score a list of asset rows; returns the same rows with a `trust` field attached.
async function scoreAssets(assets) {
  if (!assets || !assets.length) return assets || [];
  const ids = assets.map(a => a.id).filter(Boolean);
  const ctx = await buildContext(ids);

  // Which projects have an owner? (one query)
  const projectOwners = new Set();
  try {
    const projIds = [...new Set(assets.map(a => a.project_id).filter(Boolean))];
    if (projIds.length) {
      const r = await dbQuery(`SELECT id FROM projects WHERE id = ANY($1::uuid[]) AND owner_id IS NOT NULL`, [projIds]);
      r.rows.forEach(row => projectOwners.add(row.id));
    }
  } catch (_) {}

  return assets.map(a => {
    const c = ctx[a.id] || {};
    c.projectHasOwner = projectOwners.has(a.project_id);
    return { ...a, trust: scoreAsset(a, c) };
  });
}

// Score a single asset with a full context fetch.
async function scoreSingle(asset) {
  const [scored] = await scoreAssets([asset]);
  return scored.trust;
}

module.exports = { scoreAsset, scoreAssets, scoreSingle, buildContext, gradeFor };
